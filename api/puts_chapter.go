package api

import (
	ctxkey "Threadr/ctxkeys"
	"Threadr/daos"
	"Threadr/models"
	"encoding/json"
	"net/http"
	"net/url"

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
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	for _, chapter := range newChapters {
		if _, err = dao.EditChapter(r.Context(), storyID, chapter); err != nil {
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
	}
	RespondWithJson(w, http.StatusOK, newChapters)
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
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}

	var updatedChapter models.Chapter
	if updatedChapter, err = dao.EditChapter(r.Context(), storyID, newChapter); err != nil {
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
	RespondWithJson(w, http.StatusOK, updatedChapter)
}
