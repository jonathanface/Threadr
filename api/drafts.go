package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strings"

	ctxkey "Threadr/ctxkeys"
	"Threadr/daos"
	"Threadr/logger"
	"Threadr/models"

	"github.com/gorilla/mux"
)

// draftCreateRequest is the body shape for POST /stories/{storyID}/drafts.
type draftCreateRequest struct {
	DraftName string `json:"draft_name"`
}

// draftRenameRequest is the body shape for PUT /stories/{storyID}/draft-name.
type draftRenameRequest struct {
	DraftName string `json:"draft_name"`
}

// loadDraftsPreamble runs the auth + storyID-parse + subscriber-gate
// + dao-pull steps shared by every draft handler. On any failure it emits
// the appropriate HTTP response and returns ok=false; callers should just
// return.
func loadDraftsPreamble(
	w http.ResponseWriter,
	r *http.Request,
) (dao daos.DaoInterface, email, storyID string, ok bool) {
	userEmail, authErr := getUserEmail(r)
	if authErr != nil {
		RespondWithError(w, http.StatusUnauthorized, "Authentication failed")
		return nil, "", "", false
	}
	if !RequireSubscriber(w, r, models.BenefitDrafts) {
		return nil, "", "", false
	}
	rawStoryID, parseErr := url.PathUnescape(mux.Vars(r)["storyID"])
	if parseErr != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid story ID")
		return nil, "", "", false
	}
	if rawStoryID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing story ID")
		return nil, "", "", false
	}
	d, dOK := r.Context().Value(ctxkey.DAO).(daos.DaoInterface)
	if !dOK {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return nil, "", "", false
	}
	return d, userEmail, rawStoryID, true
}

// CreateStoryDraftEndpoint handles POST /stories/{storyID}/drafts. The
// caller must own storyID (checked inside the DAO via GetStoryByID) and
// must be a subscriber (checked by the preamble).
func CreateStoryDraftEndpoint(w http.ResponseWriter, r *http.Request) {
	dao, email, storyID, ok := loadDraftsPreamble(w, r)
	if !ok {
		return
	}

	var req draftCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	req.DraftName = strings.TrimSpace(req.DraftName)
	if req.DraftName == "" {
		RespondWithError(w, http.StatusBadRequest, "draft_name is required")
		return
	}

	story, err := dao.CreateStoryDraft(r.Context(), email, storyID, req.DraftName)
	if err != nil {
		if errors.Is(err, daos.ErrStoryNotFound) {
			RespondWithError(w, http.StatusNotFound, "story not found")
			return
		}
		logger.Error("CreateStoryDraft failed", "error", err, "storyId", storyID)
		RespondWithError(w, http.StatusInternalServerError, "unable to create draft")
		return
	}
	RespondWithJSON(w, http.StatusOK, story)
}

// ListStoryDraftsEndpoint handles GET /stories/{storyID}/drafts. Returns
// all siblings in the ancestry (root first, then drafts oldest-first).
func ListStoryDraftsEndpoint(w http.ResponseWriter, r *http.Request) {
	dao, email, storyID, ok := loadDraftsPreamble(w, r)
	if !ok {
		return
	}
	drafts, err := dao.ListDrafts(r.Context(), email, storyID)
	if err != nil {
		if errors.Is(err, daos.ErrStoryNotFound) {
			RespondWithError(w, http.StatusNotFound, "story not found")
			return
		}
		logger.Error("ListDrafts failed", "error", err, "storyId", storyID)
		RespondWithError(w, http.StatusInternalServerError, "unable to list drafts")
		return
	}
	RespondWithJSON(w, http.StatusOK, drafts)
}

// SetCurrentDraftEndpoint handles POST /stories/{storyID}/drafts/current.
// The {storyID} is the id of the draft (or root) being promoted. Verifies
// the caller owns that row before promoting.
func SetCurrentDraftEndpoint(w http.ResponseWriter, r *http.Request) {
	dao, email, storyID, ok := loadDraftsPreamble(w, r)
	if !ok {
		return
	}
	// Ownership check: GetStoryByID is author-scoped.
	if _, err := dao.GetStoryByID(r.Context(), email, storyID); err != nil {
		if errors.Is(err, daos.ErrStoryNotFound) || strings.Contains(err.Error(), "no story found") {
			RespondWithError(w, http.StatusNotFound, "story not found")
			return
		}
		logger.Error("SetCurrentDraft ownership check failed", "error", err, "storyId", storyID)
		RespondWithError(w, http.StatusInternalServerError, "unable to verify story")
		return
	}
	if err := dao.SetCurrentDraft(r.Context(), email, storyID); err != nil {
		logger.Error("SetCurrentDraft failed", "error", err, "storyId", storyID)
		RespondWithError(w, http.StatusInternalServerError, "unable to set current draft")
		return
	}
	RespondWithJSON(w, http.StatusOK, nil)
}

// RenameStoryDraftEndpoint handles PUT /stories/{storyID}/draft-name.
// Updates draft_name on a single story row (root or draft).
func RenameStoryDraftEndpoint(w http.ResponseWriter, r *http.Request) {
	dao, email, storyID, ok := loadDraftsPreamble(w, r)
	if !ok {
		return
	}
	var req draftRenameRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	req.DraftName = strings.TrimSpace(req.DraftName)
	if req.DraftName == "" {
		RespondWithError(w, http.StatusBadRequest, "draft_name is required")
		return
	}
	// Ownership check mirrors SetCurrentDraft.
	if _, err := dao.GetStoryByID(r.Context(), email, storyID); err != nil {
		if errors.Is(err, daos.ErrStoryNotFound) || strings.Contains(err.Error(), "no story found") {
			RespondWithError(w, http.StatusNotFound, "story not found")
			return
		}
		logger.Error("RenameDraft ownership check failed", "error", err, "storyId", storyID)
		RespondWithError(w, http.StatusInternalServerError, "unable to verify story")
		return
	}
	if err := dao.RenameDraft(r.Context(), email, storyID, req.DraftName); err != nil {
		logger.Error("RenameDraft failed", "error", err, "storyId", storyID)
		RespondWithError(w, http.StatusInternalServerError, "unable to rename draft")
		return
	}
	RespondWithJSON(w, http.StatusOK, nil)
}
