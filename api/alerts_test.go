package api

import (
	ctxkey "Threadr/ctxkeys"
	"Threadr/daos"
	"Threadr/models"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/gorilla/mux"
)

func init() {
	SetupTestSession()
}

// ---------------------------------------------------------------------------
// GetUserAlertsEndpoint
// ---------------------------------------------------------------------------

func TestGetUserAlertsEndpoint_Success(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetAlertsForUser = func(email string) ([]models.Alert, error) {
		return []models.Alert{
			{ID: "a1", Subject: "Alert 1", AlertType: models.AlertTypeAnnouncement, CreatedBy: "admin"},
			{ID: "a2", Subject: "Alert 2", AlertType: models.AlertTypePersonal, CreatedBy: "system"},
			{ID: "a3", Subject: "Alert 3", AlertType: models.AlertTypeAnnouncement, CreatedBy: "admin"},
		}, nil
	}
	mockDAO.MockGetAlertReadsByUser = func(email string) ([]models.AlertRead, error) {
		return []models.AlertRead{
			{AlertID: "a1", Email: email, ReadAt: 1000},
		}, nil
	}

	req := createTestRequestWithSession("GET", "/alerts", nil)
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	GetUserAlertsEndpoint(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("Expected status 200, got %d. Body: %s", rr.Code, rr.Body.String())
	}

	var resp models.AlertsResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Failed to unmarshal response: %v", err)
	}

	if len(resp.Alerts) != 3 {
		t.Fatalf("Expected 3 alerts, got %d", len(resp.Alerts))
	}
	if resp.UnreadCount != 2 {
		t.Errorf("Expected unread count 2, got %d", resp.UnreadCount)
	}

	// a1 should be read
	if !resp.Alerts[0].Read {
		t.Error("Expected alert a1 to be marked read")
	}
	if resp.Alerts[0].ReadAt != 1000 {
		t.Errorf("Expected ReadAt 1000, got %d", resp.Alerts[0].ReadAt)
	}

	// a2 and a3 should be unread
	if resp.Alerts[1].Read {
		t.Error("Expected alert a2 to be unread")
	}
	if resp.Alerts[2].Read {
		t.Error("Expected alert a3 to be unread")
	}
}

func TestGetUserAlertsEndpoint_NoDAO(t *testing.T) {
	req := createTestRequestWithSession("GET", "/alerts", nil)
	// No DAO in context

	rr := httptest.NewRecorder()
	GetUserAlertsEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d", rr.Code)
	}

	var resp map[string]string
	json.Unmarshal(rr.Body.Bytes(), &resp)
	if resp["error"] != "unable to parse or retrieve dao from context" {
		t.Errorf("Expected DAO error, got '%s'", resp["error"])
	}
}

func TestGetUserAlertsEndpoint_DAOErrorGetAlerts(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetAlertsForUser = func(email string) ([]models.Alert, error) {
		return nil, errors.New("dynamo connection failed")
	}

	req := createTestRequestWithSession("GET", "/alerts", nil)
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	GetUserAlertsEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d", rr.Code)
	}
}

func TestGetUserAlertsEndpoint_DAOErrorGetReads(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetAlertsForUser = func(email string) ([]models.Alert, error) {
		return []models.Alert{{ID: "a1"}}, nil
	}
	mockDAO.MockGetAlertReadsByUser = func(email string) ([]models.AlertRead, error) {
		return nil, errors.New("reads table error")
	}

	req := createTestRequestWithSession("GET", "/alerts", nil)
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	GetUserAlertsEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d", rr.Code)
	}
}

// ---------------------------------------------------------------------------
// GetUnreadAlertCountEndpoint
// ---------------------------------------------------------------------------

