package api

import (
	ctxkey "Threadr/ctxkeys"
	"Threadr/daos"
	"Threadr/models"
	"encoding/json"
	"net/http"

	"github.com/aws/smithy-go"
)

func CreateOutlineEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		err error
		dao daos.DaoInterface
		ok  bool
	)

	decoder := json.NewDecoder(r.Body)
	outline := models.OutlineRequest{}
	if err = decoder.Decode(&outline); err != nil {
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}

	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	outlineResponse, err := dao.CreateOutline(r.Context(), outline)
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
	RespondWithJson(w, http.StatusOK, outlineResponse)
}
