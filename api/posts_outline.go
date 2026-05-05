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

func CreateOutlineEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		err error
		dao daos.DaoInterface
		ok  bool
	)

	decoder := json.NewDecoder(r.Body)
	outline := models.OutlineRequest{}
	if err = decoder.Decode(&outline); err != nil {
		logger.Error("Bad request", "error", err)
		RespondWithError(w, http.StatusBadRequest, "Invalid request")
		return
	}

	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	outlineResponse, err := dao.CreateOutline(r.Context(), outline)
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
	RespondWithJson(w, http.StatusOK, outlineResponse)
}