func TestGetUnreadAlertCountEndpoint_Success(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetAlertsForUser = func(email string) ([]models.Alert, error) {
		return []models.Alert{
			{ID: "a1"},
			{ID: "a2"},
			{ID: "a3"},
		}, nil
	}
	mockDAO.MockGetAlertReadsByUser = func(email string) ([]models.AlertRead, error) {
		return []models.AlertRead{
			{AlertID: "a2", Email: email, ReadAt: 999},
		}, nil
	}

	req := createTestRequestWithSession("GET", "/alerts/unread-count", nil)
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	GetUnreadAlertCountEndpoint(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("Expected status 200, got %d. Body: %s", rr.Code, rr.Body.String())
	}

	var resp map[string]int
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Failed to unmarshal response: %v", err)
	}
	if resp["unread_count"] != 2 {
		t.Errorf("Expected unread_count 2, got %d", resp["unread_count"])
	}
}

func TestGetUnreadAlertCountEndpoint_AllRead(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetAlertsForUser = func(email string) ([]models.Alert, error) {
		return []models.Alert{
			{ID: "a1"},
			{ID: "a2"},
		}, nil
	}
	mockDAO.MockGetAlertReadsByUser = func(email string) ([]models.AlertRead, error) {
		return []models.AlertRead{
			{AlertID: "a1", Email: email, ReadAt: 100},
			{AlertID: "a2", Email: email, ReadAt: 200},
		}, nil
	}

	req := createTestRequestWithSession("GET", "/alerts/unread-count", nil)
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	GetUnreadAlertCountEndpoint(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("Expected status 200, got %d", rr.Code)
	}

	var resp map[string]int
	json.Unmarshal(rr.Body.Bytes(), &resp)
	if resp["unread_count"] != 0 {
		t.Errorf("Expected unread_count 0, got %d", resp["unread_count"])
	}
}

// ---------------------------------------------------------------------------
// MarkAlertReadEndpoint
// ---------------------------------------------------------------------------

func TestMarkAlertReadEndpoint_Success(t *testing.T) {
	var markedEmail, markedAlertID string
	mockDAO := daos.NewMockDAO()
	mockDAO.MockMarkAlertRead = func(email, alertID string) error {
		markedEmail = email
		markedAlertID = alertID
		return nil
	}

	req := createTestRequestWithSession("PUT", "/alerts/alert-123/read", nil)
	req = mux.SetURLVars(req, map[string]string{"alertID": "alert-123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	MarkAlertReadEndpoint(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("Expected status 200, got %d. Body: %s", rr.Code, rr.Body.String())
	}
	if markedEmail != "test@example.com" {
		t.Errorf("Expected email 'test@example.com', got '%s'", markedEmail)
	}
	if markedAlertID != "alert-123" {
		t.Errorf("Expected alertID 'alert-123', got '%s'", markedAlertID)
	}
}

func TestMarkAlertReadEndpoint_MissingAlertID(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	req := createTestRequestWithSession("PUT", "/alerts//read", nil)
	req = mux.SetURLVars(req, map[string]string{"alertID": ""})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	MarkAlertReadEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", rr.Code)
	}

	var resp map[string]string
	json.Unmarshal(rr.Body.Bytes(), &resp)
	if resp["error"] != "Missing alert ID" {
		t.Errorf("Expected 'Missing alert ID', got '%s'", resp["error"])
	}
}

func TestMarkAlertReadEndpoint_DAOError(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockMarkAlertRead = func(email, alertID string) error {
		return errors.New("write failed")
	}

	req := createTestRequestWithSession("PUT", "/alerts/alert-123/read", nil)
	req = mux.SetURLVars(req, map[string]string{"alertID": "alert-123"})
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	MarkAlertReadEndpoint(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d", rr.Code)
	}
}

// ---------------------------------------------------------------------------
// AdminCreateAlertEndpoint
// ---------------------------------------------------------------------------

