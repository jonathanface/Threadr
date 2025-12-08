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

// maintenanceModeMiddleware returns a maintenance page when enabled
// Set MAINTENANCE_MODE=true environment variable to enable
func maintenanceModeMiddleware(enabled bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Skip maintenance mode for health check endpoint
			if r.URL.Path == "/health" {
				next.ServeHTTP(w, r)
				return
			}

			if enabled {
				w.Header().Set("Content-Type", "text/html; charset=utf-8")
				w.Header().Set("Retry-After", "3600") // Suggest retry in 1 hour
				w.WriteHeader(http.StatusServiceUnavailable)

				html := `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Maintenance Mode</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 10px;
            padding: 40px;
            max-width: 500px;
            text-align: center;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        }
        h1 {
            color: #333;
            margin-bottom: 10px;
        }
        .emoji {
            font-size: 64px;
            margin-bottom: 20px;
        }
        p {
            color: #666;
            line-height: 1.6;
            margin: 15px 0;
        }
        .status {
            background: #f0f0f0;
            padding: 15px;
            border-radius: 5px;
            margin-top: 20px;
            font-size: 14px;
            color: #555;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="emoji">🔧</div>
        <h1>Under Maintenance</h1>
        <p>We're currently performing scheduled maintenance to improve your experience.</p>
        <p>We'll be back shortly. Thank you for your patience!</p>
        <div class="status">
            Status: Maintenance in progress
        </div>
    </div>
</body>
</html>`
				w.Write([]byte(html))
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
			var user models.UserInfo

			// Try mobile token-based auth first
			authHeader := r.Header.Get("Authorization")
			if strings.HasPrefix(authHeader, "Bearer ") {
				sessionToken := strings.TrimPrefix(authHeader, "Bearer ")
				sessionID, ok := sessions.GetSessionIDByToken(sessionToken)
				if !ok {
					api.RespondWithError(w, http.StatusUnauthorized, "invalid session token")
					return
				}

				// Load session by ID
				userSession, err := sessions.Get(r, "user_data")
				if err != nil || userSession.ID != sessionID {
					api.RespondWithError(w, http.StatusUnauthorized, "session not found")
					return
				}

				userVal, ok := userSession.Values["user"]
				if !ok {
					api.RespondWithError(w, http.StatusUnauthorized, "user data not found in session")
					return
				}

				user, ok = userVal.(models.UserInfo)
				if !ok {
					api.RespondWithError(w, http.StatusInternalServerError, "invalid user data format")
					return
				}
			} else {
				// Fall back to cookie-based auth for web
				token, err := sessions.Get(r, "token")
				if err != nil || token.IsNew {
					api.RespondWithError(w, http.StatusUnauthorized, "cannot find token")
					return
				}
				if err = json.Unmarshal(token.Values["token_data"].([]byte), &user); err != nil {
					api.RespondWithError(w, http.StatusBadRequest, err.Error())
					return
				}
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
			var user models.UserInfo

			// Try mobile token-based auth first
			authHeader := r.Header.Get("Authorization")
			if strings.HasPrefix(authHeader, "Bearer ") {
				sessionToken := strings.TrimPrefix(authHeader, "Bearer ")
				sessionID, ok := sessions.GetSessionIDByToken(sessionToken)
				if !ok {
					api.RespondWithError(w, http.StatusUnauthorized, "invalid session token")
					return
				}

				// Load session by ID
				userSession, err := sessions.Get(r, "user_data")
				if err != nil || userSession.ID != sessionID {
					api.RespondWithError(w, http.StatusUnauthorized, "session not found")
					return
				}

				userVal, ok := userSession.Values["user"]
				if !ok {
					api.RespondWithError(w, http.StatusUnauthorized, "user data not found in session")
					return
				}

				user, ok = userVal.(models.UserInfo)
				if !ok {
					api.RespondWithError(w, http.StatusInternalServerError, "invalid user data format")
					return
				}
			} else {
				// Fall back to cookie-based auth for web
				token, err := sessions.Get(r, "token")
				if err != nil || token.IsNew {
					api.RespondWithError(w, http.StatusUnauthorized, "cannot find token")
					return
				}

				if err = json.Unmarshal(token.Values["token_data"].([]byte), &user); err != nil {
					api.RespondWithError(w, http.StatusBadRequest, err.Error())
					return
				}
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
