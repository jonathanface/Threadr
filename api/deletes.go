package api

import (
	"RichDocter/daos"
	"RichDocter/models"
	"encoding/json"
	"net/http"
	"net/url"

	"github.com/gorilla/mux"
)

func DeleteBlocksFromStoryEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		email      string
		err        error
		storyTitle string
		dao        daos.DaoInterface
		ok         bool
	)
	if email, err = getUserEmail(r); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if storyTitle, err = url.PathUnescape(mux.Vars(r)["story"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing story name")
		return
	}
	if storyTitle == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing story ID")
		return
	}
	decoder := json.NewDecoder(r.Body)
	storyBlocks := models.StoryBlocks{}
	if err := decoder.Decode(&storyBlocks); err != nil {
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	if dao, ok = r.Context().Value("dao").(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}
	awsResponse := dao.DeleteStoryParagraphs(email, storyTitle, &storyBlocks)
	RespondWithJson(w, http.StatusOK, awsResponse)
}

func DeleteAssociationsEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		email      string
		err        error
		storyTitle string
		dao        daos.DaoInterface
		ok         bool
	)
	if email, err = getUserEmail(r); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if storyTitle, err = url.PathUnescape(mux.Vars(r)["story"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing story name")
		return
	}
	if storyTitle == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing story ID")
		return
	}
	decoder := json.NewDecoder(r.Body)
	associations := []*models.Association{}

	if err := decoder.Decode(&associations); err != nil {
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}

	if dao, ok = r.Context().Value("dao").(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}
	awsResponse := dao.DeleteAssociations(email, storyTitle, associations)
	RespondWithJson(w, http.StatusOK, awsResponse)
}

func DeleteChaptersEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		email      string
		err        error
		storyTitle string
		dao        daos.DaoInterface
		ok         bool
	)
	if email, err = getUserEmail(r); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if storyTitle, err = url.PathUnescape(mux.Vars(r)["story"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing story name")
		return
	}
	if storyTitle == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing story ID")
		return
	}
	decoder := json.NewDecoder(r.Body)
	chapters := []models.Chapter{}

	if err := decoder.Decode(&chapters); err != nil {
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}

	if dao, ok = r.Context().Value("dao").(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}
	awsResponse := dao.DeleteChapters(email, storyTitle, chapters)
	RespondWithJson(w, http.StatusOK, awsResponse)
}
