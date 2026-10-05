package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"slices"
	"strings"

	ctxkey "Threadr/ctxkeys"
	"Threadr/daos"
	"Threadr/logger"
	"Threadr/models"

	"github.com/aws/smithy-go"
	"github.com/gorilla/mux"
)

func DeleteBlocksFromStoryEndpoint(w http.ResponseWriter, r *http.Request) {
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
		RespondWithError(w, http.StatusBadRequest, "Missing story ID")
		return
	}
	decoder := json.NewDecoder(r.Body)
	storyBlocks := models.StoryBlocks{}
	if err = decoder.Decode(&storyBlocks); err != nil {
		logger.Error("Bad request", "error", err)
		RespondWithError(w, http.StatusBadRequest, "Invalid request")
		return
	}
	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}
	// Verify the user owns this story before allowing deletion
	if _, err = dao.GetStoryByID(r.Context(), email, storyID); err != nil {
		RespondWithError(w, http.StatusForbidden, "You do not have permission to delete content from this story")
		return
	}
	if err = dao.DeleteChapterParagraphs(r.Context(), storyID, &storyBlocks); err != nil {
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
	RespondWithJSON(w, http.StatusOK, nil)
}

func DeleteAssociationsEndpoint(w http.ResponseWriter, r *http.Request) {
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
	if storyID, err = url.PathUnescape(mux.Vars(r)["story"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing story name")
		return
	}
	if storyID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing story ID")
		return
	}
	decoder := json.NewDecoder(r.Body)
	associations := []*models.Association{}

	if err = decoder.Decode(&associations); err != nil {
		logger.Error("Bad request", "error", err)
		RespondWithError(w, http.StatusBadRequest, "Invalid request")
		return
	}

	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}
	if err = dao.DeleteAssociations(r.Context(), email, storyID, associations); err != nil {
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
	RespondWithJSON(w, http.StatusOK, nil)
}

func DeleteChaptersEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		email     string
		err       error
		storyID   string
		chapterID string
		dao       daos.DaoInterface
		ok        bool
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
	if chapterID, err = url.PathUnescape(mux.Vars(r)["chapterID"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing chapter ID")
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
	// Verify the user owns this story before allowing chapter deletion
	if _, err = dao.GetStoryByID(r.Context(), email, storyID); err != nil {
		RespondWithError(w, http.StatusForbidden, "You do not have permission to delete chapters from this story")
		return
	}
	var chapters []models.Chapter
	chapter := models.Chapter{}
	chapter.ID = chapterID
	chapters = append(chapters, chapter)
	if err = dao.DeleteChapters(r.Context(), storyID, chapters); err != nil {
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
	RespondWithJSON(w, http.StatusOK, nil)
}

// enforceDraftsDeleteGuards runs the drafts-related safety checks before a
// SoftDeleteStory call. Returns true if deletion may proceed, false if a
// response has already been written. Invariants enforced:
//   - Deleting the root while drafts still exist re-roots the ancestry
//     onto one of the remaining drafts so no draft is orphaned. The
//     frontend prompts the user for destructive confirmation before
//     calling this endpoint, so the handler proceeds without a second
//     confirm step.
//   - Deleting the current draft promotes the root back to current first
//     so the stories list and share links continue to point somewhere.
//
// ListDrafts is author-scoped and doubles as an ownership check for the
// ancestry; if the lookup errors out (missing/stale draft, non-owner) the
// guard silently falls through and the standard SoftDeleteStory ownership
// check in the caller does the authoritative work.
func enforceDraftsDeleteGuards(
	w http.ResponseWriter,
	r *http.Request,
	dao daos.DaoInterface,
	email, storyID string,
) bool {
	drafts, listErr := dao.ListDrafts(r.Context(), email, storyID)
	if listErr != nil || len(drafts) <= 1 {
		return true
	}
	var target *models.Story
	var rootID, currentID string
	for _, s := range drafts {
		if s.ID == storyID {
			target = s
		}
		if s.OriginalStoryID == "" {
			rootID = s.ID
		}
		if s.IsCurrentDraft {
			currentID = s.ID
		}
	}
	if target != nil && target.OriginalStoryID == "" {
		// Re-root the ancestry: promote the current draft (or the oldest
		// remaining if no current is set) and rewrite the rest of the
		// siblings to point at it. Associations and share links are
		// migrated as part of the DAO call.
		if _, promoteErr := dao.PromoteNewRoot(r.Context(), email, storyID); promoteErr != nil {
			logger.Error("promote new root before delete failed",
				"error", promoteErr, "storyId", storyID)
			RespondWithError(w, http.StatusInternalServerError,
				"unable to promote new root before deleting the original")
			return false
		}
		return true
	}
	if target != nil && target.IsCurrentDraft && rootID != "" && rootID != currentID {
		if promoteErr := dao.SetCurrentDraft(r.Context(), email, rootID); promoteErr != nil {
			logger.Error("promote root before delete failed",
				"error", promoteErr, "storyId", storyID, "rootId", rootID)
			RespondWithError(w, http.StatusInternalServerError,
				"unable to promote root before deleting current draft")
			return false
		}
	}
	return true
}

// cascadeDeleteAncestry soft-deletes every story row in the ancestry
// of storyID (root + all drafts) and revokes share links pointing at
// any of them. Called by DeleteStoryEndpoint when ?cascade=true. On
// any per-row delete failure we still try to delete the rest — the
// user's intent is "wipe this logical work" and partial survival is
// worse than a successful cleanup pass with one logged error.
func cascadeDeleteAncestry(
	w http.ResponseWriter,
	r *http.Request,
	dao daos.DaoInterface,
	email, storyID string,
) {
	drafts, err := dao.ListDrafts(r.Context(), email, storyID)
	if err != nil {
		// If ancestry lookup fails (missing story, non-owner), fall
		// through to the single-row path so the user still gets a
		// clean "not found / forbidden" response from SoftDeleteStory.
		if sdErr := dao.SoftDeleteStory(r.Context(), email, storyID, false); sdErr != nil {
			logger.Error("cascade delete fallback single-row failed", "error", sdErr, "storyId", storyID)
			RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
			return
		}
		if revokeErr := dao.RevokeShareLinksForStory(r.Context(), storyID); revokeErr != nil {
			logger.Warn("cascade delete fallback share-link revoke failed", "storyId", storyID, "error", revokeErr)
		}
		RespondWithJSON(w, http.StatusOK, nil)
		return
	}
	// Delete each row (root + drafts). Collect ids first so iteration
	// is independent of ListDrafts' return ordering.
	ids := make([]string, 0, len(drafts))
	for _, s := range drafts {
		ids = append(ids, s.ID)
	}
	// Guarantee the target id is covered even if, for any reason, it
	// isn't present in the ancestry list.
	if !slices.Contains(ids, storyID) {
		ids = append(ids, storyID)
	}
	for _, id := range ids {
		if sdErr := dao.SoftDeleteStory(r.Context(), email, id, false); sdErr != nil {
			logger.Error("cascade delete: SoftDeleteStory failed",
				"error", sdErr, "storyId", id, "ancestryTarget", storyID)
			continue
		}
		if revokeErr := dao.RevokeShareLinksForStory(r.Context(), id); revokeErr != nil {
			logger.Warn("cascade delete: share-link revoke failed",
				"storyId", id, "ancestryTarget", storyID, "error", revokeErr)
		}
	}
	RespondWithJSON(w, http.StatusOK, nil)
}

func DeleteStoryEndpoint(w http.ResponseWriter, r *http.Request) {
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
	if storyID, err = url.PathUnescape(mux.Vars(r)["story"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing story name")
		return
	}
	if storyID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing story title")
		return
	}

	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	// Cascade mode: delete every story in the ancestry (root + all
	// drafts). The /stories list page uses this when a user clicks
	// "delete story" on a card, which represents the whole logical
	// work rather than one specific draft. The DraftsDialog uses the
	// default (non-cascade) mode when deleting a single draft, which
	// preserves siblings and re-roots as needed.
	if strings.EqualFold(r.URL.Query().Get("cascade"), "true") {
		cascadeDeleteAncestry(w, r, dao, email, storyID)
		return
	}

	if !enforceDraftsDeleteGuards(w, r, dao, email, storyID) {
		return
	}

	if err = dao.SoftDeleteStory(r.Context(), email, storyID, false); err != nil {
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
	// Best-effort: revoke any share links pointing at the deleted story
	// so readers see a "revoked" signal instead of a generic 404. Only
	// relevant when the ancestry wasn't re-rooted (PromoteNewRoot already
	// rewrote the links in that case); harmless if no links exist.
	if revokeErr := dao.RevokeShareLinksForStory(r.Context(), storyID); revokeErr != nil {
		logger.Warn("post-delete share-link revocation failed",
			"storyId", storyID, "error", revokeErr)
	}
	RespondWithJSON(w, http.StatusOK, nil)
}

func DeleteSeriesEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		email    string
		err      error
		seriesID string
		dao      daos.DaoInterface
		ok       bool
		series   *models.Series
	)
	if email, err = getUserEmail(r); err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	if seriesID, err = url.PathUnescape(mux.Vars(r)["seriesID"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing series ID")
		return
	}
	if seriesID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing seriesID")
		return
	}

	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	if series, err = dao.GetSeriesByID(r.Context(), email, seriesID); !ok {
		logger.Error("Resource not found", "error", err)
		RespondWithError(w, http.StatusNotFound, "Resource not found")
		return
	}

	if err = dao.DeleteSeries(r.Context(), email, *series); err != nil {
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
	RespondWithJSON(w, http.StatusOK, nil)
}
