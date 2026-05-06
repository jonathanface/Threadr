package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/url"

	ctxkey "Threadr/ctxkeys"
	"Threadr/daos"
	"Threadr/logger"
	"Threadr/models"

	"github.com/aws/smithy-go"
	"github.com/google/uuid"
	"github.com/gorilla/mux"
)

func CreateAssociationsEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		email        string
		err          error
		storyID      string
		dao          daos.DaoInterface
		ok           bool
		isSubscriber bool
	)
	if email, err = getUserEmail(r); err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
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

	if isSubscriber, ok = r.Context().Value(ctxkey.Subscriber).(bool); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve subscriber key from context")
		return
	}

	if !isSubscriber {
		existingAssoc, err := dao.GetStoryOrSeriesAssociationThumbnails(r.Context(), email, storyID) //nolint:govet
		if err != nil {
			opErr := &smithy.OperationError{}
			if errors.As(err, &opErr) {
				awsResponse := processAWSError(opErr)
				if awsResponse.Code == 0 {
					logger.Error("Internal error", "error", err)
					RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
					return
				}
				RespondWithError(w, awsResponse.Code, awsResponse.Message)
				return
			}
			logger.Error("Internal error", "error", err)
			RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
			return
		}
		if len(existingAssoc) >= nonSubscriberMaxAssoc {
			RespondWithError(w, http.StatusPaymentRequired, "insufficient subscription")
			return
		}
	}

	decoder := json.NewDecoder(r.Body)
	associations := []*models.Association{}
	if err = decoder.Decode(&associations); err != nil {
		logger.Error("Bad request", "error", err)
		RespondWithError(w, http.StatusBadRequest, "Invalid request")
		return
	}
	for idx, assoc := range associations {
		if assoc.ID == "" {
			associations[idx].ID = uuid.New().String()
		}
	}

	var storyOrSeriesID string
	if storyOrSeriesID, err = dao.IsStoryInASeries(r.Context(), email, storyID); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "unable to check series membership of story")
		return
	}
	if storyOrSeriesID == "" {
		storyOrSeriesID = storyID
	}
	if err = dao.WriteAssociations(r.Context(), email, storyOrSeriesID, associations); err != nil {
		opErr := &smithy.OperationError{}
		if errors.As(err, &opErr) {
			awsResponse := processAWSError(opErr)
			if awsResponse.Code == 0 {
				logger.Error("Internal error", "error", err)
				RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
				return
			}
			RespondWithError(w, awsResponse.Code, awsResponse.Message)
			return
		}
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	RespondWithJSON(w, http.StatusOK, associations)
}
