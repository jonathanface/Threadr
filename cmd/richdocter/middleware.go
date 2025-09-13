package main

import (
	"RichDocter/api"
	ctxkey "RichDocter/ctxkeys"
	"RichDocter/daos"
	"RichDocter/models"
	"RichDocter/sessions"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"
)

func looseMiddleware(d daos.DaoInterface) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}
			ctx, cancel := context.WithTimeout(r.Context(), time.Duration(time.Second*5))
			defer cancel()
			ctx = context.WithValue(ctx, ctxkey.DAO, d)
			r = r.WithContext(ctx)
			next.ServeHTTP(w, r)
		})
	}
}

func billingMiddleware(d daos.DaoInterface) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}
			token, err := sessions.Get(r, "token")
			if err != nil || token.IsNew {
				api.RespondWithError(w, http.StatusUnauthorized, "cannot find token")
				return
			}
			var user models.UserInfo
			if err = json.Unmarshal(token.Values["token_data"].([]byte), &user); err != nil {
				api.RespondWithError(w, http.StatusBadRequest, err.Error())
				return
			}
			ctx, cancel := context.WithTimeout(r.Context(), time.Duration(time.Second*5))
			defer cancel()
			ctx = context.WithValue(ctx, ctxkey.DAO, d)
			r = r.WithContext(ctx)
			next.ServeHTTP(w, r)
		})
	}
}
func strictMiddleware(d daos.DaoInterface) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}

			token, err := sessions.Get(r, "token")
			if err != nil || token.IsNew {
				api.RespondWithError(w, http.StatusUnauthorized, "cannot find token")
				return
			}

			var user models.UserInfo
			if err = json.Unmarshal(token.Values["token_data"].([]byte), &user); err != nil {
				api.RespondWithError(w, http.StatusBadRequest, err.Error())
				return
			}

			// Timeout comment said 15s, code used 5s. Pick one; here we use 5s.
			ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
			defer cancel()

			userDetails, err := d.UpsertUser(user.Email)
			if err != nil {
				api.RespondWithError(w, http.StatusInternalServerError, fmt.Sprintf("unable to update user %s", user.Email))
				return
			}
			ctx = context.WithValue(ctx, ctxkey.Subscriber, userDetails.Subscriber)
			ctx = context.WithValue(ctx, ctxkey.DAO, d)

			needsSub := (r.Method == "POST" && strings.HasSuffix(r.URL.Path, "/stories")) ||
				(r.Method == "PUT" && strings.HasSuffix(r.URL.Path, "/export"))
			log.Println("subbed", needsSub, userDetails.Subscriber)
			if needsSub && !userDetails.Subscriber {
				api.RespondWithError(w, http.StatusPaymentRequired, "insufficient subscription")
				return
			}

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
