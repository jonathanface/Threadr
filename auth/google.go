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
	"time"

	"RichDocter/sessions"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	"google.golang.org/api/idtoken"
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
	if session.IsNew {
		api.RespondWithError(w, http.StatusNotFound, "oauth state not found")
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
	http.Redirect(w, r, os.Getenv("ROOT_URL"), http.StatusTemporaryRedirect)
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
	fmt.Println("token expiry", token.Expiry)
	payload, err := idtoken.Validate(context.Background(), token.Extra("id_token").(string), claimsAudience)
	if err != nil {
		return err
	}
	var jsonString []byte
	if jsonString, err = json.Marshal(payload.Claims); err != nil {
		return err
	}
	gc := GoogleClaims{}
	if err = json.Unmarshal(jsonString, &gc); err != nil {
		return err
	}
	//24 hour expiry
	pc := PseudoCookie{
		AccessToken: token.AccessToken,
		IdToken:     token.Extra("id_token").(string),
		Expiry:      time.Now().Local().Add(time.Hour * time.Duration(24)),
		Type:        TokenTypeGoogle,
		Email:       gc.Email,
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

func ValidateGoogleToken(w http.ResponseWriter, r *http.Request) error {
	session, err := sessions.Get(r, "token")
	if err != nil {
		return err
	}
	//var token oauth2.Token
	pc := PseudoCookie{}
	if err = json.Unmarshal(session.Values["token_data"].([]byte), &pc); err != nil {
		return err
	}
	token := new(oauth2.Token)
	token.AccessToken = pc.AccessToken
	token.RefreshToken = pc.RefreshToken
	token.Expiry = pc.Expiry
	token.TokenType = pc.TokenType
	conf.Client(context.TODO(), token)

	tokenSource := conf.TokenSource(context.TODO(), token)
	newToken, err := tokenSource.Token()
	if err != nil {
		return err
	}
	if newToken.AccessToken != token.AccessToken {
		if newToken.Extra("id_token") == nil {
			return fmt.Errorf("missing id token in renewal: %s", err.Error())
		}
		token = newToken
		payload, err := idtoken.Validate(context.Background(), newToken.Extra("id_token").(string), claimsAudience)
		if err != nil {
			return err
		}
		var jsonString []byte
		if jsonString, err = json.Marshal(payload.Claims); err != nil {
			return err
		}
		gc := GoogleClaims{}
		if err = json.Unmarshal(jsonString, &gc); err != nil {
			return err
		}
		pc := PseudoCookie{
			AccessToken: newToken.AccessToken,
			IdToken:     newToken.Extra("id_token").(string),
			Expiry:      newToken.Expiry,
			Type:        TokenTypeGoogle,
			Email:       gc.Email,
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

func generateStateOauthSession(w http.ResponseWriter, r *http.Request) (string, error) {
	b := make([]byte, 16)
	rand.Read(b)
	state := base64.URLEncoding.EncodeToString(b)
	session, err := sessions.Get(r, "oauthstate")
	if err != nil {
		return "", err
	}
	session.Options.Path = "/auth"
	session.Options.MaxAge = int(5 * time.Minute)
	session.Values["state"] = state
	session.Values["referrer"] = r.URL.Path

	if err = session.Save(r, w); err != nil {
		return "", err
	}
	return state, nil
}
