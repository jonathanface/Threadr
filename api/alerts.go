package api

import (
	"context"
	"encoding/json"
	"html"
	"net/http"
	"time"

	ctxkey "Threadr/ctxkeys"
	"Threadr/daos"
	"Threadr/logger"
	"Threadr/models"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
)

func GetUserAlertsEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		email string
		err   error
		dao   daos.DaoInterface
		ok    bool
	)
	if email, err = getUserEmail(r); err != nil {
		logger.Error("Authentication failed", "error", err)
		RespondWithError(w, http.StatusUnauthorized, "Authentication failed")
		return
	}
	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	alerts, err := dao.GetAlertsForUser(r.Context(), email)
	if err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}

	reads, err := dao.GetAlertReadsByUser(r.Context(), email)
	if err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}

	readMap := make(map[string]int64, len(reads))
	for _, rd := range reads {
		readMap[rd.AlertID] = rd.ReadAt
	}

	userAlerts := make([]models.UserAlert, 0, len(alerts))
	unreadCount := 0
	for _, a := range alerts {
		ua := models.UserAlert{Alert: a}
		if readAt, found := readMap[a.ID]; found {
			ua.Read = true
			ua.ReadAt = readAt
		} else {
			unreadCount++
		}
		userAlerts = append(userAlerts, ua)
	}

	RespondWithJson(w, http.StatusOK, models.AlertsResponse{
		Alerts:      userAlerts,
		UnreadCount: unreadCount,
	})
}

func GetUnreadAlertCountEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		email string
		err   error
		dao   daos.DaoInterface
		ok    bool
	)
	if email, err = getUserEmail(r); err != nil {
		logger.Error("Authentication failed", "error", err)
		RespondWithError(w, http.StatusUnauthorized, "Authentication failed")
		return
	}
	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	alerts, err := dao.GetAlertsForUser(r.Context(), email)
	if err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}

	reads, err := dao.GetAlertReadsByUser(r.Context(), email)
	if err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}

	readSet := make(map[string]bool, len(reads))
	for _, rd := range reads {
		readSet[rd.AlertID] = true
	}

	unreadCount := 0
	for _, a := range alerts {
		if !readSet[a.ID] {
			unreadCount++
		}
	}

	RespondWithJson(w, http.StatusOK, map[string]int{"unread_count": unreadCount})
}

func MarkAlertReadEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		email   string
		alertID string
		err     error
		dao     daos.DaoInterface
		ok      bool
	)
	if email, err = getUserEmail(r); err != nil {
		logger.Error("Authentication failed", "error", err)
		RespondWithError(w, http.StatusUnauthorized, "Authentication failed")
		return
	}
	alertID = mux.Vars(r)["alertID"]
	if alertID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing alert ID")
		return
	}
	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	if err = dao.MarkAlertRead(r.Context(), email, alertID); err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	RespondWithJson(w, http.StatusOK, nil)
}

func AdminCreateAlertEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		email string
		err   error
		dao   daos.DaoInterface
		ok    bool
	)
	if email, err = getUserEmail(r); err != nil {
		logger.Error("Authentication failed", "error", err)
		RespondWithError(w, http.StatusUnauthorized, "Authentication failed")
		return
	}
	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	// Check if requesting user is an admin
	userDetails, err := dao.GetUserDetails(r.Context(), email)
	if err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	if !userDetails.Admin {
		RespondWithError(w, http.StatusForbidden, "admin access required")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 4096) //nolint:mnd
	decoder := json.NewDecoder(r.Body)
	var req models.CreateAlertRequest
	if err = decoder.Decode(&req); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Subject == "" {
		RespondWithError(w, http.StatusBadRequest, "Subject is required")
		return
	}
	if req.Message == "" {
		RespondWithError(w, http.StatusBadRequest, "Message is required")
		return
	}
	if req.AlertType != models.AlertTypeAnnouncement && req.AlertType != models.AlertTypePersonal {
		RespondWithError(w, http.StatusBadRequest, "alert_type must be \"announcement\" or \"personal\"")
		return
	}
	if req.AlertType == models.AlertTypePersonal && req.TargetEmail == "" {
		RespondWithError(w, http.StatusBadRequest, "target_email is required for personal alerts")
		return
	}

	alert := models.Alert{
		ID:          uuid.New().String(),
		Subject:     req.Subject,
		Message:     req.Message,
		Link:        req.Link,
		AlertType:   req.AlertType,
		TargetEmail: req.TargetEmail,
		CreatedAt:   time.Now().Unix(),
		CreatedBy:   "admin",
	}

	if err = dao.CreateAlert(r.Context(), alert); err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	RespondWithJson(w, http.StatusCreated, alert)
}

// CreateSystemAlert is an exported helper for other endpoints to create system-generated alerts.
func CreateSystemAlert(ctx context.Context, dao daos.DaoInterface, targetEmail, subject, message, link string) {
	alert := models.Alert{
		ID:          uuid.New().String(),
		Subject:     subject,
		Message:     message,
		Link:        link,
		AlertType:   models.AlertTypePersonal,
		TargetEmail: targetEmail,
		CreatedAt:   time.Now().Unix(),
		CreatedBy:   "system",
	}
	if err := dao.CreateAlert(ctx, alert); err != nil {
		logger.Error("Failed to create system alert",
			"error", err,
			"targetEmail", targetEmail)
	}
}

// CreateCommentAlert creates a comment notification only if there isn't already
// an unread alert from the same reader about the same story.
func CreateCommentAlert(
	ctx context.Context,
	dao daos.DaoInterface,
	authorEmail, readerName, storyTitle, storyID string,
) {
	subject := "New comment on " + storyTitle
	// Check if there's already an unread alert about this reader + story
	alerts, err := dao.GetAlertsForUser(ctx, authorEmail)
	if err != nil {
		logger.Error("Failed to check existing alerts for comment dedup", "error", err)
		// Fall through and create anyway rather than silently dropping
	}

	if err == nil {
		reads, _ := dao.GetAlertReadsByUser(ctx, authorEmail)
		readSet := make(map[string]bool, len(reads))
		for _, r := range reads {
			readSet[r.AlertID] = true
		}

		for _, a := range alerts {
			if a.CreatedBy == "system" && a.Subject == subject && !readSet[a.ID] {
				// Already have an unread alert for this reader + story
				return
			}
		}
	}

	alert := models.Alert{
		ID:          uuid.New().String(),
		Subject:     subject,
		Message:     html.EscapeString(readerName) + " left a comment on \"" + html.EscapeString(storyTitle) + "\"",
		Link:        "/stories/" + storyID,
		AlertType:   models.AlertTypePersonal,
		TargetEmail: authorEmail,
		CreatedAt:   time.Now().Unix(),
		CreatedBy:   "system",
	}
	if err := dao.CreateAlert(ctx, alert); err != nil {
		logger.Error("Failed to create comment alert",
			"error", err,
			"authorEmail", authorEmail)
	}
}
