package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	ctxkey "Threadr/ctxkeys"
	"Threadr/daos"
	"Threadr/models"

	"github.com/aws/smithy-go"
)

func init() {
	SetupTestSession()
}

func TestCreateOutlineEndpoint_Success(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockCreateOutline = func(outline models.OutlineRequest) (*models.OutlineRequest, error) {
		if outline.StoryID != "story123" {
			t.Errorf("Expected storyID story123, got %s", outline.StoryID)
		}
		return &outline, nil
	}

	outlineReq := models.OutlineRequest{
		StoryID:  "story123",
		Template: models.ThreeAct,
		Sections: []models.OutlineSection{
			{Header: "Act 1", Description: "Setup", Place: 1},
			{Header: "Act 2", Description: "Confrontation", Place: 2},
			{Header: "Act 3", Description: "Resolution", Place: 3},
		},
		Backstory: "This is the backstory",
	}
	body, _ := json.Marshal(outlineReq)

	req := httptest.NewRequest(http.MethodPost, "/api/outline", bytes.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	w := httptest.NewRecorder()

	CreateOutlineEndpoint(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status OK, got %d. Body: %s", w.Code, w.Body.String())
		return
	}

	var response models.OutlineRequest
	err := json.NewDecoder(w.Body).Decode(&response)
	if err != nil {
		t.Errorf("Failed to decode response: %v", err)
		return
	}
	if response.StoryID != "story123" {
		t.Errorf("Expected storyID story123, got %s", response.StoryID)
	}
	if response.Template != models.ThreeAct {
		t.Errorf("Expected template ThreeAct, got %s", response.Template)
	}
}

func TestCreateOutlineEndpoint_NoDAO(t *testing.T) {
	outlineReq := models.OutlineRequest{StoryID: "story123"}
	body, _ := json.Marshal(outlineReq)

	req := httptest.NewRequest(http.MethodPost, "/api/outline", bytes.NewReader(body))

	w := httptest.NewRecorder()

	CreateOutlineEndpoint(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected status InternalServerError, got %d", w.Code)
	}

	var response map[string]string
	json.NewDecoder(w.Body).Decode(&response)
	if response["error"] != "unable to parse or retrieve dao from context" {
		t.Errorf("Expected DAO error, got: %s", response["error"])
	}
}

func TestCreateOutlineEndpoint_InvalidJSON(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := httptest.NewRequest(http.MethodPost, "/api/outline", bytes.NewReader([]byte("invalid")))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	w := httptest.NewRecorder()

	CreateOutlineEndpoint(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status BadRequest, got %d", w.Code)
	}
}

func TestCreateOutlineEndpoint_DAOError(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockCreateOutline = func(outline models.OutlineRequest) (*models.OutlineRequest, error) {
		return nil, daos.ErrMockDAO
	}

	outlineReq := models.OutlineRequest{StoryID: "story123"}
	body, _ := json.Marshal(outlineReq)

	req := httptest.NewRequest(http.MethodPost, "/api/outline", bytes.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	w := httptest.NewRecorder()

	CreateOutlineEndpoint(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected status InternalServerError, got %d", w.Code)
	}
}

func TestCreateOutlineEndpoint_AWSError(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockCreateOutline = func(outline models.OutlineRequest) (*models.OutlineRequest, error) {
		return nil, &smithy.OperationError{
			ServiceID:     "DynamoDB",
			OperationName: "PutItem",
			Err:           daos.ErrMockDAO,
		}
	}

	outlineReq := models.OutlineRequest{StoryID: "story123"}
	body, _ := json.Marshal(outlineReq)

	req := httptest.NewRequest(http.MethodPost, "/api/outline", bytes.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	w := httptest.NewRecorder()

	CreateOutlineEndpoint(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected status InternalServerError, got %d", w.Code)
	}
}

func TestCreateOutlineEndpoint_FiveActTemplate(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockCreateOutline = func(outline models.OutlineRequest) (*models.OutlineRequest, error) {
		if outline.Template != models.FiveAct {
			t.Errorf("Expected template FiveAct, got %s", outline.Template)
		}
		return &outline, nil
	}

	outlineReq := models.OutlineRequest{
		StoryID:  "story123",
		Template: models.FiveAct,
		Sections: []models.OutlineSection{
			{Header: "Act 1", Description: "Exposition", Place: 1},
			{Header: "Act 2", Description: "Rising Action", Place: 2},
			{Header: "Act 3", Description: "Climax", Place: 3},
			{Header: "Act 4", Description: "Falling Action", Place: 4},
			{Header: "Act 5", Description: "Denouement", Place: 5},
		},
	}

	body, _ := json.Marshal(outlineReq)

	req := httptest.NewRequest(http.MethodPost, "/api/outline", bytes.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	w := httptest.NewRecorder()

	CreateOutlineEndpoint(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status OK, got %d", w.Code)
	}
}

func TestCreateOutlineEndpoint_HeroJourneyTemplate(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockCreateOutline = func(outline models.OutlineRequest) (*models.OutlineRequest, error) {
		if outline.Template != models.HeroJourney {
			t.Errorf("Expected template HeroJourney, got %s", outline.Template)
		}
		return &outline, nil
	}

	outlineReq := models.OutlineRequest{
		StoryID:  "story123",
		Template: models.HeroJourney,
		Sections: []models.OutlineSection{
			{Header: "Ordinary World", Description: "The hero's normal life", Place: 1},
			{Header: "Call to Adventure", Description: "The inciting incident", Place: 2},
		},
	}

	body, _ := json.Marshal(outlineReq)

	req := httptest.NewRequest(http.MethodPost, "/api/outline", bytes.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	w := httptest.NewRecorder()

	CreateOutlineEndpoint(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status OK, got %d", w.Code)
	}
}
