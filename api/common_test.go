package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"image"
	"image/color"
	"image/png"
	"net/http"
	"net/http/httptest"
	"testing"

	ctxkey "Threadr/ctxkeys"
	"Threadr/daos"
	"Threadr/models"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/aws/smithy-go"
)

func init() {
	SetupTestSession()
}

// Tests for getUserEmail.
func TestGetUserEmail_Success(t *testing.T) {
	req := createTestRequestWithSession("GET", "/test", nil)

	email, err := getUserEmail(req)
	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}
	if email != "test@example.com" {
		t.Errorf("Expected email test@example.com, got %s", email)
	}
}

func TestGetUserEmail_NoSession(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/test", nil)

	email, err := getUserEmail(req)
	if err == nil {
		t.Errorf("Expected error for missing session, got nil")
	}
	if email != "" {
		t.Errorf("Expected empty email, got %s", email)
	}
	if err.Error() != "unable to retrieve token" {
		t.Errorf("Expected 'unable to retrieve token' error, got %v", err)
	}
}

// Tests for RespondWithError.
func TestRespondWithError(t *testing.T) {
	w := httptest.NewRecorder()

	RespondWithError(w, http.StatusBadRequest, "test error message")

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", w.Code)
	}

	var response map[string]string
	err := json.NewDecoder(w.Body).Decode(&response)
	if err != nil {
		t.Errorf("Failed to decode response: %v", err)
	}

	if response["error"] != "test error message" {
		t.Errorf("Expected error message 'test error message', got %s", response["error"])
	}

	contentType := w.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("Expected Content-Type application/json, got %s", contentType)
	}
}

// Tests for RespondWithJSON.
func TestRespondWithJSON_Success(t *testing.T) {
	w := httptest.NewRecorder()

	payload := map[string]any{
		"message": "success",
		"count":   42,
		"active":  true,
	}

	RespondWithJSON(w, http.StatusOK, payload)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}

	var response map[string]any
	err := json.NewDecoder(w.Body).Decode(&response)
	if err != nil {
		t.Errorf("Failed to decode response: %v", err)
	}

	if response["message"] != "success" {
		t.Errorf("Expected message 'success', got %v", response["message"])
	}
	if response["count"].(float64) != 42 {
		t.Errorf("Expected count 42, got %v", response["count"])
	}

	contentType := w.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("Expected Content-Type application/json, got %s", contentType)
	}
}

func TestRespondWithJSON_InvalidPayload(t *testing.T) {
	w := httptest.NewRecorder()

	// Create a payload that can't be marshaled (channels can't be marshaled to JSON)
	invalidPayload := make(chan int)

	RespondWithJSON(w, http.StatusOK, invalidPayload)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500 for marshal error, got %d", w.Code)
	}
}

// Tests for processAWSError.
func TestProcessAWSError_ResourceNotFound(t *testing.T) {
	message := "Resource not found"
	innerErr := &types.ResourceNotFoundException{
		Message: &message,
	}

	opErr := &smithy.OperationError{
		ServiceID:     "DynamoDB",
		OperationName: "GetItem",
		Err:           innerErr,
	}

	result := processAWSError(opErr)

	if result.Code != http.StatusNotImplemented {
		t.Errorf("Expected status 501, got %d", result.Code)
	}
	if result.Message != message {
		t.Errorf("Expected message '%s', got '%s'", message, result.Message)
	}
}

func TestProcessAWSError_ConditionalCheckFailed(t *testing.T) {
	message := "Conditional check failed"
	innerErr := &types.ConditionalCheckFailedException{
		Message: &message,
	}

	opErr := &smithy.OperationError{
		ServiceID:     "DynamoDB",
		OperationName: "UpdateItem",
		Err:           innerErr,
	}

	result := processAWSError(opErr)

	if result.Code != http.StatusNotImplemented {
		t.Errorf("Expected status 501, got %d", result.Code)
	}
	if result.Message != message {
		t.Errorf("Expected message '%s', got '%s'", message, result.Message)
	}
}

func TestProcessAWSError_TransactionCanceled_ConditionalCheckFailed(t *testing.T) {
	code := "ConditionalCheckFailed"
	message := "Condition not met"
	innerErr := &types.TransactionCanceledException{
		Message: &message,
		CancellationReasons: []types.CancellationReason{
			{
				Code:    &code,
				Message: &message,
			},
		},
	}

	opErr := &smithy.OperationError{
		ServiceID:     "DynamoDB",
		OperationName: "TransactWriteItems",
		Err:           innerErr,
	}

	result := processAWSError(opErr)

	if result.Code != http.StatusConflict {
		t.Errorf("Expected status 409, got %d", result.Code)
	}
	if result.Message != message {
		t.Errorf("Expected message '%s', got '%s'", message, result.Message)
	}
}

