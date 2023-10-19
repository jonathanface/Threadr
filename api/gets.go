package api

import (
	"RichDocter/daos"
	"RichDocter/models"
	"RichDocter/sessions"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"

	"github.com/aws/smithy-go"
	"github.com/gorilla/mux"
)

func StoryBlocksEndPoint(w http.ResponseWriter, r *http.Request) {
	startKey := r.URL.Query().Get("key")
	chapter := r.URL.Query().Get("chapter")
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
		RespondWithError(w, http.StatusBadRequest, "Missing story name")
		return
	}
	if chapter == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing chapter number")
		return
	}
	if dao, ok = r.Context().Value("dao").(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}
	if ok, err = dao.WasStoryDeleted(email, storyTitle); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if ok {
		RespondWithError(w, http.StatusNotFound, "story not found")
		return
	}
	blocks, err := dao.GetStoryParagraphs(email, storyTitle, chapter, startKey)
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

	RespondWithJson(w, http.StatusOK, blocks)
}

func FullStoryEndPoint(w http.ResponseWriter, r *http.Request) {
	fmt.Println("full")
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
		RespondWithError(w, http.StatusBadRequest, "Missing story name")
		return
	}
	if dao, ok = r.Context().Value("dao").(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}
	if ok, err = dao.WasStoryDeleted(email, storyTitle); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if ok {
		RespondWithError(w, http.StatusNotFound, "story not found")
		return
	}

	story, err := dao.GetStoryByName(email, storyTitle)
	if err != nil {
		if err == sql.ErrNoRows {
			RespondWithError(w, http.StatusNotFound, "story not found")
			return
		}
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	fullStory := models.FullStoryContent{}
	fullStory.StoryTitle = storyTitle

	//var blocksList models.BlocksData
	//blocksList.Items = []map[string]types.AttributeValue{}
	var key string
	for _, chap := range story.Chapters {
		chapWithContents := models.ChapterWithContents{}
		chapWithContents.Chapter = chap
		chapterNumber := strconv.Itoa(chap.ChapterNum)
		chapWithContents.Blocks, err = staggeredStoryBlockRetrieval(dao, email, storyTitle, chapterNumber, key)
		if err != nil {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
		//blocksList.Items = append(blocksList.Items, blocks.Items...)
		fullStory.ChaptersWithContents = append(fullStory.ChaptersWithContents, chapWithContents)
	}
	RespondWithJson(w, http.StatusOK, fullStory)
}

func StoryEndPoint(w http.ResponseWriter, r *http.Request) {
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
		RespondWithError(w, http.StatusBadRequest, "Missing story name")
		return
	}

	if dao, ok = r.Context().Value("dao").(daos.DaoInterface); !ok {
		fmt.Println("wtf", dao)
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}
	if ok, err = dao.WasStoryDeleted(email, storyTitle); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if ok {
		RespondWithError(w, http.StatusNotFound, "story not found")
		return
	}
	story, err := dao.GetStoryByName(email, storyTitle)
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
		if err == sql.ErrNoRows {
			RespondWithError(w, http.StatusNotFound, "story not found")
			return
		}
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	RespondWithJson(w, http.StatusOK, story)
}

func AllStandaloneStoriesEndPoint(w http.ResponseWriter, r *http.Request) {
	var (
		email string
		err   error
		dao   daos.DaoInterface
		ok    bool
	)
	if email, err = getUserEmail(r); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if dao, ok = r.Context().Value("dao").(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}
	stories, err := dao.GetAllStandalone(email)
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
	RespondWithJson(w, http.StatusOK, stories)
}

func AllAssociationsByStoryEndPoint(w http.ResponseWriter, r *http.Request) {
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
		RespondWithError(w, http.StatusBadRequest, "Missing story name")
		return
	}
	if dao, ok = r.Context().Value("dao").(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}
	associations, err := dao.GetStoryOrSeriesAssociations(email, storyTitle)
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
	RespondWithJson(w, http.StatusOK, associations)
}

func AllSeriesEndPoint(w http.ResponseWriter, r *http.Request) {
	var (
		email string
		err   error
		dao   daos.DaoInterface
		ok    bool
	)
	if email, err = getUserEmail(r); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if dao, ok = r.Context().Value("dao").(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}
	series, err := dao.GetAllSeriesWithStories(email)
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
	for _, srs := range series {
		srs.Stories, err = dao.GetSeriesVolumes(email, srs.SeriesTitle)
		if err != nil {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	RespondWithJson(w, http.StatusOK, series)
}

func AllSeriesVolumesEndPoint(w http.ResponseWriter, r *http.Request) {
	var (
		email       string
		seriesTitle string
		err         error
		dao         daos.DaoInterface
		ok          bool
	)
	if email, err = getUserEmail(r); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if seriesTitle, err = url.PathUnescape(mux.Vars(r)["series"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing series name")
		return
	}
	if seriesTitle == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing series name")
		return
	}
	if dao, ok = r.Context().Value("dao").(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}
	volumes, err := dao.GetSeriesVolumes(email, seriesTitle)
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
	RespondWithJson(w, http.StatusOK, volumes)
}

func GetUserData(w http.ResponseWriter, r *http.Request) {
	session, err := sessions.Get(r, "token")
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	var user models.UserInfo
	if err = json.Unmarshal(session.Values["token_data"].([]byte), &user); err != nil {
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	RespondWithJson(w, http.StatusOK, user)
}
