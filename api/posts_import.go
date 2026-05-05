package api

import (
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

const maxImportFileSize = 20 * 1024 * 1024 // 20MB

var allowedImportFormats = map[string]string{
	".docx": "docx",
	".txt":  "txt",
}

// ImportDocumentEndpoint handles file upload and converts imported documents
// into chapters and blocks for an existing story.
//
// POST /api/v1/stories/{storyID}/import
// Content-Type: multipart/form-data
// Form field: "file" (the document to import).
func ImportDocumentEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		err     error
		storyID string
		email   string
		dao     daos.DaoInterface
		ok      bool
	)

	if email, err = getUserEmail(r); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Authentication error")
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

	// Verify the authenticated user owns this story
	if _, err = dao.GetStoryByID(r.Context(), email, storyID); err != nil {
		logger.Warn("Import denied: user does not own story",
			"email", email,
			"storyId", storyID)
		RespondWithError(w, http.StatusForbidden, "You do not have access to this story")
		return
	}

	// Parse multipart form with size limit
	r.Body = http.MaxBytesReader(w, r.Body, maxImportFileSize)
	if err = r.ParseMultipartForm(maxImportFileSize); err != nil {
		RespondWithError(w, http.StatusBadRequest, "File too large. Maximum size is 20MB.")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, "No file provided")
		return
	}
	defer file.Close()

	// Validate file extension
	ext := strings.ToLower(filepath.Ext(header.Filename))
	format, ok := allowedImportFormats[ext]
	if !ok {
		RespondWithError(w, http.StatusBadRequest, "Unsupported file format. Allowed: .docx, .txt")
		return
	}

	logger.Info("Import request received",
		"storyId", storyID,
		"filename", header.Filename,
		"format", format,
		"size", header.Size)

	// Write to temp file for pandoc/pdftotext processing
	tmpFile, err := os.CreateTemp("", "import_*"+ext)
	if err != nil {
		logger.Error("Failed to create temp file for import", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "Failed to process file")
		return
	}
	defer os.Remove(tmpFile.Name())
	defer tmpFile.Close()

	if _, err = io.Copy(tmpFile, file); err != nil {
		logger.Error("Failed to write temp file for import", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "Failed to process file")
		return
	}
	tmpFile.Close()

	// Check if user wants to skip the first page (title page)
	skipFirstPage := r.FormValue("skip_first_page") == "true"

	// Convert document to chapters (autotab enabled — new stories default to autotab)
	importedChapters, err := converters.ImportDocument(tmpFile.Name(), format, true, skipFirstPage)
	if err != nil {
		logger.Error("Document import conversion failed",
			"error", err,
			"storyId", storyID,
			"filename", header.Filename,
			"format", format)
		RespondWithError(
			w,
			http.StatusUnprocessableEntity,
			"Failed to import document. The file may be corrupted or in an unsupported format.",
		)
		return
	}

	// Delete any existing chapters (e.g. the auto-created "Chapter 1" from story creation)
	existingChapters, err := dao.GetChaptersByStoryID(r.Context(), storyID)
	if err == nil && len(existingChapters) > 0 {
		if delErr := dao.DeleteChapters(r.Context(), storyID, existingChapters); delErr != nil {
			logger.Warn("Failed to delete existing chapters before import",
				"error", delErr,
				"storyId", storyID,
				"chapterCount", len(existingChapters))
		}
	}

	// Create chapters and write blocks
	var createdChapters []models.Chapter
	for i, imported := range importedChapters {
		chapter := models.Chapter{
			ID:      uuid.New().String(),
			StoryID: storyID,
			Title:   imported.Title,
			Place:   i + 1,
		}

		createdChapter, err := dao.CreateChapter(r.Context(), storyID, chapter)
		if err != nil {
			logger.Error("Failed to create chapter during import",
				"error", err,
				"storyId", storyID,
				"chapterTitle", imported.Title,
				"chapterIndex", i)
			RespondWithError(w, http.StatusInternalServerError, "Failed to create chapter during import")
			return
		}

		// Write blocks for this chapter
		if len(imported.Blocks) > 0 {
			storyBlocks := models.StoryBlocks{
				StoryID:   storyID,
				ChapterID: createdChapter.ID,
			}
			for _, block := range imported.Blocks {
				storyBlocks.Blocks = append(storyBlocks.Blocks, models.StoryBlock{
					KeyID: block.KeyID,
					Chunk: block.Chunk,
					Place: block.Place,
				})
			}

			if err = dao.WriteBlocks(r.Context(), storyID, &storyBlocks); err != nil {
				logger.Error("Failed to write blocks during import",
					"error", err,
					"storyId", storyID,
					"chapterId", createdChapter.ID,
					"blockCount", len(imported.Blocks))
				RespondWithError(w, http.StatusInternalServerError, "Failed to write content during import")
				return
			}
		}

		createdChapters = append(createdChapters, createdChapter)
	}

	logger.Info("Import completed successfully",
		"storyId", storyID,
		"filename", header.Filename,
		"chaptersCreated", len(createdChapters))

	RespondWithJSON(w, http.StatusOK, map[string]any{
		"chapters": createdChapters,
		"count":    len(createdChapters),
	})
}
