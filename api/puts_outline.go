package api

import (
	ctxkey "RichDocter/ctxkeys"
	"RichDocter/daos"
	"RichDocter/models"
	"encoding/json"
	"net/http"
)

func UpdateOutlineEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		err error
		dao daos.DaoInterface
		ok  bool
	)
	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}
	decoder := json.NewDecoder(r.Body)
	updatedOutline := models.OutlineRequest{}
	if err := decoder.Decode(&updatedOutline); err != nil {
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}

	newOutline, err := dao.UpdateOutline(updatedOutline)
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	RespondWithJson(w, http.StatusOK, newOutline)
}