func TestProcessAWSError_TransactionCanceled_ResourceNotFound(t *testing.T) {
	code := "ResourceNotFoundException"
	message := "Resource not found in transaction"
	innerErr := &types.TransactionCanceledException{
		Message: &message,
		CancellationReasons: []types.CancellationReason{
			{
				Code:    &code,
				Message: &message,
			},
		},
	}

	opErr := &smithy.OperationError{
		ServiceID:     "DynamoDB",
		OperationName: "TransactWriteItems",
		Err:           innerErr,
	}

	result := processAWSError(opErr)

	if result.Code != http.StatusNotImplemented {
		t.Errorf("Expected status 501, got %d", result.Code)
	}
	if result.Message != message {
		t.Errorf("Expected message '%s', got '%s'", message, result.Message)
	}
}

func TestProcessAWSError_TransactionCanceled_CapacityExceeded(t *testing.T) {
	code := "CapacityExceededException"
	message := "Capacity exceeded"
	innerErr := &types.TransactionCanceledException{
		Message: &message,
		CancellationReasons: []types.CancellationReason{
			{
				Code:    &code,
				Message: &message,
			},
		},
	}

	opErr := &smithy.OperationError{
		ServiceID:     "DynamoDB",
		OperationName: "TransactWriteItems",
		Err:           innerErr,
	}

	result := processAWSError(opErr)

	if result.Code != http.StatusServiceUnavailable {
		t.Errorf("Expected status 503, got %d", result.Code)
	}
	if result.Message != message {
		t.Errorf("Expected message '%s', got '%s'", message, result.Message)
	}
}

func TestProcessAWSError_UnknownError(t *testing.T) {
	// Test with an error that doesn't match any specific type
	innerErr := errors.New("some other error")

	opErr := &smithy.OperationError{
		ServiceID:     "DynamoDB",
		OperationName: "GetItem",
		Err:           innerErr,
	}

	result := processAWSError(opErr)

	if result.Code != 0 {
		t.Errorf("Expected status 0 for unknown error, got %d", result.Code)
	}
}

// Tests for staggeredStoryBlockRetrieval.
func TestStaggeredStoryBlockRetrieval_SinglePage(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetChapterParagraphs = func(_ string, _ string, _ *map[string]types.AttributeValue) (*models.BlocksData, error) {
		return &models.BlocksData{
			Items: []map[string]types.AttributeValue{
				{
					"block_id": &types.AttributeValueMemberS{Value: "block1"},
					"content":  &types.AttributeValueMemberS{Value: "Content 1"},
				},
				{
					"block_id": &types.AttributeValueMemberS{Value: "block2"},
					"content":  &types.AttributeValueMemberS{Value: "Content 2"},
				},
			},
			LastEvaluated: nil, // No more pages
		}, nil
	}

	result, err := staggeredStoryBlockRetrieval(context.Background(), mockDAO, "story123", "chapter456", nil, nil)

	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}
	if result == nil {
		t.Errorf("Expected result, got nil")
		return
	}
	if len(result.Items) != 2 {
		t.Errorf("Expected 2 blocks, got %d", len(result.Items))
	}
}

func TestStaggeredStoryBlockRetrieval_MultiplePages(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	callCount := 0

	mockDAO.MockGetChapterParagraphs = func(_ string, _ string, _ *map[string]types.AttributeValue) (*models.BlocksData, error) {
		callCount++
		if callCount == 1 {
			// First call - return data with LastEvaluated key
			lastEval := map[string]types.AttributeValue{
				"block_id": &types.AttributeValueMemberS{Value: "block2"},
			}
			return &models.BlocksData{
				Items: []map[string]types.AttributeValue{
					{
						"block_id": &types.AttributeValueMemberS{Value: "block1"},
						"content":  &types.AttributeValueMemberS{Value: "Content 1"},
					},
					{
						"block_id": &types.AttributeValueMemberS{Value: "block2"},
						"content":  &types.AttributeValueMemberS{Value: "Content 2"},
					},
				},
				LastEvaluated: lastEval,
			}, nil
		} else {
			// Second call - return final data
			return &models.BlocksData{
				Items: []map[string]types.AttributeValue{
					{
						"block_id": &types.AttributeValueMemberS{Value: "block3"},
						"content":  &types.AttributeValueMemberS{Value: "Content 3"},
					},
				},
				LastEvaluated: nil,
			}, nil
		}
	}

	result, err := staggeredStoryBlockRetrieval(context.Background(), mockDAO, "story123", "chapter456", nil, nil)

	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}
	if result == nil {
		t.Errorf("Expected result, got nil")
		return
	}
	if len(result.Items) != 3 {
		t.Errorf("Expected 3 blocks (accumulated from 2 calls), got %d", len(result.Items))
	}
	if callCount != 2 {
		t.Errorf("Expected 2 DAO calls, got %d", callCount)
	}
}

