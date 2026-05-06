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
)

func init() {
	SetupTestSession()
}

func TestUpdateOutlineEndpoint_Success(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockUpdateOutline = func(outline models.OutlineRequest) (*models.OutlineResponse, error) {
		return &models.OutlineResponse{
			StoryID:  outline.StoryID,
			Template: outline.Template,
			Sections: outline.Sections,
		}, nil
	}

	outlineReq := models.OutlineRequest{
		StoryID:  "story123",
		Template: models.ThreeAct,
		Sections: []models.OutlineSection{
			{Header: "Act 1", Description: "Setup", Place: 1},
		},
	}

	body, _ := json.Marshal(outlineReq)

	req := httptest.NewRequest(http.MethodPut, "/api/outline", bytes.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	w := httptest.NewRecorder()

	UpdateOutlineEndpoint(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status OK, got %d. Body: %s", w.Code, w.Body.String())
		return
	}

	var response models.OutlineResponse
	err := json.NewDecoder(w.Body).Decode(&response)
	if err != nil {
		t.Errorf("Failed to decode response: %v", err)
		return
	}
	if response.StoryID != "story123" {
		t.Errorf("Expected storyID story123, got %s", response.StoryID)
	}
}

func TestUpdateOutlineEndpoint_NoDAO(t *testing.T) {
	outlineReq := models.OutlineRequest{StoryID: "story123"}
	body, _ := json.Marshal(outlineReq)

	req := httptest.NewRequest(http.MethodPut, "/api/outline", bytes.NewReader(body))

	w := httptest.NewRecorder()

	UpdateOutlineEndpoint(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected status InternalServerError, got %d", w.Code)
	}

	var response map[string]string
	json.NewDecoder(w.Body).Decode(&response)
	if response["error"] != "unable to parse or retrieve dao from context" {
		t.Errorf("Expected DAO error, got: %s", response["error"])
	}
}

func TestUpdateOutlineEndpoint_InvalidJSON(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := httptest.NewRequest(http.MethodPut, "/api/outline", bytes.NewReader([]byte("invalid")))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	w := httptest.NewRecorder()

	UpdateOutlineEndpoint(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status BadRequest, got %d", w.Code)
	}
}

func TestUpdateOutlineEndpoint_DAOError(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	outlineReq := models.OutlineRequest{StoryID: "story123"}
	body, _ := json.Marshal(outlineReq)

	req := httptest.NewRequest(http.MethodPut, "/api/outline", bytes.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	w := httptest.NewRecorder()

	UpdateOutlineEndpoint(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status BadRequest, got %d", w.Code)
	}
}
