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

// corsMiddleware adds CORS headers to all responses
func corsMiddleware(allowedOrigin string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")

			// Allow requests from the configured frontend origin
			if origin == allowedOrigin {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Credentials", "true")
			}

			// Handle preflight requests
			if r.Method == "OPTIONS" {
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, Origin")
				w.Header().Set("Access-Control-Max-Age", "86400") // 24 hours
				w.WriteHeader(http.StatusNoContent)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

func looseMiddleware(d daos.DaoInterface) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
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
			ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
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

			ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
			defer cancel()

			userDetails, err := d.UpsertUser(ctx, user.Email)
			if err != nil {
				api.RespondWithError(w, http.StatusInternalServerError, fmt.Sprintf("unable to update user %s", user.Email))
				return
			}
			ctx = context.WithValue(ctx, ctxkey.Subscriber, userDetails.Subscriber)
			ctx = context.WithValue(ctx, ctxkey.DAO, d)

			// Only block exports for non-subscribers, not story creation
			needsSub := (r.Method == "PUT" && strings.HasSuffix(r.URL.Path, "/export"))
			log.Println("subbed", needsSub, userDetails.Subscriber)
			if needsSub && !userDetails.Subscriber {
				api.RespondWithError(w, http.StatusPaymentRequired, "insufficient subscription")
				return
			}

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
