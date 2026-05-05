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

func CreateStoryChapterEndpoint(w http.ResponseWriter, r *http.Request) {
	// this should be transactified
	var (
		err        error
		storyID    string
		dao        daos.DaoInterface
		ok         bool
		newChapter models.Chapter
		email      string
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

	decoder := json.NewDecoder(r.Body)
	chapter := models.Chapter{}
	if err := decoder.Decode(&chapter); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}
	chapter.ID = uuid.New().String()
	if chapter.Place == 0 {
		chapter.Place = 1
	}

	if newChapter, err = dao.CreateChapter(r.Context(), storyID, chapter, email); err != nil {
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
	RespondWithJson(w, http.StatusOK, newChapter)
}