func TestAdminCreateAlertEndpoint_SuccessAnnouncement(t *testing.T) {
	var createdAlert models.Alert
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return &models.UserInfo{Email: email, Admin: true}, nil
	}
	mockDAO.MockCreateAlert = func(alert models.Alert) error {
		createdAlert = alert
		return nil
	}

	payload := models.CreateAlertRequest{
		Subject:   "System Maintenance",
		Message:   "Scheduled downtime tonight",
		Link:      "https://status.example.com",
		AlertType: models.AlertTypeAnnouncement,
	}
	body, _ := json.Marshal(payload)

	req := createTestRequestWithSession("POST", "/admin/alerts", body)
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	AdminCreateAlertEndpoint(rr, req)

	if rr.Code != http.StatusCreated {
		t.Fatalf("Expected status 201, got %d. Body: %s", rr.Code, rr.Body.String())
	}

	if createdAlert.Subject != "System Maintenance" {
		t.Errorf("Expected subject 'System Maintenance', got '%s'", createdAlert.Subject)
	}
	if createdAlert.AlertType != models.AlertTypeAnnouncement {
		t.Errorf("Expected alert type 'announcement', got '%s'", createdAlert.AlertType)
	}
	if createdAlert.CreatedBy != "admin" {
		t.Errorf("Expected created_by 'admin', got '%s'", createdAlert.CreatedBy)
	}
	if createdAlert.ID == "" {
		t.Error("Expected alert ID to be generated")
	}

	// Verify response body contains the alert
	var respAlert models.Alert
	json.Unmarshal(rr.Body.Bytes(), &respAlert)
	if respAlert.Subject != "System Maintenance" {
		t.Errorf("Response subject mismatch: got '%s'", respAlert.Subject)
	}
}

func TestAdminCreateAlertEndpoint_SuccessPersonal(t *testing.T) {
	var createdAlert models.Alert
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return &models.UserInfo{Email: email, Admin: true}, nil
	}
	mockDAO.MockCreateAlert = func(alert models.Alert) error {
		createdAlert = alert
		return nil
	}

	payload := models.CreateAlertRequest{
		Subject:     "Welcome!",
		Message:     "Welcome to the platform",
		AlertType:   models.AlertTypePersonal,
		TargetEmail: "newuser@example.com",
	}
	body, _ := json.Marshal(payload)

	req := createTestRequestWithSession("POST", "/admin/alerts", body)
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	AdminCreateAlertEndpoint(rr, req)

	if rr.Code != http.StatusCreated {
		t.Fatalf("Expected status 201, got %d. Body: %s", rr.Code, rr.Body.String())
	}

	if createdAlert.AlertType != models.AlertTypePersonal {
		t.Errorf("Expected alert type 'personal', got '%s'", createdAlert.AlertType)
	}
	if createdAlert.TargetEmail != "newuser@example.com" {
		t.Errorf("Expected target email 'newuser@example.com', got '%s'", createdAlert.TargetEmail)
	}
}

func TestAdminCreateAlertEndpoint_NotAdmin(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return &models.UserInfo{Email: email, Admin: false}, nil
	}

	payload := models.CreateAlertRequest{
		Subject:   "Sneaky",
		Message:   "Should not work",
		AlertType: models.AlertTypeAnnouncement,
	}
	body, _ := json.Marshal(payload)

	req := createTestRequestWithSession("POST", "/admin/alerts", body)
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	AdminCreateAlertEndpoint(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("Expected status 403, got %d", rr.Code)
	}

	var resp map[string]string
	json.Unmarshal(rr.Body.Bytes(), &resp)
	if resp["error"] != "admin access required" {
		t.Errorf("Expected 'admin access required', got '%s'", resp["error"])
	}
}

func TestAdminCreateAlertEndpoint_MissingSubject(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return &models.UserInfo{Email: email, Admin: true}, nil
	}

	payload := models.CreateAlertRequest{
		Message:   "No subject",
		AlertType: models.AlertTypeAnnouncement,
	}
	body, _ := json.Marshal(payload)

	req := createTestRequestWithSession("POST", "/admin/alerts", body)
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	AdminCreateAlertEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", rr.Code)
	}

	var resp map[string]string
	json.Unmarshal(rr.Body.Bytes(), &resp)
	if resp["error"] != "Subject is required" {
		t.Errorf("Expected 'Subject is required', got '%s'", resp["error"])
	}
}

