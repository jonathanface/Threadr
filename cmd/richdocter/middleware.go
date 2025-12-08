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
			log.Printf("[billingMiddleware] %s %s", r.Method, r.URL.Path)
			var user models.UserInfo

			// Try mobile token-based auth first
			authHeader := r.Header.Get("Authorization")
			if strings.HasPrefix(authHeader, "Bearer ") {
				log.Printf("[billingMiddleware] Using mobile token-based auth")
				sessionToken := strings.TrimPrefix(authHeader, "Bearer ")
				tokenPreview := sessionToken
				if len(tokenPreview) > 12 {
					tokenPreview = tokenPreview[:12] + "..."
				}
				log.Printf("[billingMiddleware] Token: %s", tokenPreview)

				// Get user data from token map
				userVal, ok := sessions.GetUserByToken(sessionToken)
				if !ok {
					log.Printf("[billingMiddleware] Token not found in map")
					api.RespondWithError(w, http.StatusUnauthorized, "invalid session token")
					return
				}

				user, ok = userVal.(models.UserInfo)
				if !ok {
					log.Printf("[billingMiddleware] Invalid user data format in token map")
					api.RespondWithError(w, http.StatusInternalServerError, "invalid user data format")
					return
				}
				log.Printf("[billingMiddleware] Mobile auth successful for user: %s", user.Email)
			} else {
				log.Printf("[billingMiddleware] Using cookie-based auth for web")
				// Fall back to cookie-based auth for web
				token, err := sessions.Get(r, "token")
				if err != nil || token.IsNew {
					log.Printf("[billingMiddleware] Cookie not found or invalid, err=%v, isNew=%v", err, token.IsNew)
					api.RespondWithError(w, http.StatusUnauthorized, "cannot find token")
					return
				}
				if err = json.Unmarshal(token.Values["token_data"].([]byte), &user); err != nil {
					log.Printf("[billingMiddleware] Failed to unmarshal cookie data: %v", err)
					api.RespondWithError(w, http.StatusBadRequest, err.Error())
					return
				}
				log.Printf("[billingMiddleware] Cookie auth successful for user: %s", user.Email)
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
			log.Printf("[strictMiddleware] %s %s", r.Method, r.URL.Path)
			var user models.UserInfo

			// Try mobile token-based auth first
			authHeader := r.Header.Get("Authorization")
			if strings.HasPrefix(authHeader, "Bearer ") {
				log.Printf("[strictMiddleware] Using mobile token-based auth")
				sessionToken := strings.TrimPrefix(authHeader, "Bearer ")
				tokenPreview := sessionToken
				if len(tokenPreview) > 12 {
					tokenPreview = tokenPreview[:12] + "..."
				}
				log.Printf("[strictMiddleware] Token: %s", tokenPreview)

				// Get user data from token map
				userVal, ok := sessions.GetUserByToken(sessionToken)
				if !ok {
					log.Printf("[strictMiddleware] Token not found in map")
					api.RespondWithError(w, http.StatusUnauthorized, "invalid session token")
					return
				}

				user, ok = userVal.(models.UserInfo)
				if !ok {
					log.Printf("[strictMiddleware] Invalid user data format in token map")
					api.RespondWithError(w, http.StatusInternalServerError, "invalid user data format")
					return
				}
				log.Printf("[strictMiddleware] Mobile auth successful for user: %s", user.Email)
			} else {
				log.Printf("[strictMiddleware] Using cookie-based auth for web")
				// Fall back to cookie-based auth for web
				token, err := sessions.Get(r, "token")
				if err != nil || token.IsNew {
					log.Printf("[strictMiddleware] Cookie not found or invalid, err=%v, isNew=%v", err, token.IsNew)
					api.RespondWithError(w, http.StatusUnauthorized, "cannot find token")
					return
				}

				if err = json.Unmarshal(token.Values["token_data"].([]byte), &user); err != nil {
					log.Printf("[strictMiddleware] Failed to unmarshal cookie data: %v", err)
					api.RespondWithError(w, http.StatusBadRequest, err.Error())
					return
				}
				log.Printf("[strictMiddleware] Cookie auth successful for user: %s", user.Email)
			}

			ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
			defer cancel()

			userDetails, err := d.UpsertUser(ctx, user.Email)
			if err != nil {
				log.Printf("[strictMiddleware] Failed to upsert user %s: %v", user.Email, err)
				api.RespondWithError(w, http.StatusInternalServerError, fmt.Sprintf("unable to update user %s", user.Email))
				return
			}
			log.Printf("[strictMiddleware] User %s upserted, subscriber=%v", user.Email, userDetails.Subscriber)
			ctx = context.WithValue(ctx, ctxkey.Subscriber, userDetails.Subscriber)
			ctx = context.WithValue(ctx, ctxkey.DAO, d)

			// Only block exports for non-subscribers, not story creation
			needsSub := (r.Method == "PUT" && strings.HasSuffix(r.URL.Path, "/export"))
			if needsSub && !userDetails.Subscriber {
				log.Printf("[strictMiddleware] Blocking export for non-subscriber: %s", user.Email)
				api.RespondWithError(w, http.StatusPaymentRequired, "insufficient subscription")
				return
			}

			log.Printf("[strictMiddleware] Auth complete, proceeding to handler")
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
