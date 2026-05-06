package api

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"net/url"

	ctxkey "Threadr/ctxkeys"
	"Threadr/daos"
	"Threadr/logger"
	"Threadr/models"

	"github.com/aws/smithy-go"
	"github.com/gorilla/mux"
)

func ChapterTableStatusEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		email              string
		storyID, chapterID string
		err                error
		dao                daos.DaoInterface
		ok                 bool
	)

	if email, err = getUserEmail(r); err != nil {
		logger.Error("Authentication failed", "error", err)
		RespondWithError(w, http.StatusUnauthorized, "Authentication failed")
		return
	}
	if storyID, err = url.PathUnescape(mux.Vars(r)["storyID"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing story ID")
		return
	}
	if storyID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing story id")
		return
	}
	if chapterID, err = url.PathUnescape(mux.Vars(r)["chapterID"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing chapter ID")
		return
	}
	if chapterID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing chapter id")
		return
	}
	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}
	// Verify the user owns this story before returning chapter status
	if _, err = dao.GetStoryByID(r.Context(), email, storyID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			RespondWithError(w, http.StatusNotFound, "story not found")
			return
		}
		RespondWithError(w, http.StatusForbidden, "You do not have permission to access this story")
		return
	}
	isTableReady, err := dao.GetChapterTableStatus(r.Context())
	if err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	if !isTableReady {
		RespondWithError(w, http.StatusNotImplemented, "table not ready")
		return
	}
	RespondWithJSON(w, http.StatusOK, "")
}

func ChapterDetailsEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		email              string
		storyID, chapterID string
		err                error
		dao                daos.DaoInterface
		ok                 bool
	)

	if email, err = getUserEmail(r); err != nil {
		logger.Error("Authentication failed", "error", err)
		RespondWithError(w, http.StatusUnauthorized, "Authentication failed")
		return
	}
	if storyID, err = url.PathUnescape(mux.Vars(r)["storyID"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing story ID")
		return
	}
	if storyID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing story id")
		return
	}
	if chapterID, err = url.PathUnescape(mux.Vars(r)["chapterID"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing chapter ID")
		return
	}
	if chapterID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing chapter id")
		return
	}
	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}
	// Verify the user owns this story before returning chapter details
	if _, err = dao.GetStoryByID(r.Context(), email, storyID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			RespondWithError(w, http.StatusNotFound, "story not found")
			return
		}
		RespondWithError(w, http.StatusForbidden, "You do not have permission to access this story")
		return
	}
	var chapter *models.Chapter
	chapter, err = dao.GetChapterByID(r.Context(), chapterID)
	if err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	// Attach comment count (best-effort, don't fail if comments table doesn't exist)
	if comments, cErr := dao.GetCommentsByStoryChapter(r.Context(), storyID, chapterID); cErr == nil {
		count := 0
		for _, c := range comments {
			if !c.Resolved {
				count++
			}
		}
		chapter.CommentCount = count
	}
	RespondWithJSON(w, http.StatusOK, chapter)
}

func StoryBlocksEndPoint(w http.ResponseWriter, r *http.Request) {
	chapterID := r.URL.Query().Get("chapter")
	var (
		email   string
		err     error
		storyID string
		dao     daos.DaoInterface
		ok      bool
	)
	if email, err = getUserEmail(r); err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	if storyID, err = url.PathUnescape(mux.Vars(r)["storyID"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing story ID")
		return
	}
	if storyID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing story ID")
		return
	}
	if chapterID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing chapter ID")
		return
	}
	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}
	if ok, err = dao.WasStoryDeleted(r.Context(), email, storyID); err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	if ok {
		RespondWithError(w, http.StatusNotFound, "story not found")
		return
	}
	blocks, err := dao.GetChapterParagraphs(r.Context(), storyID, chapterID, nil)
	if err != nil {
		opErr := &smithy.OperationError{}
		if errors.As(err, &opErr) {
			awsResponse := processAWSError(opErr)
			if awsResponse.Code == 0 {
				logger.Error("Internal error", "error", err)
				RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
				return
			}
			RespondWithError(w, awsResponse.Code, awsResponse.Message)
			return
		}
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	if blocks == nil || len(blocks.Items) == 0 {
		RespondWithError(w, http.StatusNotFound, "no content")
		return
	}
	RespondWithJSON(w, http.StatusOK, blocks)
}

