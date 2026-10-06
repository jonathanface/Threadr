package api

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"Threadr/converters"
	ctxkey "Threadr/ctxkeys"
	"Threadr/daos"
	"Threadr/logger"
	"Threadr/models"

	"github.com/google/uuid"
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

// CreateDraftFromImportEndpoint handles POST /stories/{storyID}/drafts/upload.
// Creates a new draft of the ancestry containing storyID, replacing the
// cloned chapters with the contents of an uploaded document (.docx / .txt).
// Reuses CreateStoryDraft to get the demotion of the previous current and
// the series_id/place transfer for free, then swaps the cloned chapters
// for the parsed ones using the same chapter-replacement pattern the
// /import endpoint uses.
func CreateDraftFromImportEndpoint(w http.ResponseWriter, r *http.Request) {
	dao, email, storyID, ok := loadDraftsPreamble(w, r)
	if !ok {
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxImportFileSize)
	if err := r.ParseMultipartForm(maxImportFileSize); err != nil { //nolint:gosec // body bounded above
		RespondWithError(w, http.StatusBadRequest, "File too large. Maximum size is 20MB.")
		return
	}

	draftName := strings.TrimSpace(r.FormValue("draft_name"))
	if draftName == "" {
		RespondWithError(w, http.StatusBadRequest, "draft_name is required")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, "No file provided")
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	format, formatOK := allowedImportFormats[ext]
	if !formatOK {
		RespondWithError(w, http.StatusBadRequest, "Unsupported file format. Allowed: .docx, .txt")
		return
	}

	tmpFile, err := os.CreateTemp("", "draft_import_*"+ext)
	if err != nil {
		logger.Error("Failed to create temp file for draft import", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "Failed to process file")
		return
	}
	defer os.Remove(tmpFile.Name())
	defer tmpFile.Close()

	if _, err = io.Copy(tmpFile, file); err != nil {
		logger.Error("Failed to write temp file for draft import", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "Failed to process file")
		return
	}
	_ = tmpFile.Close()

	skipFirstPage := r.FormValue("skip_first_page") == "true"
	importedChapters, err := converters.ImportDocument(tmpFile.Name(), format, true, skipFirstPage)
	if err != nil {
		logger.Error("Draft import conversion failed",
			"error", err, "storyId", storyID, "filename", header.Filename, "format", format)
		RespondWithError(
			w,
			http.StatusUnprocessableEntity,
			"Failed to import document. The file may be corrupted or in an unsupported format.",
		)
		return
	}

	// Clone the source: this gives us demotion of the previous current,
	// series_id/place transfer, and a new story row with a (soon-to-be-
	// discarded) chapter set. Chapters will be replaced below.
	draft, err := dao.CreateStoryDraft(r.Context(), email, storyID, draftName)
	if err != nil {
		if errors.Is(err, daos.ErrStoryNotFound) {
			RespondWithError(w, http.StatusNotFound, "story not found")
			return
		}
		logger.Error("CreateStoryDraft failed (upload path)", "error", err, "storyId", storyID)
		RespondWithError(w, http.StatusInternalServerError, "unable to create draft")
		return
	}

	// Replace the cloned chapter rows with the imported ones. Mirrors
	// ImportDocumentEndpoint; orphan content blocks from the clone fall
	// out of scope with the chapters that referenced them.
	clonedChapters, cerr := dao.GetChaptersByStoryID(r.Context(), draft.ID)
	if cerr == nil && len(clonedChapters) > 0 {
		if delErr := dao.DeleteChapters(r.Context(), draft.ID, clonedChapters); delErr != nil {
			logger.Warn("Failed to delete cloned chapters before draft import",
				"error", delErr, "storyId", draft.ID, "chapterCount", len(clonedChapters))
		}
	}

	createdChapters := make([]models.Chapter, 0, len(importedChapters))
	for i, imported := range importedChapters {
		chapter := models.Chapter{
			ID:      uuid.New().String(),
			StoryID: draft.ID,
			Title:   imported.Title,
			Place:   i + 1,
		}
		created, chErr := dao.CreateChapter(r.Context(), draft.ID, chapter)
		if chErr != nil {
			logger.Error("Failed to create chapter during draft import",
				"error", chErr, "storyId", draft.ID, "chapterIndex", i)
			RespondWithError(w, http.StatusInternalServerError, "Failed to create chapter during import")
			return
		}
		if len(imported.Blocks) > 0 {
			storyBlocks := models.StoryBlocks{StoryID: draft.ID, ChapterID: created.ID}
			for _, block := range imported.Blocks {
				storyBlocks.Blocks = append(storyBlocks.Blocks, models.StoryBlock{
					KeyID: block.KeyID,
					Chunk: block.Chunk,
					Place: block.Place,
				})
			}
			if wErr := dao.WriteBlocks(r.Context(), draft.ID, &storyBlocks); wErr != nil {
				logger.Error("Failed to write blocks during draft import",
					"error", wErr, "storyId", draft.ID, "chapterId", created.ID)
				RespondWithError(w, http.StatusInternalServerError, "Failed to write content during import")
				return
			}
		}
		createdChapters = append(createdChapters, created)
	}

	draft.Chapters = createdChapters
	RespondWithJSON(w, http.StatusOK, draft)
}