func TestAdminCreateAlertEndpoint_MissingMessage(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return &models.UserInfo{Email: email, Admin: true}, nil
	}

	payload := models.CreateAlertRequest{
		Subject:   "Has subject",
		AlertType: models.AlertTypeAnnouncement,
	}
	body, _ := json.Marshal(payload)

	req := createTestRequestWithSession("POST", "/admin/alerts", body)
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	AdminCreateAlertEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", rr.Code)
	}

	var resp map[string]string
	json.Unmarshal(rr.Body.Bytes(), &resp)
	if resp["error"] != "Message is required" {
		t.Errorf("Expected 'Message is required', got '%s'", resp["error"])
	}
}

func TestAdminCreateAlertEndpoint_InvalidAlertType(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return &models.UserInfo{Email: email, Admin: true}, nil
	}

	payload := map[string]string{
		"subject":    "Test",
		"message":    "Test message",
		"alert_type": "invalid_type",
	}
	body, _ := json.Marshal(payload)

	req := createTestRequestWithSession("POST", "/admin/alerts", body)
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	AdminCreateAlertEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d. Body: %s", rr.Code, rr.Body.String())
	}

	var resp map[string]string
	json.Unmarshal(rr.Body.Bytes(), &resp)
	if resp["error"] != `alert_type must be "announcement" or "personal"` {
		t.Errorf("Expected alert_type error, got '%s'", resp["error"])
	}
}

func TestAdminCreateAlertEndpoint_PersonalMissingTargetEmail(t *testing.T) {
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
		return &models.UserInfo{Email: email, Admin: true}, nil
	}

	payload := models.CreateAlertRequest{
		Subject:   "Personal alert",
		Message:   "This is personal",
		AlertType: models.AlertTypePersonal,
		// TargetEmail intentionally omitted
	}
	body, _ := json.Marshal(payload)

	req := createTestRequestWithSession("POST", "/admin/alerts", body)
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	rr := httptest.NewRecorder()
	AdminCreateAlertEndpoint(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", rr.Code)
	}

	var resp map[string]string
	json.Unmarshal(rr.Body.Bytes(), &resp)
	if resp["error"] != "target_email is required for personal alerts" {
		t.Errorf("Expected target_email error, got '%s'", resp["error"])
	}
}

// ---------------------------------------------------------------------------
// CreateCommentAlert (helper function)
// ---------------------------------------------------------------------------

func TestCreateCommentAlert_CreatesWhenNoneExists(t *testing.T) {
	var createCalled int32
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetAlertsForUser = func(email string) ([]models.Alert, error) {
		return []models.Alert{}, nil // no existing alerts
	}
	mockDAO.MockGetAlertReadsByUser = func(email string) ([]models.AlertRead, error) {
		return []models.AlertRead{}, nil
	}
	mockDAO.MockCreateAlert = func(alert models.Alert) error {
		atomic.AddInt32(&createCalled, 1)
		if alert.Subject != "New comment on My Story" {
			t.Errorf("Expected subject 'New comment on My Story', got '%s'", alert.Subject)
		}
		if alert.TargetEmail != "author@example.com" {
			t.Errorf("Expected target 'author@example.com', got '%s'", alert.TargetEmail)
		}
		if alert.CreatedBy != "system" {
			t.Errorf("Expected created_by 'system', got '%s'", alert.CreatedBy)
		}
		if alert.Link != "/stories/story-42" {
			t.Errorf("Expected link '/stories/story-42', got '%s'", alert.Link)
		}
		if alert.AlertType != models.AlertTypePersonal {
			t.Errorf("Expected alert type 'personal', got '%s'", alert.AlertType)
		}
		return nil
	}

	ctx := context.Background()
	CreateCommentAlert(ctx, mockDAO, "author@example.com", "Jane Reader", "My Story", "story-42")

	if atomic.LoadInt32(&createCalled) != 1 {
		t.Errorf("Expected CreateAlert to be called once, called %d times", createCalled)
	}
}