func FullStoryEndPoint(w http.ResponseWriter, r *http.Request) {
	var (
		email   string
		err     error
		storyID string
		dao     daos.DaoInterface
		ok      bool
	)
	if email, err = getUserEmail(r); err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	if storyID, err = url.PathUnescape(mux.Vars(r)["storyID"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing story ID")
		return
	}
	if storyID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing story id")
		return
	}
	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}
	if ok, err = dao.WasStoryDeleted(r.Context(), email, storyID); err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	if ok {
		RespondWithError(w, http.StatusNotFound, "story not found")
		return
	}

	story, err := dao.GetStoryByID(r.Context(), email, storyID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			RespondWithError(w, http.StatusNotFound, "story not found")
			return
		}
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	fullStory := models.FullStoryContent{}
	fullStory.StoryTitle = story.Title

	for _, chap := range story.Chapters {
		chapWithContents := models.ChapterWithContents{}
		chapWithContents.Chapter = chap
		chapWithContents.Blocks, err = staggeredStoryBlockRetrieval(r.Context(), dao, storyID, chap.ID, nil, nil)
		if err != nil {
			logger.Error("Internal error", "error", err)
			RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
			return
		}
		fullStory.ChaptersWithContents = append(fullStory.ChaptersWithContents, chapWithContents)
	}
	RespondWithJSON(w, http.StatusOK, fullStory)
}

func StoryEndPoint(w http.ResponseWriter, r *http.Request) {
	var (
		email   string
		err     error
		storyID string
		dao     daos.DaoInterface
		ok      bool
	)
	if email, err = getUserEmail(r); err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	if storyID, err = url.PathUnescape(mux.Vars(r)["storyID"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing story name")
		return
	}
	if storyID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing story id")
		return
	}

	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}
	if ok, err = dao.WasStoryDeleted(r.Context(), email, storyID); err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	if ok {
		RespondWithError(w, http.StatusNotFound, "story not found")
		return
	}
	story, err := dao.GetStoryByID(r.Context(), email, storyID)
	if err != nil {
		opErr := &smithy.OperationError{}
		if errors.As(err, &opErr) {
			awsResponse := processAWSError(opErr)
			if awsResponse.Code == 0 {
				logger.Error("Internal error", "error", err)
				RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
				return
			}
			RespondWithError(w, awsResponse.Code, awsResponse.Message)
			return
		}
		if errors.Is(err, sql.ErrNoRows) {
			RespondWithError(w, http.StatusNotFound, "story not found")
			return
		}
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	RespondWithJSON(w, http.StatusOK, story)
}

func StorySettingsEndPoint(w http.ResponseWriter, r *http.Request) {
	var (
		email   string
		err     error
		storyID string
		dao     daos.DaoInterface
		ok      bool
	)
	if email, err = getUserEmail(r); err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	if storyID, err = url.PathUnescape(mux.Vars(r)["storyID"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing story name")
		return
	}
	if storyID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing story id")
		return
	}
	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	storySettings, err := dao.GetStorySettingsByID(r.Context(), email, storyID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			RespondWithError(w, http.StatusNotFound, "settings not found")
			return
		}
		opErr := &smithy.OperationError{}
		if errors.As(err, &opErr) {
			awsResponse := processAWSError(opErr)
			if awsResponse.Code == 0 {
				logger.Error("Internal error", "error", err)
				RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
				return
			}
			RespondWithError(w, awsResponse.Code, awsResponse.Message)
			return
		}
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	RespondWithJSON(w, http.StatusOK, storySettings)
}

