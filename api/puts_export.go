package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
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

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/gorilla/mux"
)

// validateExportRequest validates the DocumentExportRequest fields.
func validateExportRequest(export models.DocumentExportRequest) error {
	// Validate Title
	if strings.TrimSpace(export.Title) == "" {
		return errors.New("title is required")
	}
	if len(export.Title) > maxTitleLength {
		return fmt.Errorf("title too long: maximum %d characters", maxTitleLength)
	}

	// Validate StoryID
	if strings.TrimSpace(export.StoryID) == "" {
		return errors.New("story ID is required")
	}
	if len(export.StoryID) > maxStoryIDLength {
		return fmt.Errorf("story ID too long: maximum %d characters", maxStoryIDLength)
	}

	// Validate HtmlByChapter
	if len(export.HtmlByChapter) == 0 {
		return errors.New("at least one chapter is required")
	}
	if len(export.HtmlByChapter) > maxChapterCount {
		return fmt.Errorf("too many chapters: maximum %d", maxChapterCount)
	}

	// Validate each chapter
	for i, chapter := range export.HtmlByChapter {
		if strings.TrimSpace(chapter.Chapter) == "" {
			return fmt.Errorf("chapter %d: chapter title is required", i+1)
		}
		if len(chapter.Chapter) > maxChapterTitleLength {
			return fmt.Errorf("chapter %d: chapter title too long (maximum %d characters)", i+1, maxChapterTitleLength)
		}
		// Allow empty HTML content, but validate length if present
		if len(chapter.HTML) > 10*1024*1024 { // 10MB per chapter
			return fmt.Errorf("chapter %d: content too large (maximum 10MB per chapter)", i+1)
		}
	}

	// Validate Author if provided
	if export.Author != nil && len(*export.Author) > 200 {
		return errors.New("author name too long: maximum 200 characters")
	}

	// CoverImage URL validation happens later in the flow with ValidateImageURL

	return nil
}

func ExportStoryEndpoint(w http.ResponseWriter, r *http.Request) {
	// this should be transactified
	var (
		email   string
		err     error
		dao     daos.DaoInterface
		ok      bool
		storyID string
	)
	typeOf := r.URL.Query().Get("type")
	if typeOf == "" {
		RespondWithError(w, http.StatusBadRequest, "no type provided")
		return
	}
	if email, err = getUserEmail(r); err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	decoder := json.NewDecoder(r.Body)
	export := models.DocumentExportRequest{}
	if err := decoder.Decode(&export); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	// Validate export request
	if err := validateExportRequest(export); err != nil {
		logger.Error("Bad request", "error", err)
		RespondWithError(w, http.StatusBadRequest, "Invalid request")
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
	// Make sure the user actually owns this story
	_, err = dao.GetStoryByID(r.Context(), email, storyID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			RespondWithError(w, http.StatusForbidden, "story doesn't belong to you")
			return
		}
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}

	var awsCfg aws.Config
	if awsCfg, err = config.LoadDefaultConfig(context.TODO(), func(opts *config.LoadOptions) error {
		opts.Region = os.Getenv("AWS_REGION")
		return nil
	}); err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}

	// If cover image URL is provided for EPUB, download it temporarily
	var coverImagePath string
	if export.CoverImage != nil && *export.CoverImage != "" && models.ExportFormat(typeOf) == models.FormatEPUB {
		var imageURL string
		if imageURL, err = converters.ValidateImageURL(*export.CoverImage); err != nil {
			logger.Error("Bad request", "error", err)
			RespondWithError(w, http.StatusBadRequest, "Invalid request")
			return
		}
		coverImagePath, err = converters.DownloadCoverImage(imageURL)
		if err != nil {
			// Log error but continue without cover
			coverImagePath = ""
		} else {
			defer os.Remove(coverImagePath)
			export.CoverImage = &coverImagePath
		}
	}

	// Convert Lexical JSON to HTML if needed (for mobile app exports)
	for i := range export.HtmlByChapter {
		if after, ok0 := strings.CutPrefix(export.HtmlByChapter[i].HTML, "__LEXICAL__"); ok0 {
			// Extract the Lexical JSON
			lexicalJSON := after

			// Convert Lexical JSON to HTML using the converters package
			html, err := converters.LexicalToHTML(lexicalJSON)
			if err != nil {
				RespondWithError(w, http.StatusBadRequest, "Failed to convert chapter content for export")
				return
			}

			export.HtmlByChapter[i].HTML = html
		}
	}

	var generatedFile string
	filetype := "application/pdf"

	switch models.ExportFormat(typeOf) {
	case models.FormatPDF:
		generatedFile, err = converters.HTMLToPDF(export)
	case models.FormatDOCX:
		filetype = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
		generatedFile, err = converters.HTMLToDOCX(export)
	case models.FormatEPUB:
		filetype = "application/epub+zip"
		generatedFile, err = converters.HTMLToEPUB(export)
	}
	if err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	if generatedFile == "" ||
		generatedFile != filepath.Base(generatedFile) ||
		strings.Contains(generatedFile, "/") ||
		strings.Contains(generatedFile, "\\") ||
		strings.Contains(generatedFile, "..") {
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	generatedFilePath := filepath.Join(tmpExportDir, generatedFile)
	defer os.Remove(generatedFilePath)

	reader, err := os.Open(generatedFilePath)
	if err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	s3Client := s3.NewFromConfig(awsCfg)
	if _, err = s3Client.PutObject(context.Background(), &s3.PutObjectInput{
		Bucket:      aws.String(s3ExportsBucket),
		Key:         aws.String(generatedFile),
		Body:        reader,
		ContentType: aws.String(filetype),
	}); err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}

	docURL := "https://" + s3ExportsBucket + ".s3." + os.Getenv("AWS_REGION") + ".amazonaws.com/" + generatedFile
	RespondWithJson(w, http.StatusCreated, models.Answer{Success: true, URL: docURL})
}
