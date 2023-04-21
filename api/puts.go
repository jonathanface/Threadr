package api

import (
	"RichDocter/daos"
	"RichDocter/models"
	"encoding/json"
	"net/http"
	"net/url"

	"github.com/gorilla/mux"
)

func RewriteBlockOrderEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		email string
		err   error
		story string
		dao   daos.DaoInterface
		ok    bool
	)
	if email, err = getUserEmail(r); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if story, err = url.PathUnescape(mux.Vars(r)["story"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing story name")
		return
	}
	if story == "" {
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

	response := dao.ResetBlockOrder(email, story, &storyBlocks)
	if !response.Success {
		RespondWithError(w, response.Code, response.Message)
		return
	}
	RespondWithJson(w, response.Code, models.Answer{Success: true})
}

func WriteBlocksToStoryEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		email string
		err   error
		story string
		dao   daos.DaoInterface
		ok    bool
	)
	if email, err = getUserEmail(r); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if story, err = url.PathUnescape(mux.Vars(r)["story"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing story name")
		return
	}
	if story == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing story ID")
		return
	}
	decoder := json.NewDecoder(r.Body)
	storyBlocks := models.StoryBlocks{}
	if err = decoder.Decode(&storyBlocks); err != nil {
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	if dao, ok = r.Context().Value("dao").(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	response := dao.WriteBlocks(email, story, &storyBlocks)
	if !response.Success {
		RespondWithError(w, response.Code, response.Message)
		return
	}
	RespondWithJson(w, response.Code, models.Answer{Success: true, NumberWrote: len(storyBlocks.Blocks)})
}

func WriteAssocationsEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		email string
		err   error
		story string
		dao   daos.DaoInterface
		ok    bool
	)
	if email, err = getUserEmail(r); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if story, err = url.PathUnescape(mux.Vars(r)["story"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing story name")
		return
	}
	if story == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing story ID")
		return
	}
	decoder := json.NewDecoder(r.Body)
	associations := []*models.Association{}
	if err = decoder.Decode(&associations); err != nil {
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	if dao, ok = r.Context().Value("dao").(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	response := dao.WriteAssociations(email, story, associations)
	if !response.Success {
		RespondWithError(w, response.Code, response.Message)
		return
	}
	RespondWithJson(w, http.StatusOK, associations)
}

func UploadPortraitEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		email           string
		err             error
		story           string
		associationName string
		associationType string
		dao             daos.DaoInterface
		ok              bool
		portraitURL     string
	)
	const maxFileSize = 1024 * 1024 // 1 MB
	if email, err = getUserEmail(r); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if story, err = url.PathUnescape(mux.Vars(r)["story"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing story name")
		return
	}
	if story == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing story ID")
		return
	}
	if associationName, err = url.PathUnescape(mux.Vars(r)["association"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing association name")
		return
	}
	if associationName == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing association name")
		return
	}
	associationType = r.URL.Query().Get("type")
	if associationType == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing association type")
		return
	}

	err = r.ParseMultipartForm(10 << 20)
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, "Unable to parse file")
		return
	}

	file, handler, err := r.FormFile("file")
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	defer file.Close()

	if handler.Size > maxFileSize {
		RespondWithError(w, http.StatusBadRequest, "Filesize must be < 1MB")
		return
	}
	allowedTypes := []string{"image/jpeg", "image/png"}
	fileBytes := make([]byte, handler.Size)
	if _, err := file.Read(fileBytes); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	fileType := http.DetectContentType(fileBytes)
	allowed := false
	for _, t := range allowedTypes {
		if fileType == t {
			allowed = true
			break
		}
	}
	if !allowed {
		RespondWithError(w, http.StatusBadRequest, "Invalid file type")
		return
	}

	if dao, ok = r.Context().Value("dao").(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}
	if portraitURL, err = dao.UploadPortrait(email, story, associationName, associationType, fileType, handler, fileBytes); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	RespondWithJson(w, http.StatusOK, models.Answer{Success: true, URL: portraitURL})
}
