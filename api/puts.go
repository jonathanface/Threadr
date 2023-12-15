package api

import (
	"RichDocter/daos"
	"RichDocter/models"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/smithy-go"
	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/stripe/stripe-go/v72/sub"
)

func UpdateUserEndpoint(w http.ResponseWriter, r *http.Request) {
	//var userID string
	var dao daos.DaoInterface
	var err error
	var ok bool

	if dao, ok = r.Context().Value("dao").(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}
	email, err := getUserEmail(r)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	user, err := dao.GetUserDetails(email)
	if err != nil {
		RespondWithError(w, http.StatusNotFound, "Unable to locate user")
		return
	}
	fmt.Println("retreived", user)
	decoder := json.NewDecoder(r.Body)
	passedUser := models.UserInfo{}
	if err := decoder.Decode(&passedUser); err != nil {
		fmt.Println("here")
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	fmt.Println("received", passedUser.Renewing)
	if !user.Renewing && passedUser.Renewing {
		subscription, err := sub.Get(user.SubscriptionID, nil)
		if err != nil {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if len(subscription.Items.Data) == 0 {
			RespondWithError(w, http.StatusInternalServerError, "error retrieving subscription details")
			return
		}
		priceID := subscription.Items.Data[0].Price.ID
		methods, err := getPaymentMethodsForCustomer(user.CustomerID)
		if err != nil {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
		// TODO provide a way to update payment method
		var defaultPaymentID string
		for _, method := range methods {
			if method.IsDefault {
				defaultPaymentID = method.Id
				break
			}
		}
		sub, err := createSubscription(user.CustomerID, priceID, defaultPaymentID)
		if err != nil {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
		user.SubscriptionID = sub.ID
	} else if user.Renewing && !passedUser.Renewing {
		err = cancelSubscription(user.SubscriptionID)
		if err != nil {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	user.Renewing = passedUser.Renewing
	if err = dao.UpdateUser(*user); err != nil {
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
	RespondWithJson(w, http.StatusOK, user)
}

func EditSeriesEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		seriesID string
		email    string
		err      error
		dao      daos.DaoInterface
		ok       bool
	)
	if email, err = getUserEmail(r); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if dao, ok = r.Context().Value("dao").(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	if seriesID, err = url.PathUnescape(mux.Vars(r)["seriesID"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing series ID")
		return
	}
	if seriesID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing series ID")
		return
	}

	series, err := dao.GetSeriesByID(email, seriesID)
	if err != nil {
		RespondWithError(w, http.StatusNotFound, "Unable to locate series")
		return
	}
	if len(strings.TrimSpace(r.FormValue("title"))) > 0 {
		series.Title = strings.TrimSpace(r.FormValue("title"))
		if series.Title == "" {
			RespondWithError(w, http.StatusBadRequest, "Series name cannot be blank")
			return
		}
	}

	if len(strings.TrimSpace(r.FormValue("description"))) > 0 {
		series.Description = strings.TrimSpace(r.FormValue("description"))
	}

	storiesJSON := r.FormValue("stories")
	if storiesJSON != "" {
		var stories []models.Story
		err := json.Unmarshal([]byte(storiesJSON), &stories)
		if err != nil {
			RespondWithError(w, http.StatusBadRequest, err.Error())
			return
		}
		for idx, fromForm := range stories {
			for storedIdx, storedStory := range series.Stories {
				if storedStory.ID == fromForm.ID {
					storyCopy := stories[idx]
					series.Stories[storedIdx] = &storyCopy
				}
			}
		}
	}
	for _, st := range series.Stories {
		fmt.Println("storing", st.Title, st.Place)
	}

	const maxFileSize = 1024 * 1024 // 1 MB
	// image upload
	err = r.ParseMultipartForm(10 << 20)
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, "Unable to parse file")
		return
	}

	file, handler, err := r.FormFile("file")
	if err != nil {
		if err != http.ErrMissingFile {
			RespondWithError(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	if file != nil {
		// TODO delete previous image
		defer file.Close()

		allowedTypes := []string{"image/jpeg", "image/png", "image/gif"}
		fileBytes := make([]byte, handler.Size)
		if _, err := file.Read(fileBytes); err != nil {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
		fileType := http.DetectContentType(fileBytes)
		allowed := false
		for _, t := range allowedTypes {
			if fileType == t {
				allowed = true
				break
			}
		}
		if !allowed {
			RespondWithError(w, http.StatusBadRequest, "Invalid file type")
			return
		}

		if _, err := file.Seek(0, io.SeekStart); err != nil {
			RespondWithError(w, http.StatusInternalServerError, "Failed to read the image file")
			return
		}
		// Scale down the image if it exceeds the maximum width
		scaledImageBuf, _, err := scaleDownImage(file, uint(400))
		if err != nil {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
		// Check the size of the scaled image
		if scaledImageBuf.Len() > maxFileSize {
			RespondWithError(w, http.StatusBadRequest, "Filesize must be < 1MB")
			return
		}

		ext := filepath.Ext(handler.Filename)

		safeEmail := strings.ToLower(strings.ReplaceAll(email, "@", "-"))
		filename := safeEmail + "_" + seriesID + ext

		var awsCfg aws.Config
		if awsCfg, err = config.LoadDefaultConfig(context.TODO(), func(opts *config.LoadOptions) error {
			opts.Region = os.Getenv("AWS_REGION")
			return nil
		}); err != nil {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
		s3Client := s3.NewFromConfig(awsCfg)
		if _, err = s3Client.PutObject(context.Background(), &s3.PutObjectInput{
			Bucket:      aws.String(S3_SERIES_IMAGE_BUCKET),
			Key:         aws.String(filename),
			Body:        scaledImageBuf,
			ContentType: aws.String(fileType),
		}); err != nil {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
		series.ImageURL = "https://" + S3_SERIES_IMAGE_BUCKET + ".s3." + os.Getenv("AWS_REGION") + ".amazonaws.com/" + filename
	}

	var updatedSeries models.Series
	if updatedSeries, err = dao.EditSeries(email, *series); err != nil {
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
	RespondWithJson(w, http.StatusOK, updatedSeries)
}

func RemoveStoryFromSeriesEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		storyID  string
		seriesID string
		email    string
		err      error
		dao      daos.DaoInterface
		ok       bool
	)

	if email, err = getUserEmail(r); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if dao, ok = r.Context().Value("dao").(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
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
	if seriesID, err = url.PathUnescape(mux.Vars(r)["seriesID"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing series name")
		return
	}
	if seriesID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing series ID")
		return
	}
	story, err := dao.GetStoryByID(email, storyID)
	if err != nil {
		RespondWithError(w, http.StatusNotFound, "Unable to locate story")
		return
	}
	series, err := dao.GetSeriesByID(email, seriesID)
	if err != nil {
		RespondWithError(w, http.StatusNotFound, "Unable to locate series")
		return
	}
	fmt.Println("removing from", series.ID)

	var updatedSeries models.Series
	if updatedSeries, err = dao.RemoveStoryFromSeries(email, story.ID, *series); err != nil {
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
	RespondWithJson(w, http.StatusOK, updatedSeries)
}

func UpdateChaptersEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		storyID string
		err     error
		dao     daos.DaoInterface
		ok      bool
	)
	if dao, ok = r.Context().Value("dao").(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
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

	decoder := json.NewDecoder(r.Body)
	newChapters := []models.Chapter{}
	if err := decoder.Decode(&newChapters); err != nil {
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	for _, chapter := range newChapters {
		if _, err = dao.EditChapter(storyID, chapter); err != nil {
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
	}
	RespondWithJson(w, http.StatusOK, newChapters)
}

func EditChapterEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		storyID   string
		chapterID string
		err       error
		dao       daos.DaoInterface
		ok        bool
	)
	if dao, ok = r.Context().Value("dao").(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
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

	decoder := json.NewDecoder(r.Body)
	newChapter := models.Chapter{}
	if err := decoder.Decode(&newChapter); err != nil {
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}

	var updatedChapter models.Chapter
	if updatedChapter, err = dao.EditChapter(storyID, newChapter); err != nil {
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
	RespondWithJson(w, http.StatusOK, updatedChapter)
}

func EditStoryEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		storyID string
		email   string
		err     error
		dao     daos.DaoInterface
		ok      bool
	)
	if email, err = getUserEmail(r); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if dao, ok = r.Context().Value("dao").(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
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

	story, err := dao.GetStoryByID(email, storyID)
	if err != nil {
		RespondWithError(w, http.StatusNotFound, "Unable to locate story")
		return
	}
	if len(strings.TrimSpace(r.FormValue("title"))) > 0 {
		story.Title = strings.TrimSpace(r.FormValue("title"))
		if story.Title == "" {
			RespondWithError(w, http.StatusBadRequest, "Missing story name")
			return
		}
	}

	if len(strings.TrimSpace(r.FormValue("description"))) > 0 {
		story.Description = strings.TrimSpace(r.FormValue("description"))
		if story.Description == "" {
			RespondWithError(w, http.StatusBadRequest, "Missing story description")
			return
		}
	}

	if len(strings.TrimSpace(r.FormValue("series_id"))) > 0 {
		story.SeriesID = strings.TrimSpace(r.FormValue("series_id"))
	} else if len(strings.TrimSpace(r.FormValue("series_title"))) > 0 {
		story.SeriesID = strings.TrimSpace(r.FormValue("series_title"))
	} else {
		story.SeriesID = ""
	}

	const maxFileSize = 1024 * 1024 // 1 MB
	// image upload
	err = r.ParseMultipartForm(10 << 20)
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, "Unable to parse file")
		return
	}

	file, handler, err := r.FormFile("file")
	if err != nil {
		if err != http.ErrMissingFile {
			RespondWithError(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	if file != nil {
		// TODO delete previous image
		defer file.Close()

		allowedTypes := []string{"image/jpeg", "image/png", "image/gif"}
		fileBytes := make([]byte, handler.Size)
		if _, err := file.Read(fileBytes); err != nil {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
		fileType := http.DetectContentType(fileBytes)
		allowed := false
		for _, t := range allowedTypes {
			if fileType == t {
				allowed = true
				break
			}
		}
		if !allowed {
			RespondWithError(w, http.StatusBadRequest, "Invalid file type")
			return
		}

		if _, err := file.Seek(0, io.SeekStart); err != nil {
			RespondWithError(w, http.StatusInternalServerError, "Failed to read the image file")
			return
		}
		// Scale down the image if it exceeds the maximum width
		scaledImageBuf, _, err := scaleDownImage(file, uint(400))
		if err != nil {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
		// Check the size of the scaled image
		if scaledImageBuf.Len() > maxFileSize {
			RespondWithError(w, http.StatusBadRequest, "Filesize must be < 1MB")
			return
		}

		ext := filepath.Ext(handler.Filename)

		safeEmail := strings.ToLower(strings.ReplaceAll(email, "@", "-"))
		filename := safeEmail + "_" + storyID + ext

		var awsCfg aws.Config
		if awsCfg, err = config.LoadDefaultConfig(context.TODO(), func(opts *config.LoadOptions) error {
			opts.Region = os.Getenv("AWS_REGION")
			return nil
		}); err != nil {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
		s3Client := s3.NewFromConfig(awsCfg)
		if _, err = s3Client.PutObject(context.Background(), &s3.PutObjectInput{
			Bucket:      aws.String(S3_STORY_IMAGE_BUCKET),
			Key:         aws.String(filename),
			Body:        scaledImageBuf,
			ContentType: aws.String(fileType),
		}); err != nil {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
		story.ImageURL = "https://" + S3_STORY_IMAGE_BUCKET + ".s3." + os.Getenv("AWS_REGION") + ".amazonaws.com/" + filename
	}

	var updatedStory models.Story
	if updatedStory, err = dao.EditStory(email, *story); err != nil {
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

	RespondWithJson(w, http.StatusOK, updatedStory)
}

func RewriteBlockOrderEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		err     error
		storyID string
		dao     daos.DaoInterface
		ok      bool
	)
	if storyID, err = url.PathUnescape(mux.Vars(r)["story"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing story name")
		return
	}
	if storyID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing story ID")
		return
	}

	decoder := json.NewDecoder(r.Body)
	storyBlocks := models.StoryBlocks{}
	if err := decoder.Decode(&storyBlocks); err != nil {
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}

	if dao, ok = r.Context().Value("dao").(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	if err = dao.ResetBlockOrder(storyID, &storyBlocks); err != nil {
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

func WriteBlocksToStoryEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		err     error
		storyID string
		dao     daos.DaoInterface
		ok      bool
		//subscriberID string
	)
	if storyID, err = url.PathUnescape(mux.Vars(r)["story"]); err != nil {
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
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	if dao, ok = r.Context().Value("dao").(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	// if subscriberID, err = dao.IsUserSubscribed(email); err != nil {
	// 	RespondWithError(w, http.StatusInternalServerError, "unable to retrieve user subscription status")
	// 	return
	// }
	// if subscriberID == "" {
	// 	blocks, err := dao.GetStoryParagraphs(storyID, storyBlocks.ChapterID, "")
	// 	if err != nil {
	// 		RespondWithError(w, http.StatusInternalServerError, "unable to retrieve story block count")
	// 		return
	// 	}
	// 	if len(blocks.Items) >= MAX_UNSUBSCRIBED_BLOCK_COUNT {
	// 		RespondWithError(w, http.StatusUnauthorized, "insufficient subscription")
	// 		return
	// 	}
	// }

	if err = dao.WriteBlocks(storyID, &storyBlocks); err != nil {
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

func WriteAssocationsEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		email   string
		err     error
		storyID string
		dao     daos.DaoInterface
		ok      bool
	)
	if email, err = getUserEmail(r); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
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
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	for idx, assoc := range associations {
		if assoc.ID == "" {
			associations[idx].ID = uuid.New().String()
		}
	}
	if dao, ok = r.Context().Value("dao").(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	var storyOrSeriesID string
	if storyOrSeriesID, err = dao.IsStoryInASeries(email, storyID); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "unable to check series membership of story")
		return
	}
	if storyOrSeriesID == "" {
		storyOrSeriesID = storyID
	}

	if err = dao.WriteAssociations(email, storyOrSeriesID, associations); err != nil {
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
	RespondWithJson(w, http.StatusOK, associations)
}

func UploadPortraitEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		email           string
		err             error
		storyID         string
		associationID   string
		associationType string
		dao             daos.DaoInterface
		ok              bool
		awsCfg          aws.Config
	)
	const maxFileSize = 1024 * 1024 // 1 MB
	if email, err = getUserEmail(r); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
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
	if associationID, err = url.PathUnescape(mux.Vars(r)["association"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing association name")
		return
	}
	if associationID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing association name")
		return
	}
	associationType = r.URL.Query().Get("type")
	if associationType == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing association type")
		return
	}

	err = r.ParseMultipartForm(10 << 20)
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, "Unable to parse file")
		return
	}

	file, handler, err := r.FormFile("file")
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	defer file.Close()

	allowedTypes := []string{"image/jpeg", "image/png", "image/gif"}
	fileBytes := make([]byte, handler.Size)
	if _, err := file.Read(fileBytes); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	fileType := http.DetectContentType(fileBytes)
	allowed := false
	for _, t := range allowedTypes {
		if fileType == t {
			allowed = true
			break
		}
	}
	if !allowed {
		RespondWithError(w, http.StatusBadRequest, "Invalid file type")
		return
	}

	if _, err := file.Seek(0, io.SeekStart); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to read the image file")
		return
	}
	// Scale down the image if it exceeds the maximum width
	scaledImageBuf, _, err := scaleDownImage(file, uint(400))
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	// Check the size of the scaled image
	if scaledImageBuf.Len() > maxFileSize {
		RespondWithError(w, http.StatusBadRequest, "Filesize must be < 1MB")
		return
	}

	if dao, ok = r.Context().Value("dao").(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	var storyOrSeriesID string
	if storyOrSeriesID, err = dao.IsStoryInASeries(email, storyID); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if storyOrSeriesID == "" {
		storyOrSeriesID = storyID
	}

	ext := filepath.Ext(handler.Filename)
	safeEmail := strings.ToLower(strings.ReplaceAll(email, "@", "-"))
	filename := safeEmail + "_" + storyOrSeriesID + "_" + associationID + "_" + associationType + ext

	if awsCfg, err = config.LoadDefaultConfig(context.TODO(), func(opts *config.LoadOptions) error {
		opts.Region = os.Getenv("AWS_REGION")
		return nil
	}); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s3Client := s3.NewFromConfig(awsCfg)
	if _, err = s3Client.PutObject(context.Background(), &s3.PutObjectInput{
		Bucket:      aws.String(S3_CUSTOM_PORTRAIT_BUCKET),
		Key:         aws.String(filename),
		Body:        scaledImageBuf,
		ContentType: aws.String(fileType),
	}); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	portraitURL := "https://" + S3_CUSTOM_PORTRAIT_BUCKET + ".s3." + os.Getenv("AWS_REGION") + ".amazonaws.com/" + filename
	if err = dao.UpdateAssociationPortraitEntryInDB(email, storyOrSeriesID, associationID, portraitURL); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	RespondWithJson(w, http.StatusOK, models.Answer{Success: true, URL: portraitURL})
}
