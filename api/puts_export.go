package api

import (
	"RichDocter/converters"
	ctxkey "RichDocter/ctxkeys"
	"RichDocter/daos"
	"RichDocter/models"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/gorilla/mux"
)

// validateExportRequest validates the DocumentExportRequest fields
func validateExportRequest(export models.DocumentExportRequest) error {
	// Validate Title
	if strings.TrimSpace(export.Title) == "" {
		return fmt.Errorf("title is required")
	}
	if len(export.Title) > 500 {
		return fmt.Errorf("title too long: maximum 500 characters")
	}

	// Validate StoryID
	if strings.TrimSpace(export.StoryID) == "" {
		return fmt.Errorf("story ID is required")
	}
	if len(export.StoryID) > 100 {
		return fmt.Errorf("story ID too long: maximum 100 characters")
	}

	// Validate HtmlByChapter
	if len(export.HtmlByChapter) == 0 {
		return fmt.Errorf("at least one chapter is required")
	}
	if len(export.HtmlByChapter) > 1000 {
		return fmt.Errorf("too many chapters: maximum 1000")
	}

	// Validate each chapter
	for i, chapter := range export.HtmlByChapter {
		if strings.TrimSpace(chapter.Chapter) == "" {
			return fmt.Errorf("chapter %d: chapter title is required", i+1)
		}
		if len(chapter.Chapter) > 500 {
			return fmt.Errorf("chapter %d: chapter title too long (maximum 500 characters)", i+1)
		}
		// Allow empty HTML content, but validate length if present
		if len(chapter.HTML) > 10*1024*1024 { // 10MB per chapter
			return fmt.Errorf("chapter %d: content too large (maximum 10MB per chapter)", i+1)
		}
	}

	// Validate Author if provided
	if export.Author != nil && len(*export.Author) > 200 {
		return fmt.Errorf("author name too long: maximum 200 characters")
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
		RespondWithError(w, http.StatusInternalServerError, err.Error())
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
		RespondWithError(w, http.StatusBadRequest, err.Error())
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
		if err == sql.ErrNoRows {
			RespondWithError(w, http.StatusForbidden, "story doesn't belong to you")
			return
		}
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	var awsCfg aws.Config
	if awsCfg, err = config.LoadDefaultConfig(context.TODO(), func(opts *config.LoadOptions) error {
		opts.Region = os.Getenv("AWS_REGION")
		return nil
	}); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// If cover image URL is provided for EPUB, download it temporarily
	var coverImagePath string
	if export.CoverImage != nil && *export.CoverImage != "" && models.ExportFormat(typeOf) == models.FormatEPUB {
		var imageURL string
		if imageURL, err = converters.ValidateImageURL(*export.CoverImage); err != nil {
			RespondWithError(w, http.StatusBadRequest, err.Error())
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
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer os.Remove(TMP_EXPORT_DIR + "/" + generatedFile)

	reader, err := os.Open(TMP_EXPORT_DIR + "/" + generatedFile)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s3Client := s3.NewFromConfig(awsCfg)
	if _, err = s3Client.PutObject(context.Background(), &s3.PutObjectInput{
		Bucket:      aws.String(S3_EXPORTS_BUCKET),
		Key:         aws.String(generatedFile),
		Body:        reader,
		ContentType: aws.String(filetype),
	}); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	docURL := "https://" + S3_EXPORTS_BUCKET + ".s3." + os.Getenv("AWS_REGION") + ".amazonaws.com/" + generatedFile
	RespondWithJson(w, http.StatusCreated, models.Answer{Success: true, URL: docURL})
}