// listResource is the shared "list everything for the authenticated user" flow:
// auth + DAO context + user-existence check + DAO list call + AWS-error-aware
// response. It runs the supplied fetch closure and writes the result as JSON.
func listResource[T any](
	w http.ResponseWriter,
	r *http.Request,
	fetch func(ctx context.Context, dao daos.DaoInterface, email string) ([]T, error),
) {
	email, err := getUserEmail(r)
	if err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	dao, ok := r.Context().Value(ctxkey.DAO).(daos.DaoInterface)
	if !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}
	if _, err = dao.GetUserDetails(r.Context(), email); err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}

	result, err := fetch(r.Context(), dao, email)
	if err != nil {
		opErr := &smithy.OperationError{}
		if errors.As(err, &opErr) {
			awsResponse := processAWSError(opErr)
			if awsResponse.Code == 0 {
				logger.Error("Internal error", "error", err)
				RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
				return
			}
			RespondWithError(w, awsResponse.Code, awsResponse.Message)
			return
		}
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}

	RespondWithJSON(w, http.StatusOK, result)
}

func AllStandaloneStoriesEndPoint(w http.ResponseWriter, r *http.Request) {
	listResource(w, r, func(ctx context.Context, dao daos.DaoInterface, email string) ([]models.Story, error) {
		return dao.GetAllStandalone(ctx, email)
	})
}

func AssociationDetailsEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		email         string
		storyID       string
		err           error
		associationID string
		dao           daos.DaoInterface
		ok            bool
	)
	if email, err = getUserEmail(r); err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	if storyID, err = url.PathUnescape(mux.Vars(r)["storyID"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing story id")
		return
	}
	if storyID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing story id")
		return
	}
	if associationID, err = url.PathUnescape(mux.Vars(r)["associationID"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing association id")
		return
	}
	if associationID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing association id")
		return
	}
	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}
	association, err := dao.GetAssociationDetails(r.Context(), email, storyID, associationID)
	if err != nil {
		opErr := &smithy.OperationError{}
		if errors.As(err, &opErr) {
			awsResponse := processAWSError(opErr)
			if awsResponse.Code == 0 {
				logger.Error("Internal error", "error", err)
				RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
				return
			}
			RespondWithError(w, awsResponse.Code, awsResponse.Message)
			return
		}
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	RespondWithJSON(w, http.StatusOK, association)
}

func AllAssociationThumbnailsByStoryEndPoint(w http.ResponseWriter, r *http.Request) {
	var (
		email   string
		err     error
		storyID string
		dao     daos.DaoInterface
		ok      bool
	)
	if email, err = getUserEmail(r); err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	if storyID, err = url.PathUnescape(mux.Vars(r)["storyID"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing story id")
		return
	}
	if storyID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing story id")
		return
	}
	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}
	associations, err := dao.GetStoryOrSeriesAssociationThumbnails(r.Context(), email, storyID)
	if err != nil {
		opErr := &smithy.OperationError{}
		if errors.As(err, &opErr) {
			awsResponse := processAWSError(opErr)
			if awsResponse.Code == 0 {
				logger.Error("Internal error", "error", err)
				RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
				return
			}
			RespondWithError(w, awsResponse.Code, awsResponse.Message)
			return
		}
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	if len(associations) == 0 {
		RespondWithError(w, http.StatusNotFound, "no associations found for this story")
		return
	}
	RespondWithJSON(w, http.StatusOK, associations)
}

func SingleSeriesEndPoint(w http.ResponseWriter, r *http.Request) {
	var (
		email    string
		err      error
		dao      daos.DaoInterface
		ok       bool
		seriesID string
	)
	if email, err = getUserEmail(r); err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}
	if seriesID, err = url.PathUnescape(mux.Vars(r)["series"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing series id")
		return
	}
	if seriesID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing series id")
		return
	}
	series, err := dao.GetSeriesByID(r.Context(), email, seriesID)
	if err != nil {
		opErr := &smithy.OperationError{}
		if errors.As(err, &opErr) {
			awsResponse := processAWSError(opErr)
			if awsResponse.Code == 0 {
				logger.Error("Internal error", "error", err)
				RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
				return
			}
			RespondWithError(w, awsResponse.Code, awsResponse.Message)
			return
		}
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	RespondWithJSON(w, http.StatusOK, series)
}