func TestCreateCommentAlert_SkipsWhenUnreadAlertExists(t *testing.T) {
	var createCalled int32
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetAlertsForUser = func(email string) ([]models.Alert, error) {
		return []models.Alert{
			{
				ID:        "existing-alert",
				Subject:   "New comment on My Story",
				CreatedBy: "system",
				AlertType: models.AlertTypePersonal,
			},
		}, nil
	}
	mockDAO.MockGetAlertReadsByUser = func(email string) ([]models.AlertRead, error) {
		return []models.AlertRead{}, nil // not read yet
	}
	mockDAO.MockCreateAlert = func(alert models.Alert) error {
		atomic.AddInt32(&createCalled, 1)
		return nil
	}

	ctx := context.Background()
	CreateCommentAlert(ctx, mockDAO, "author@example.com", "Jane Reader", "My Story", "story-42")

	if atomic.LoadInt32(&createCalled) != 0 {
		t.Errorf("Expected CreateAlert NOT to be called, but it was called %d times", createCalled)
	}
}

func TestCreateCommentAlert_CreatesAfterPreviousWasRead(t *testing.T) {
	var createCalled int32
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetAlertsForUser = func(email string) ([]models.Alert, error) {
		return []models.Alert{
			{
				ID:        "old-alert",
				Subject:   "New comment on My Story",
				CreatedBy: "system",
				AlertType: models.AlertTypePersonal,
			},
		}, nil
	}
	mockDAO.MockGetAlertReadsByUser = func(email string) ([]models.AlertRead, error) {
		return []models.AlertRead{
			{AlertID: "old-alert", Email: email, ReadAt: 5000}, // already read
		}, nil
	}
	mockDAO.MockCreateAlert = func(alert models.Alert) error {
		atomic.AddInt32(&createCalled, 1)
		return nil
	}

	ctx := context.Background()
	CreateCommentAlert(ctx, mockDAO, "author@example.com", "Jane Reader", "My Story", "story-42")

	if atomic.LoadInt32(&createCalled) != 1 {
		t.Errorf("Expected CreateAlert to be called once (previous was read), called %d times", createCalled)
	}
}

func TestCreateCommentAlert_DifferentStoryDoesNotDedup(t *testing.T) {
	var createCalled int32
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetAlertsForUser = func(email string) ([]models.Alert, error) {
		return []models.Alert{
			{
				ID:        "other-story-alert",
				Subject:   "New comment on Other Story", // different story
				CreatedBy: "system",
				AlertType: models.AlertTypePersonal,
			},
		}, nil
	}
	mockDAO.MockGetAlertReadsByUser = func(email string) ([]models.AlertRead, error) {
		return []models.AlertRead{}, nil // unread, but for different story
	}
	mockDAO.MockCreateAlert = func(alert models.Alert) error {
		atomic.AddInt32(&createCalled, 1)
		return nil
	}

	ctx := context.Background()
	CreateCommentAlert(ctx, mockDAO, "author@example.com", "Jane Reader", "My Story", "story-42")

	if atomic.LoadInt32(&createCalled) != 1 {
		t.Errorf("Expected CreateAlert to be called (different story), called %d times", createCalled)
	}
}

func TestCreateCommentAlert_FallsThroughOnGetAlertsError(t *testing.T) {
	var createCalled int32
	mockDAO := daos.NewMockDAO()
	mockDAO.MockGetAlertsForUser = func(email string) ([]models.Alert, error) {
		return nil, errors.New("dynamo timeout")
	}
	mockDAO.MockCreateAlert = func(alert models.Alert) error {
		atomic.AddInt32(&createCalled, 1)
		return nil
	}

	ctx := context.Background()
	CreateCommentAlert(ctx, mockDAO, "author@example.com", "Jane Reader", "My Story", "story-42")

	// Should still create the alert even though dedup check failed
	if atomic.LoadInt32(&createCalled) != 1 {
		t.Errorf("Expected CreateAlert to be called (fallthrough on error), called %d times", createCalled)
	}
}
