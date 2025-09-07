package main

import (
	"RichDocter/api"
	ctxkey "RichDocter/ctxkeys"
	"RichDocter/daos"
	"RichDocter/models"
	"RichDocter/sessions"
	"context"
	"encoding/json"
	"net/http"
	"strconv"
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
			userDetails, err := d.GetUserDetails(user.Email)
			if err != nil {
				api.RespondWithError(w, http.StatusBadRequest, err.Error())
				return
			}

			// see if the user's a subscriber, and the subscription has expired
			if len(userDetails.SubscriptionID) > 0 && !userDetails.Renewing {
				i, err := strconv.ParseInt(userDetails.ExpiresAt, 10, 64)
				if err != nil {
					api.RespondWithError(w, http.StatusInternalServerError, err.Error())
					return
				}
				t := time.Unix(i, 0)
				if t.Before(time.Now()) {
					userDetails.Expired = true
					userDetails.SubscriptionID = ""
					err = d.UpdateUser(*userDetails)
					if err != nil {
						api.RespondWithError(w, http.StatusInternalServerError, err.Error())
						return
					}
				}
			}

			if userDetails.SubscriptionID == "" || userDetails.Expired {
				if r.Method == "POST" && (strings.HasSuffix(r.URL.Path, "/analyze") || strings.HasSuffix(r.URL.Path, "/propose")) ||
					r.Method == "PUT" && (strings.HasSuffix(r.URL.Path, "/export")) {
					api.RespondWithError(w, http.StatusUnauthorized, "insufficient subscription")
					return
				}
			}
			if err = d.UpsertUser(user.Email); err != nil {
				api.RespondWithError(w, http.StatusInternalServerError, err.Error())
				return
			}
			isSubscriber := false
			if userDetails.SubscriptionID != "" && !userDetails.Expired {
				isSubscriber = true
			}

			// 15 sec timeout
			ctx, cancel := context.WithTimeout(r.Context(), time.Duration(time.Second*5))
			defer cancel()
			ctx = context.WithValue(ctx, ctxkey.DAO, d)
			ctx = context.WithValue(ctx, ctxkey.Subscriber, isSubscriber)
			r = r.WithContext(ctx)
			next.ServeHTTP(w, r)
		})
	}
}