func TestStaggeredStoryBlockRetrieval_Error(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetChapterParagraphs = func(_ string, _ string, _ *map[string]types.AttributeValue) (*models.BlocksData, error) {
		return nil, errors.New("database error")
	}

	result, err := staggeredStoryBlockRetrieval(context.Background(), mockDAO, "story123", "chapter456", nil, nil)

	if err == nil {
		t.Errorf("Expected error, got nil")
	}
	if result != nil {
		t.Errorf("Expected nil result on error, got %v", result)
	}
}

func TestStaggeredStoryBlockRetrieval_NilResult(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetChapterParagraphs = func(_ string, _ string, _ *map[string]types.AttributeValue) (*models.BlocksData, error) {
		return nil, nil
	}

	result, err := staggeredStoryBlockRetrieval(context.Background(), mockDAO, "story123", "chapter456", nil, nil)

	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}
	if result != nil {
		t.Errorf("Expected nil result, got %v", result)
	}
}

// Tests for scaleDownImage.
func createTestPNGImage(width, height int) *bytes.Buffer {
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	// Fill with a color to make it more realistic
	for y := range height {
		for x := range width {
			img.Set(x, y, color.RGBA{uint8(x % 256), uint8(y % 256), 100, 255})
		}
	}
	buf := new(bytes.Buffer)
	png.Encode(buf, img)
	return buf
}

func TestScaleDownImage_NoResizeNeeded(t *testing.T) {
	// Create a 100x100 image
	imgBuf := createTestPNGImage(100, 100)

	result, format, err := scaleDownImage(imgBuf)

	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}
	if format != "png" {
		t.Errorf("Expected format 'png', got '%s'", format)
	}
	if result.Len() == 0 {
		t.Errorf("Expected non-empty result buffer")
	}
}

func TestScaleDownImage_ResizeNeeded(t *testing.T) {
	// Create a 800x600 image
	imgBuf := createTestPNGImage(800, 600)

	result, format, err := scaleDownImage(imgBuf)

	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}
	if format != "png" {
		t.Errorf("Expected format 'png', got '%s'", format)
	}
	if result.Len() == 0 {
		t.Errorf("Expected non-empty result buffer")
	}

	// Decode the result to verify it was actually resized
	decodedImg, _, err := image.Decode(result)
	if err != nil {
		t.Errorf("Failed to decode result image: %v", err)
	}
	if decodedImg.Bounds().Dx() != 400 {
		t.Errorf("Expected resized width to be 400, got %d", decodedImg.Bounds().Dx())
	}
}

func TestScaleDownImage_InvalidImage(t *testing.T) {
	// Create invalid image data
	invalidBuf := bytes.NewBufferString("not an image")

	result, format, err := scaleDownImage(invalidBuf)

	if err == nil {
		t.Errorf("Expected error for invalid image, got nil")
	}
	if result != nil {
		t.Errorf("Expected nil result on error, got %v", result)
	}
	if format != "" {
		t.Errorf("Expected empty format on error, got '%s'", format)
	}
}

// Test context integration.
func TestGetUserEmail_WithContext(t *testing.T) {
	req := createTestRequestWithSession("GET", "/test", nil)
	dao := daos.NewMockDAO()
	req = req.WithContext(req.Context())
	req = req.WithContext(req.Context())
	_ = req.Context().Value(ctxkey.DAO)

	email, err := getUserEmail(req)
	if err != nil {
		t.Errorf("Expected no error with context, got %v", err)
	}
	if email != "test@example.com" {
		t.Errorf("Expected email test@example.com, got %s", email)
	}
	_ = dao
}
