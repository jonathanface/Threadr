package api

import (
	ctxkey "RichDocter/ctxkeys"
	"RichDocter/daos"
	"RichDocter/models"
	"encoding/json"
	"net/http"
	"net/url"

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
		RespondWithError(w, http.StatusInternalServerError, err.Error())
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
		existingAssoc, err := dao.GetStoryOrSeriesAssociationThumbnails(email, storyID)
		if err != nil {
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
		if len(existingAssoc) >= NON_SUBSCRIBER_MAX_ASSOC {
			RespondWithError(w, http.StatusPaymentRequired, "insufficient subscription")
			return
		}
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
