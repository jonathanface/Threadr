package api

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/mail"
	"net/url"
	"os"
	"time"

	ctxkey "Threadr/ctxkeys"
	"Threadr/daos"
	mailer "Threadr/email"
	"Threadr/logger"
	"Threadr/models"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
)

func generateShareToken() (string, error) {
	b := make([]byte, 32) //nolint:mnd
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.URLEncoding.WithPadding(base64.NoPadding).EncodeToString(b), nil
}

// HashShareToken returns a hex-encoded SHA-256 hash of a share token.
// The hash is stored as the DB key; the raw token is given to the user.
func HashShareToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}

// Authenticated endpoints (author-side)

func CreateShareLinkEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		storyID string
		err     error
		dao     daos.DaoInterface
		ok      bool
	)
	author, err := GetAuthenticatedUser(r)
	if err != nil {
		logger.Error("Authentication failed", "error", err)
		RespondWithError(w, http.StatusUnauthorized, "Authentication failed")
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
	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}
	// Verify the user owns this story
	story, err := dao.GetStoryByID(r.Context(), author.Email, storyID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			RespondWithError(w, http.StatusNotFound, "story not found")
			return
		}
		RespondWithError(w, http.StatusForbidden, "You do not have permission to share this story")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 4096) //nolint:mnd
	decoder := json.NewDecoder(r.Body)
	var req models.CreateShareLinkRequest
	if err = decoder.Decode(&req); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if req.ReaderEmail == "" {
		RespondWithError(w, http.StatusBadRequest, "Reader email is required")
		return
	}
	if _, err = mail.ParseAddress(req.ReaderEmail); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid email address")
		return
	}
	if req.ReaderEmail == author.Email {
		RespondWithError(w, http.StatusBadRequest, "You cannot invite yourself as a reader")
		return
	}
	if req.ReaderFirstName == "" || req.ReaderLastName == "" {
		RespondWithError(w, http.StatusBadRequest, "Reader first and last name are required")
		return
	}
	if len(req.ReaderFirstName) > 100 || len(req.ReaderLastName) > 100 {
		RespondWithError(w, http.StatusBadRequest, "Reader name must be 100 characters or less")
		return
	}

	// Check if this reader already has an active share link for this story
	existingLinks, err := dao.GetShareLinksByAuthor(r.Context(), author.Email, storyID)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	for _, existing := range existingLinks {
		if existing.ReaderEmail == req.ReaderEmail && !existing.Revoked {
			RespondWithError(w, http.StatusConflict, "This reader has already been invited")
			return
		}
	}

	rawToken, err := generateShareToken()
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to generate share token")
		return
	}
	tokenHash := HashShareToken(rawToken)

	link := models.ShareLink{
		Token:           tokenHash,
		StoryID:         storyID,
		ChapterID:       req.ChapterID,
		AuthorEmail:     author.Email,
		ReaderEmail:     req.ReaderEmail,
		ReaderFirstName: req.ReaderFirstName,
		ReaderLastName:  req.ReaderLastName,
		CreatedAt:       time.Now().Unix(),
		ExpiresAt:       req.ExpiresAt,
		Revoked:         false,
		CommentsEnabled: req.CommentsEnabled,
		Label:           req.Label,
	}

	if err = dao.CreateShareLink(r.Context(), link); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}

	// Send invite email (non-blocking — don't fail the request if email fails)
	go func() {
		frontendURL := os.Getenv("FRONTEND_URL")
		if frontendURL == "" {
			frontendURL = "https://threadr.net"
		}
		shareURL := fmt.Sprintf("%s/shared/%s", frontendURL, rawToken)
		authorName := author.FirstName + " " + author.LastName
		if emailErr := mailer.SendShareInviteEmail(
			link.ReaderEmail,
			link.ReaderFirstName,
			authorName,
			author.Email,
			story.Title,
			shareURL,
		); emailErr != nil {
			logger.Error("Failed to send share invite email",
				"error", emailErr,
				"readerEmail", link.ReaderEmail,
				"storyId", link.StoryID)
		}
	}()

	// Return the raw token (not hash) so the frontend can build share URLs
	response := link
	response.Token = rawToken
	RespondWithJSON(w, http.StatusCreated, response)
}

func GetShareLinksEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		email   string
		storyID string
		err     error
		dao     daos.DaoInterface
		ok      bool
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
		RespondWithError(w, http.StatusBadRequest, "Missing story ID")
		return
	}
	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}
	// Verify the user owns this story
	if _, err = dao.GetStoryByID(r.Context(), email, storyID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			RespondWithError(w, http.StatusNotFound, "story not found")
			return
		}
		RespondWithError(w, http.StatusForbidden, "You do not have permission to access this story")
		return
	}

	links, err := dao.GetShareLinksByAuthor(r.Context(), email, storyID)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	RespondWithJSON(w, http.StatusOK, links)
}

func RevokeShareLinkEndpoint(w http.ResponseWriter, r *http.Request) {
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
	rawToken, err := url.PathUnescape(mux.Vars(r)["token"])
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing token")
		return
	}
	if rawToken == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing token")
		return
	}
	tokenHash := HashShareToken(rawToken)
	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	link, err := dao.GetShareLink(r.Context(), tokenHash)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			RespondWithError(w, http.StatusNotFound, "share link not found")
			return
		}
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	if link.AuthorEmail != email {
		RespondWithError(w, http.StatusForbidden, "You do not have permission to revoke this share link")
		return
	}

	if err = dao.RevokeShareLink(r.Context(), tokenHash); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	RespondWithJSON(w, http.StatusOK, nil)
}

func RestoreShareLinkEndpoint(w http.ResponseWriter, r *http.Request) {
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
	rawToken, err := url.PathUnescape(mux.Vars(r)["token"])
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing token")
		return
	}
	if rawToken == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing token")
		return
	}
	tokenHash := HashShareToken(rawToken)
	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	link, err := dao.GetShareLink(r.Context(), tokenHash)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			RespondWithError(w, http.StatusNotFound, "share link not found")
			return
		}
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	if link.AuthorEmail != email {
		RespondWithError(w, http.StatusForbidden, "You do not have permission to restore this share link")
		return
	}

	if err = dao.RestoreShareLink(r.Context(), tokenHash); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	RespondWithJSON(w, http.StatusOK, nil)
}

func DeleteShareLinkEndpoint(w http.ResponseWriter, r *http.Request) {
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
	rawToken, err := url.PathUnescape(mux.Vars(r)["token"])
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing token")
		return
	}
	if rawToken == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing token")
		return
	}
	tokenHash := HashShareToken(rawToken)
	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	link, err := dao.GetShareLink(r.Context(), tokenHash)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			RespondWithError(w, http.StatusNotFound, "share link not found")
			return
		}
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	if link.AuthorEmail != email {
		RespondWithError(w, http.StatusForbidden, "You do not have permission to delete this share link")
		return
	}

	if err = dao.DeleteShareLink(r.Context(), tokenHash); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	RespondWithJSON(w, http.StatusOK, nil)
}

func GetAuthorCommentsEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		email   string
		storyID string
		err     error
		dao     daos.DaoInterface
		ok      bool
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
		RespondWithError(w, http.StatusBadRequest, "Missing story ID")
		return
	}
	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}
	// Verify the user owns this story
	if _, err = dao.GetStoryByID(r.Context(), email, storyID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			RespondWithError(w, http.StatusNotFound, "story not found")
			return
		}
		RespondWithError(w, http.StatusForbidden, "You do not have permission to access this story")
		return
	}

	chapterID := r.URL.Query().Get("chapter")
	if chapterID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing chapter query parameter")
		return
	}

	comments, err := dao.GetCommentsByStoryChapter(r.Context(), storyID, chapterID)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	// Strip share_token from responses to avoid leaking reader access credentials
	for i := range comments {
		comments[i].ShareToken = ""
	}
	RespondWithJSON(w, http.StatusOK, comments)
}

func ResolveCommentEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		email     string
		commentID string
		err       error
		dao       daos.DaoInterface
		ok        bool
	)
	if email, err = getUserEmail(r); err != nil {
		logger.Error("Authentication failed", "error", err)
		RespondWithError(w, http.StatusUnauthorized, "Authentication failed")
		return
	}
	if commentID, err = url.PathUnescape(mux.Vars(r)["commentID"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing comment ID")
		return
	}
	if commentID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing comment ID")
		return
	}
	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	// Verify the author owns the story this comment belongs to
	comment, err := dao.GetComment(r.Context(), commentID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			RespondWithError(w, http.StatusNotFound, "comment not found")
			return
		}
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	if _, err = dao.GetStoryByID(r.Context(), email, comment.StoryID); err != nil {
		RespondWithError(w, http.StatusForbidden, "You do not have permission to resolve this comment")
		return
	}

	if err = dao.ResolveComment(r.Context(), commentID); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	RespondWithJSON(w, http.StatusOK, nil)
}

func DeleteCommentEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		email     string
		commentID string
		err       error
		dao       daos.DaoInterface
		ok        bool
	)
	if email, err = getUserEmail(r); err != nil {
		logger.Error("Authentication failed", "error", err)
		RespondWithError(w, http.StatusUnauthorized, "Authentication failed")
		return
	}
	if commentID, err = url.PathUnescape(mux.Vars(r)["commentID"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing comment ID")
		return
	}
	if commentID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing comment ID")
		return
	}
	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	// Verify the author owns the story this comment belongs to
	comment, err := dao.GetComment(r.Context(), commentID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			RespondWithError(w, http.StatusNotFound, "comment not found")
			return
		}
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	if _, err = dao.GetStoryByID(r.Context(), email, comment.StoryID); err != nil {
		RespondWithError(w, http.StatusForbidden, "You do not have permission to delete this comment")
		return
	}

	if err = dao.DeleteComment(r.Context(), commentID); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	RespondWithJSON(w, http.StatusOK, nil)
}

// Public endpoints (reader-side, authenticated via share token)

func GetSharedStoryEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		dao daos.DaoInterface
		ok  bool
	)
	link, ok := r.Context().Value(ctxkey.ShareLink).(*models.ShareLink)
	if !ok || link == nil {
		RespondWithError(w, http.StatusUnauthorized, "Invalid share link")
		return
	}
	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	// Fetch story metadata using author's email (since reader doesn't own it)
	story, err := dao.GetStoryByID(r.Context(), link.AuthorEmail, link.StoryID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			RespondWithError(w, http.StatusNotFound, "story not found")
			return
		}
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}

	chapters, err := dao.GetChaptersByStoryID(r.Context(), link.StoryID)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}

	// If the share link is scoped to a specific chapter, filter
	if link.ChapterID != "" {
		filtered := make([]models.Chapter, 0, 1)
		for _, ch := range chapters {
			if ch.ID == link.ChapterID {
				filtered = append(filtered, ch)
				break
			}
		}
		chapters = filtered
	}

	// Look up author name (best-effort)
	authorName := ""
	if authorDetails, aErr := dao.GetUserDetails(r.Context(), link.AuthorEmail); aErr == nil {
		authorName = authorDetails.FirstName + " " + authorDetails.LastName
	}

	// Check if reader has an existing account (best-effort)
	readerHasAccount := false
	if _, rErr := dao.GetUserDetails(r.Context(), link.ReaderEmail); rErr == nil {
		readerHasAccount = true
	}

	// Return story metadata and chapters (no associations, outlines, or settings)
	response := map[string]any{
		"story_id":           story.ID,
		"title":              story.Title,
		"description":        story.Description,
		"image_url":          story.ImageURL,
		"author_name":        authorName,
		"chapters":           chapters,
		"comments_enabled":   link.CommentsEnabled,
		"reader_email":       link.ReaderEmail,
		"reader_first_name":  link.ReaderFirstName,
		"reader_last_name":   link.ReaderLastName,
		"reader_has_account": readerHasAccount,
	}
	RespondWithJSON(w, http.StatusOK, response)
}

func GetSharedContentEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		dao daos.DaoInterface
		ok  bool
	)
	link, ok := r.Context().Value(ctxkey.ShareLink).(*models.ShareLink)
	if !ok || link == nil {
		RespondWithError(w, http.StatusUnauthorized, "Invalid share link")
		return
	}
	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	chapterID := r.URL.Query().Get("chapter")
	if chapterID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing chapter query parameter")
		return
	}

	// If scoped to a specific chapter, enforce it
	if link.ChapterID != "" && chapterID != link.ChapterID {
		RespondWithError(w, http.StatusForbidden, "This share link does not grant access to this chapter")
		return
	}

	blocks, err := staggeredStoryBlockRetrieval(r.Context(), dao, link.StoryID, chapterID, nil, nil)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	RespondWithJSON(w, http.StatusOK, blocks)
}

func GetSharedCommentsEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		dao daos.DaoInterface
		ok  bool
	)
	link, ok := r.Context().Value(ctxkey.ShareLink).(*models.ShareLink)
	if !ok || link == nil {
		RespondWithError(w, http.StatusUnauthorized, "Invalid share link")
		return
	}
	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	allComments, err := dao.GetCommentsByShareToken(r.Context(), link.Token)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	// Only return this reader's own comments
	ownComments := make([]models.Comment, 0, len(allComments))
	for _, c := range allComments {
		if c.ReaderEmail == link.ReaderEmail {
			ownComments = append(ownComments, c)
		}
	}
	RespondWithJSON(w, http.StatusOK, ownComments)
}

func CreateCommentEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		dao daos.DaoInterface
		ok  bool
	)
	link, ok := r.Context().Value(ctxkey.ShareLink).(*models.ShareLink)
	if !ok || link == nil {
		RespondWithError(w, http.StatusUnauthorized, "Invalid share link")
		return
	}
	if !link.CommentsEnabled {
		RespondWithError(w, http.StatusForbidden, "Comments are not enabled for this share link")
		return
	}
	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 8192) //nolint:mnd
	decoder := json.NewDecoder(r.Body)
	var req models.CreateCommentRequest
	if err := decoder.Decode(&req); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if req.Body == "" {
		RespondWithError(w, http.StatusBadRequest, "Comment body is required")
		return
	}
	if len(req.Body) > 2000 { //nolint:mnd
		RespondWithError(w, http.StatusBadRequest, "Comment body must be 2000 characters or less")
		return
	}
	if len(req.AnchorTextSnapshot) > 500 { //nolint:mnd
		RespondWithError(w, http.StatusBadRequest, "Selected text snapshot must be 500 characters or less")
		return
	}
	if req.BlockKeyID == "" {
		RespondWithError(w, http.StatusBadRequest, "Block key ID is required")
		return
	}
	if req.ChapterID == "" {
		RespondWithError(w, http.StatusBadRequest, "Chapter ID is required")
		return
	}

	// If scoped to a specific chapter, enforce it
	if link.ChapterID != "" && req.ChapterID != link.ChapterID {
		RespondWithError(w, http.StatusForbidden, "This share link does not grant access to this chapter")
		return
	}

	comment := models.Comment{
		CommentID:          uuid.New().String(),
		ShareToken:         link.Token,
		StoryID:            link.StoryID,
		ChapterID:          req.ChapterID,
		BlockKeyID:         req.BlockKeyID,
		AnchorOffset:       req.AnchorOffset,
		FocusOffset:        req.FocusOffset,
		AnchorTextSnapshot: req.AnchorTextSnapshot,
		ReaderEmail:        link.ReaderEmail,
		ReaderFirstName:    link.ReaderFirstName,
		ReaderLastName:     link.ReaderLastName,
		Body:               req.Body,
		CreatedAt:          time.Now().Unix(),
		Resolved:           false,
	}

	if err := dao.CreateComment(r.Context(), comment); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	RespondWithJSON(w, http.StatusCreated, comment)

	// Notify the author about the new comment (deduped — one alert per reader per story until dismissed)
	go func() {
		bgCtx := context.Background()
		readerName := comment.ReaderFirstName + " " + comment.ReaderLastName
		storyTitle := link.StoryID // fallback
		if story, err := dao.GetStoryByID(bgCtx, link.AuthorEmail, link.StoryID); err == nil {
			storyTitle = story.Title
		}
		CreateCommentAlert(bgCtx, dao, link.AuthorEmail, readerName, storyTitle, link.StoryID)
	}()
}

func DeleteOwnCommentEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		commentID string
		err       error
		dao       daos.DaoInterface
		ok        bool
	)
	link, ok := r.Context().Value(ctxkey.ShareLink).(*models.ShareLink)
	if !ok || link == nil {
		RespondWithError(w, http.StatusUnauthorized, "Invalid share link")
		return
	}
	if commentID, err = url.PathUnescape(mux.Vars(r)["commentID"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing comment ID")
		return
	}
	if commentID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing comment ID")
		return
	}
	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	// Fetch the specific comment and verify ownership
	comment, err := dao.GetComment(r.Context(), commentID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			RespondWithError(w, http.StatusNotFound, "Comment not found")
			return
		}
		RespondWithError(w, http.StatusInternalServerError, "Failed to retrieve comment")
		return
	}
	if comment.ShareToken != link.Token || comment.ReaderEmail != link.ReaderEmail {
		RespondWithError(w, http.StatusForbidden, "You can only delete your own comments")
		return
	}

	if err = dao.DeleteComment(r.Context(), commentID); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	RespondWithJSON(w, http.StatusOK, nil)
}
