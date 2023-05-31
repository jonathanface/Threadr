package api

import (
	"RichDocter/daos"
	"RichDocter/models"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/smithy-go"
	"github.com/gorilla/mux"
	"github.com/jung-kurt/gofpdf"
)

func CreateStoryChapterEndpoint(w http.ResponseWriter, r *http.Request) {
	// this should be transactified
	var (
		email      string
		err        error
		storyTitle string
		dao        daos.DaoInterface
		ok         bool
	)
	if email, err = getUserEmail(r); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if storyTitle, err = url.PathUnescape(mux.Vars(r)["story"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing story name")
		return
	}
	if storyTitle == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing story ID")
		return
	}
	decoder := json.NewDecoder(r.Body)
	chapter := models.Chapter{}
	if err := decoder.Decode(&chapter); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}
	if dao, ok = r.Context().Value("dao").(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}
	if err = dao.CreateChapter(email, storyTitle, chapter); err != nil {
		if opErr, ok := err.(*smithy.OperationError); ok {
			awsResponse := processAWSError(opErr)
			if awsResponse.Code == 0 {
				RespondWithError(w, http.StatusInternalServerError, err.Error())
				return
			}
			RespondWithError(w, awsResponse.Code, awsResponse.Message)
			return
		}
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	RespondWithJson(w, http.StatusOK, nil)
}

func CreateStoryEndpoint(w http.ResponseWriter, r *http.Request) {
	// this should be transactified
	var (
		email string
		err   error
		dao   daos.DaoInterface
		ok    bool
	)
	if email, err = getUserEmail(r); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	decoder := json.NewDecoder(r.Body)
	story := models.Story{}
	if err := decoder.Decode(&story); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}
	story.Title = strings.TrimSpace(story.Title)
	if story.Title == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing story name")
		return
	}
	story.Description = strings.TrimSpace(story.Description)
	if story.Description == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing story description")
		return
	}
	if dao, ok = r.Context().Value("dao").(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}
	if err = dao.CreateStory(email, story); err != nil {
		if opErr, ok := err.(*smithy.OperationError); ok {
			awsResponse := processAWSError(opErr)
			if awsResponse.Code == 0 {
				RespondWithError(w, http.StatusInternalServerError, err.Error())
				return
			}
			RespondWithError(w, awsResponse.Code, awsResponse.Message)
			return
		}
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	RespondWithJson(w, http.StatusOK, nil)
}

func ExportStoryEndpoint(w http.ResponseWriter, r *http.Request) {
	// this should be transactified
	var (
		email string
		err   error
		dao   daos.DaoInterface
		ok    bool
	)
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
	storyTitle := strings.TrimSpace(export.StoryTitle)
	if storyTitle == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing story name")
		return
	}
	if dao, ok = r.Context().Value("dao").(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}
	// Make sure the user actually owns this story
	_, err = dao.GetStoryByName(email, storyTitle)
	if err != nil {
		if err == sql.ErrNoRows {
			RespondWithError(w, http.StatusUnauthorized, "story doesn't belong to you")
			return
		}
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.AddUTF8Font("Arial", "", "fonts/arial.ttf")
	pdf.SetFont("Arial", "", 12)
	lineHeight := 3.175 // Spacing in millimeters
	pdf.SetRightMargin(25.4)
	pdf.SetLeftMargin(25.4)

	html := pdf.HTMLBasicNew()

	for _, htmlData := range export.HtmlByChapter {
		re := regexp.MustCompile(`<em>(.*?)<\/em>`)
		modifiedHTML := re.ReplaceAllString(htmlData.HTML, `<i>$1</i>`)
		re = regexp.MustCompile(`<strong>(.*?)<\/strong>`)
		modifiedHTML = re.ReplaceAllString(modifiedHTML, `<b>$1</b>`)
		re = regexp.MustCompile(`’`)
		modifiedHTML = re.ReplaceAllString(modifiedHTML, `'`)
		re = regexp.MustCompile(`&#x27;`)
		modifiedHTML = re.ReplaceAllString(modifiedHTML, `'`)
		re = regexp.MustCompile(`“`)
		modifiedHTML = re.ReplaceAllString(modifiedHTML, `"`)
		re = regexp.MustCompile(`”`)
		modifiedHTML = re.ReplaceAllString(modifiedHTML, `"`)
		re = regexp.MustCompile(`&quot;`)
		modifiedHTML = re.ReplaceAllString(modifiedHTML, `"`)
		re = regexp.MustCompile(`—`)
		modifiedHTML = re.ReplaceAllString(modifiedHTML, `--`)
		re = regexp.MustCompile(`<p>(.*?)<\/p>`)
		modifiedHTML = re.ReplaceAllString(modifiedHTML, `$1\n`)

		pdf.AddPage()
		pdf.SetFont("Arial", "B", 18)
		pdf.WriteAligned(0, 18, htmlData.Chapter, "C")
		pdf.Ln(18)
		pdf.SetFont("Arial", "", 12)
		paragraphs := strings.Split(modifiedHTML, "\\n")

		alignMatchCenter := regexp.MustCompile(`<CENTER>(.*?)<\/CENTER>`)
		alignMatchRight := regexp.MustCompile(`<RIGHT>(.*?)<\/RIGHT>`)
		for _, paragraph := range paragraphs {
			pdf.Ln(lineHeight * 2)
			if alignMatchCenter.Match([]byte(paragraph)) {
				paragraph = alignMatchCenter.ReplaceAllString(paragraph, `$1`)
				pdf.WriteAligned(0, lineHeight*2, paragraph, "C")
				continue
			}
			if alignMatchRight.Match([]byte(paragraph)) {
				paragraph = alignMatchCenter.ReplaceAllString(paragraph, `$1`)
				pdf.WriteAligned(0, lineHeight*2, paragraph, "R")
				continue
			}
			html = pdf.HTMLBasicNew()
			html.Write(lineHeight*2, paragraph)
		}
	}

	filetype := "application/pdf"
	filename := fmt.Sprintf("%s.pdf", export.StoryTitle)

	err = pdf.OutputFileAndClose("./tmp/" + filename)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer os.Remove("./tmp/" + filename)

	var awsCfg aws.Config
	if awsCfg, err = config.LoadDefaultConfig(context.TODO(), func(opts *config.LoadOptions) error {
		opts.Region = os.Getenv("AWS_REGION")
		return nil
	}); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	reader, err := os.Open("./tmp/" + filename)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s3Client := s3.NewFromConfig(awsCfg)
	if _, err = s3Client.PutObject(context.Background(), &s3.PutObjectInput{
		Bucket:      aws.String(S3_EXPORTS_BUCKET),
		Key:         aws.String(filename),
		Body:        reader,
		ContentType: aws.String(filetype),
	}); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	docURL := "https://" + S3_EXPORTS_BUCKET + ".s3." + os.Getenv("AWS_REGION") + ".amazonaws.com/" + filename
	RespondWithJson(w, http.StatusCreated, models.Answer{Success: true, URL: docURL})
	/*
		// Save the generated PDF to a temporary file
		pdfTempFile, err := os.CreateTemp("", "temp_pdf_*.pdf")
		if err != nil {
			return err
		}
		defer os.Remove(pdfTempFile.Name())
		err = pdf.Output(pdfTempFile)
		if err != nil {
			return err
		}

		// Convert PDF to DOCX using docx
		doc, err := docx.CreateFromPDF(pdfTempFile.Name())
		if err != nil {
			return err
		}
		defer doc.Close()

		// Save the DOCX document
		err = doc.SaveToFile(docxPath)
		if err != nil {
			return err
		}

		return nil*/
}
