package api

import (
	"encoding/json"
	"errors"
	"net/http"

	ctxkey "Threadr/ctxkeys"
	"Threadr/daos"
	"Threadr/logger"
	"Threadr/models"

	"github.com/aws/smithy-go"
)

func UpdateUserEndpoint(w http.ResponseWriter, r *http.Request) {
	// var userID string
	var dao daos.DaoInterface
	var err error
	var ok bool

	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}
	email, err := getUserEmail(r)
	if err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}

	user, err := dao.GetUserDetails(r.Context(), email)
	if err != nil {
		RespondWithError(w, http.StatusNotFound, "Unable to locate user")
		return
	}
	decoder := json.NewDecoder(r.Body)
	passedUser := models.UserInfo{}
	if err := decoder.Decode(&passedUser); err != nil {
		logger.Error("Bad request", "error", err)
		RespondWithError(w, http.StatusBadRequest, "Invalid request")
		return
	}

	if err = dao.UpdateUser(r.Context(), *user); err != nil {
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
	RespondWithJSON(w, http.StatusOK, user)
}