func AllSeriesEndPoint(w http.ResponseWriter, r *http.Request) {
	listResource(w, r, func(ctx context.Context, dao daos.DaoInterface, email string) ([]models.Series, error) {
		return dao.GetAllSeriesWithStories(ctx, email)
	})
}

func AllSeriesVolumesEndPoint(w http.ResponseWriter, r *http.Request) {
	var (
		seriesTitle string
		err         error
		dao         daos.DaoInterface
		ok          bool
	)
	if _, err = getUserEmail(r); err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	if seriesTitle, err = url.PathUnescape(mux.Vars(r)["series"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing series name")
		return
	}
	if seriesTitle == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing series name")
		return
	}
	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}
	volumes, err := dao.GetSeriesVolumes(r.Context(), seriesTitle)
	if err != nil {
		opErr := &smithy.OperationError{}
		if errors.As(err, &opErr) {
			awsResponse := processAWSError(opErr)
			if awsResponse.Code == 0 {
				logger.Error("Internal error", "error", err)
				RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
				return
			}
			RespondWithError(w, awsResponse.Code, awsResponse.Message)
			return
		}
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	// All chapters now use the unified story_blocks table, no need to check individual table status
	RespondWithJSON(w, http.StatusOK, volumes)
}

func GetUserData(w http.ResponseWriter, r *http.Request) {
	// Use GetAuthenticatedUser to handle both mobile (Bearer token) and web (cookie) auth
	user, err := GetAuthenticatedUser(r)
	if err != nil {
		logger.Error("Authentication failed", "error", err)
		RespondWithError(w, http.StatusUnauthorized, "Authentication failed")
		return
	}

	var ok bool
	var dao daos.DaoInterface
	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve daokey from context")
		return
	}

	// Fetch fresh user details from database
	details, err := dao.GetUserDetails(r.Context(), user.Email)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			RespondWithError(w, http.StatusNotFound, "user not found")
			return
		}
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}

	// Check URL parameters for new/returning user flags (set by auth callback)
	queryParams := r.URL.Query()
	if queryParams.Get("new_user") == "true" {
		details.NewUser = true
	}
	if queryParams.Get("returning_user") == "true" {
		details.ReturningUser = true
	}

	// Return the fresh details from database (not the cached session data)
	RespondWithJSON(w, http.StatusOK, details)
}

// AdminGetAllUsersEndpoint returns all users with their stories (admin only).
func AdminGetAllUsersEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		email string
		err   error
		dao   daos.DaoInterface
		ok    bool
	)

	if email, err = getUserEmail(r); err != nil {
		logger.Error("Authentication failed", "error", err)
		RespondWithError(w, http.StatusUnauthorized, "Authentication failed")
		return
	}

	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	// Check if requesting user is an admin
	userDetails, err := dao.GetUserDetails(r.Context(), email)
	if err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	if !userDetails.Admin {
		RespondWithError(w, http.StatusForbidden, "admin access required")
		return
	}

	// Get all users with their stories
	users, err := dao.GetAllUsersWithStories(r.Context())
	if err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}

	RespondWithJSON(w, http.StatusOK, users)
}

// AdminDeleteUserEndpoint soft-deletes a user account (admin only).
func AdminDeleteUserEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		email string
		err   error
		dao   daos.DaoInterface
		ok    bool
	)

	if email, err = getUserEmail(r); err != nil {
		logger.Error("Authentication failed", "error", err)
		RespondWithError(w, http.StatusUnauthorized, "Authentication failed")
		return
	}

	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	// Check if requesting user is an admin
	userDetails, err := dao.GetUserDetails(r.Context(), email)
	if err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	if !userDetails.Admin {
		RespondWithError(w, http.StatusForbidden, "admin access required")
		return
	}

	targetEmail, err := url.PathUnescape(mux.Vars(r)["email"])
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing email")
		return
	}
	if targetEmail == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing email")
		return
	}
	if targetEmail == email {
		RespondWithError(w, http.StatusBadRequest, "Cannot delete your own account from admin panel")
		return
	}

	if err = dao.DeleteUser(r.Context(), targetEmail); err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}

	RespondWithJSON(w, http.StatusOK, map[string]string{"message": "User deleted"})
}
