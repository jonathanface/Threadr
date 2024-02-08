package api

import (
	"RichDocter/daos"
	"RichDocter/models"
	"RichDocter/sessions"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/gif"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"os"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/aws/smithy-go"
	"github.com/nfnt/resize"
	stripe "github.com/stripe/stripe-go/v72"
	"github.com/stripe/stripe-go/v72/customer"
	"github.com/stripe/stripe-go/v72/paymentmethod"
	"github.com/stripe/stripe-go/v72/sub"
)

const (
	associationTypeCharacter           = "character"
	associationTypePlace               = "place"
	associationTypeEvent               = "event"
	S3_CUSTOM_PORTRAIT_BUCKET          = "richdocter-custom-portraits"
	S3_EXPORTS_BUCKET                  = "richdocter-document-exports"
	S3_STORY_IMAGE_BUCKET              = "richdocter-story-portraits"
	S3_SERIES_IMAGE_BUCKET             = "richdocter-series-portraits"
	TMP_EXPORT_DIR                     = "./tmp"
	MAX_UNSUBSCRIBED_ASSOCIATION_LIMIT = 10
)

func getUserEmail(r *http.Request) (string, error) {
	token, err := sessions.Get(r, "token")
	if err != nil || token.IsNew {
		return "", errors.New("unable to retrieve token")
	}
	user := models.UserInfo{}
	if err = json.Unmarshal(token.Values["token_data"].([]byte), &user); err != nil {
		return "", err
	}
	return user.Email, nil
}

func checkUserAdminStatus(r *http.Request) (string, error) {
	token, err := sessions.Get(r, "token")
	if err != nil || token.IsNew {
		return "", errors.New("unable to retrieve token")
	}
	user := models.UserInfo{}
	if err = json.Unmarshal(token.Values["token_data"].([]byte), &user); err != nil {
		return "", err
	}
	return user.Email, nil
}

func RespondWithError(w http.ResponseWriter, code int, msg string) {
	RespondWithJson(w, code, map[string]string{"error": msg})
}

func RespondWithJson(w http.ResponseWriter, code int, payload interface{}) {
	var (
		response []byte
		err      error
	)
	if response, err = json.Marshal(payload); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(err.Error()))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	w.Write(response)
}

func processAWSError(opErr *smithy.OperationError) (err models.AwsStatusResponse) {
	err.Code = 0
	var resourceErr *types.ResourceNotFoundException
	if errors.As(opErr.Unwrap(), &resourceErr) {
		err.Message = *resourceErr.Message
		err.Code = http.StatusNotImplemented
		return
	}

	var conditionErr *types.ConditionalCheckFailedException
	if errors.As(opErr.Unwrap(), &conditionErr) {
		err.Message = *conditionErr.Message
		err.Code = http.StatusNotImplemented
		return
	}

	var txnErr *types.TransactionCanceledException
	if errors.As(opErr.Unwrap(), &txnErr) && txnErr.CancellationReasons != nil {
		for _, reason := range txnErr.CancellationReasons {
			switch *reason.Code {
			case "ConditionalCheckFailed":
				{
					err.Message = *reason.Message
					err.Code = http.StatusConflict
				}
			case "ResourceNotFoundException":
				{
					err.Message = *reason.Message
					err.Code = http.StatusNotImplemented
				}
			case "CapacityExceededException":
				{
					err.Message = *reason.Message
					err.Code = http.StatusServiceUnavailable
				}
			}
		}
	}
	return err
}

func createSubscription(customerID string, priceID string, paymentMethodID string) (*stripe.Subscription, error) {
	stripe.Key = os.Getenv("STRIPE_SECRET")
	if stripe.Key == "" {
		return &stripe.Subscription{}, fmt.Errorf("missing stripe secret")
	}
	subscriptionParams := &stripe.SubscriptionParams{
		Customer: &customerID,
		Items: []*stripe.SubscriptionItemsParams{
			{
				Plan: &priceID,
			},
		},
		DefaultPaymentMethod: &paymentMethodID,
	}
	return sub.New(subscriptionParams)
}

