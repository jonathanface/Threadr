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
	"github.com/gorilla/mux"
)

func UpdateChaptersEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		storyID string
		err     error
		dao     daos.DaoInterface
		ok      bool
	)
	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
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

	decoder := json.NewDecoder(r.Body)
	newChapters := []models.Chapter{}
	if err := decoder.Decode(&newChapters); err != nil {
		logger.Error("Bad request", "error", err)
		RespondWithError(w, http.StatusBadRequest, "Invalid request")
		return
	}
	for _, chapter := range newChapters {
		if _, err = dao.EditChapter(r.Context(), storyID, chapter); err != nil {
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
	}
	RespondWithJSON(w, http.StatusOK, newChapters)
}

func EditChapterEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		storyID   string
		chapterID string
		err       error
		dao       daos.DaoInterface
		ok        bool
	)
	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
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
	if chapterID, err = url.PathUnescape(mux.Vars(r)["chapterID"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing chapter ID")
		return
	}
	if chapterID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing chapter ID")
		return
	}

	decoder := json.NewDecoder(r.Body)
	newChapter := models.Chapter{}
	if err := decoder.Decode(&newChapter); err != nil {
		logger.Error("Bad request", "error", err)
		RespondWithError(w, http.StatusBadRequest, "Invalid request")
		return
	}

	var updatedChapter models.Chapter
	if updatedChapter, err = dao.EditChapter(r.Context(), storyID, newChapter); err != nil {
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
	RespondWithJSON(w, http.StatusOK, updatedChapter)
}
