package auth

import (
	"RichDocter/api"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"os"

	"RichDocter/sessions"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

type GoogleClaims struct {
	ID            string  `json:"id,omitempty"`
	Email         string  `json:"email"`
	EmailVerified bool    `json:"email_verified"`
	Iss           string  `json:"iss"`
	Iat           float64 `json:"iat"`
	Exp           int     `json:"exp"`
}

const (
	GOOGLE_OAUTH_PUBKEY_URL = "https://www.googleapis.com/oauth2/v1/certs"
	claimsAudience          = "878388830212-0kjicm0hvvpc322q07ni82ijdqck1bhs.apps.googleusercontent.com"
	oauthGoogleUrlAPI       = "https://www.googleapis.com/oauth2/v2/userinfo?access_token="
)

var conf = &oauth2.Config{
	ClientID:     os.Getenv("GOOGLE_OAUTH_CLIENT_ID"),
	ClientSecret: os.Getenv("GOOGLE_OAUTH_CLIENT_SECRET"),
	Endpoint:     google.Endpoint,
	Scopes:       []string{"https://www.googleapis.com/auth/userinfo.email"},
	RedirectURL:  os.Getenv("GOOGLE_OAUTH_REDIRECT_URL"),
}

func RequestGoogleToken(w http.ResponseWriter, r *http.Request) {
	var (
		oauthState string
		err        error
	)
	if oauthState, err = generateStateOauthSession(w, r); err != nil {
		api.RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	u := conf.AuthCodeURL(oauthState)
	http.Redirect(w, r, u, http.StatusTemporaryRedirect)
}

func ValidateGoogleToken(w http.ResponseWriter, r *http.Request) error {
	session, err := sessions.Get(r, "token")
	if err != nil {
		return err
	}
	var token oauth2.Token
	pc := PseudoCookie{}
	if err = json.Unmarshal(session.Values["token_data"].([]byte), &pc); err != nil {
		return err
	}
	token.AccessToken = pc.AccessToken
	token.Expiry = pc.Expiry
	tokenSource := conf.TokenSource(context.TODO(), &token)
	newToken, err := tokenSource.Token()
	if err != nil {
		return err
	}

	if newToken.AccessToken != token.AccessToken {
		if newToken.Extra("id_token") == nil {
			return fmt.Errorf("missing id token in renewal: %s", err.Error())
		}
		pc := PseudoCookie{
			AccessToken: newToken.AccessToken,
			IdToken:     newToken.Extra("id_token").(string),
			Expiry:      newToken.Expiry,
			Type:        TokenTypeGoogle,
		}
		tojson, err := json.Marshal(pc)
		if err != nil {
			return fmt.Errorf("error marshalling token data: %s", err.Error())
		}
		session.Values["token_data"] = tojson
	}
	if err = session.Save(r, w); err != nil {
		return err
	}
	return nil
}

func ReceiveGoogleToken(w http.ResponseWriter, r *http.Request) {
	var err error
	if err = r.ParseForm(); err != nil {
		api.RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}

	session, err := sessions.Get(r, "oauthstate")
	if err != nil {
		api.RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if r.FormValue("state") != session.Values["state"] {
		api.RespondWithError(w, http.StatusBadRequest, "mismatched oauth google state")
		return
	}
	if err = storeGoogleToken(w, r); err != nil {
		api.RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	http.Redirect(w, r, os.Getenv("ROOT_URL"), http.StatusPermanentRedirect)
}

func storeGoogleToken(w http.ResponseWriter, r *http.Request) error {
	// skipping error check here b/c a "new" token will produce one
	session, _ := sessions.Get(r, "token")
	var (
		token *oauth2.Token
		err   error
	)
	if token, err = conf.Exchange(context.Background(), r.FormValue("code")); err != nil {
		return fmt.Errorf("bad code exchange: %s", err.Error())
	}
	pc := PseudoCookie{
		AccessToken: token.AccessToken,
		IdToken:     token.Extra("id_token").(string),
		Expiry:      token.Expiry,
		Type:        TokenTypeGoogle,
	}
	toJSON, err := json.Marshal(pc)
	if err != nil {
		return err
	}
	session.Values["token_data"] = toJSON
	if err = session.Save(r, w); err != nil {
		return err
	}
	return nil
}

func generateStateOauthSession(w http.ResponseWriter, r *http.Request) (string, error) {
	b := make([]byte, 16)
	rand.Read(b)
	state := base64.URLEncoding.EncodeToString(b)
	session, err := sessions.Get(r, "oauthstate")
	if err != nil {
		return "", err
	}
	session.Values["state"] = state
	if err = session.Save(r, w); err != nil {
		return "", err
	}
	return state, nil
}