func getPaymentMethodsForCustomer(customerID string) ([]models.PaymentMethod, error) {
	stripe.Key = os.Getenv("STRIPE_SECRET")
	if stripe.Key == "" {
		return nil, fmt.Errorf("missing stripe secret")
	}

	c, err := customer.Get(customerID, nil)
	if err != nil {
		return nil, err
	}
	var defaultPaymentMethodID *string
	if c.InvoiceSettings.DefaultPaymentMethod != nil {
		defaultPaymentMethodID = &c.InvoiceSettings.DefaultPaymentMethod.ID
	}
	listParams := &stripe.PaymentMethodListParams{
		Customer: stripe.String(customerID),
		Type:     stripe.String("card"), // Filter to retrieve only card payment methods
	}

	// List payment methods associated with the customer
	iter := paymentmethod.List(listParams)

	var methods []models.PaymentMethod
	for iter.Next() {
		pm := iter.PaymentMethod()
		localPM := models.PaymentMethod{}
		localPM.Id = pm.ID
		localPM.Brand = pm.Card.Brand
		localPM.LastFour = pm.Card.Last4
		localPM.ExpirationMonth = pm.Card.ExpMonth
		localPM.ExpirationYear = pm.Card.ExpYear
		if defaultPaymentMethodID != nil && *defaultPaymentMethodID == pm.ID {
			localPM.IsDefault = true
		}
		methods = append(methods, localPM)
	}
	return methods, nil
}

func staggeredStoryBlockRetrieval(dao daos.DaoInterface, email string, storyID string, chapterID string, key *map[string]types.AttributeValue, accumulatedBlocks *models.BlocksData) (*models.BlocksData, error) {
	// If this is the first call, initialize accumulatedBlocks
	if accumulatedBlocks == nil {
		accumulatedBlocks = &models.BlocksData{}
	}

	blocks, err := dao.GetChapterParagraphs(storyID, chapterID, key)
	if err != nil {
		return nil, err
	}

	// Append the retrieved blocks to accumulatedBlocks
	accumulatedBlocks.Items = append(accumulatedBlocks.Items, blocks.Items...)

	// If there are more blocks to retrieve, make a recursive call
	if blocks.LastEvaluated != nil {
		return staggeredStoryBlockRetrieval(dao, email, storyID, chapterID, &blocks.LastEvaluated, accumulatedBlocks)
	}
	return accumulatedBlocks, nil
}

func scaleDownImage(file io.Reader, maxWidth uint) (*bytes.Buffer, string, error) {
	// Decode the image
	img, format, err := image.Decode(file)
	if err != nil {
		return nil, "", err
	}

	// Resize if necessary
	if img.Bounds().Dx() > int(maxWidth) {
		img = resize.Resize(maxWidth, 0, img, resize.Lanczos3)
	}

	// Encode the image to a buffer
	buf := new(bytes.Buffer)
	switch format {
	case "jpeg":
		err = jpeg.Encode(buf, img, nil)
	case "png":
		err = png.Encode(buf, img)
	case "gif":
		err = gif.Encode(buf, img, &gif.Options{NumColors: 256})
	default:
		err = fmt.Errorf("unsupported image format: %s", format)
	}
	return buf, format, err
}

func cancelSubscription(subscriptionID string) error {
	stripe.Key = os.Getenv("STRIPE_SECRET")
	if stripe.Key == "" {
		return fmt.Errorf("missing stripe secret")
	}
	cancel := true
	subscriptionParams := &stripe.SubscriptionParams{
		CancelAtPeriodEnd: &cancel,
	}

	_, err := sub.Update(subscriptionID, subscriptionParams)
	if err != nil {
		return err
	}
	return nil
}
