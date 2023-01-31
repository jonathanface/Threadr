package auth

import (
	"RichDocter/api"
	"RichDocter/sessions"
	"context"
	"encoding/json"
	"net/http"
	"time"

	"google.golang.org/api/idtoken"
)

const TokenTypeGoogle = "google"

type PseudoCookie struct {
	AccessToken string
	IdToken     string
	Expiry      time.Time
	Type        string
}

func DeleteToken(w http.ResponseWriter, r *http.Request) {
	session, err := sessions.Get(r, "token")
	if err != nil {
		api.RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	session.Options.MaxAge = -1
	if err = session.Save(r, w); err != nil {
		api.RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	session, _ = sessions.Get(r, "oauthstate")
	session.Options.MaxAge = -1
	if err = session.Save(r, w); err != nil {
		api.RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	api.RespondWithJson(w, http.StatusOK, nil)
}

func GetUserData(w http.ResponseWriter, r *http.Request) {
	token, err := sessions.Get(r, "token")
	if err != nil {
		api.RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}

	pc := PseudoCookie{}
	if err = json.Unmarshal(token.Values["token_data"].([]byte), &pc); err != nil {
		api.RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	payload, err := idtoken.Validate(context.Background(), pc.IdToken, claimsAudience)
	if err != nil {
		api.RespondWithError(w, http.StatusUnauthorized, err.Error())
		return
	}
	var jsonString []byte
	if jsonString, err = json.Marshal(payload.Claims); err != nil {
		api.RespondWithError(w, http.StatusUnauthorized, err.Error())
		return
	}

	gc := GoogleClaims{}
	if err = json.Unmarshal(jsonString, &gc); err != nil {
		api.RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	api.RespondWithJson(w, http.StatusOK, gc)
}
