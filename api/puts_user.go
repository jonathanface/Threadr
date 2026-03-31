package api

import (
	ctxkey "Threadr/ctxkeys"
	"Threadr/daos"
	"Threadr/models"
	"encoding/json"
	"net/http"

	"github.com/aws/smithy-go"
)

func UpdateUserEndpoint(w http.ResponseWriter, r *http.Request) {
	//var userID string
	var dao daos.DaoInterface
	var err error
	var ok bool

	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}
	email, err := getUserEmail(r)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
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
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}

	if err = dao.UpdateUser(r.Context(), *user); err != nil {
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
