package api

import (
	"encoding/json"
	"net/http"

	ctxkey "Threadr/ctxkeys"
	"Threadr/daos"
	"Threadr/logger"
	"Threadr/models"
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
		logger.Error("Bad request", "error", err)
		RespondWithError(w, http.StatusBadRequest, "Invalid request")
		return
	}

	newOutline, err := dao.UpdateOutline(r.Context(), updatedOutline)
	if err != nil {
		logger.Error("Bad request", "error", err)
		RespondWithError(w, http.StatusBadRequest, "Invalid request")
		return
	}
	RespondWithJSON(w, http.StatusOK, newOutline)
}
