package main

import (
	"Threadr/api"
	ctxkey "Threadr/ctxkeys"
	"Threadr/daos"
	"context"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/mux"
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

			// Handle preflight requests — only respond if origin is allowed
			if r.Method == "OPTIONS" {
				if origin == allowedOrigin {
					w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
					w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, Origin")
					w.Header().Set("Access-Control-Max-Age", "86400") // 24 hours
				}
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

			// Use the common auth helper
			userPtr, err := api.GetAuthenticatedUser(r)
			if err != nil {
				log.Printf("[billingMiddleware] Authentication failed: %v", err)
				api.RespondWithError(w, http.StatusUnauthorized, "Authentication failed")
				return
			}
			user := *userPtr
			log.Printf("[billingMiddleware] Auth successful for user: %s", user.Email)

			ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
			defer cancel()
			ctx = context.WithValue(ctx, ctxkey.DAO, d)
			r = r.WithContext(ctx)
			next.ServeHTTP(w, r)
		})
	}
}
func sharedMiddleware(d daos.DaoInterface) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			log.Printf("[sharedMiddleware] %s %s", r.Method, r.URL.Path)

			rawToken := mux.Vars(r)["token"]
			if rawToken == "" {
				api.RespondWithError(w, http.StatusBadRequest, "Missing share token")
				return
			}
			tokenHash := api.HashShareToken(rawToken)

			ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
			defer cancel()
			ctx = context.WithValue(ctx, ctxkey.DAO, d)

			link, err := d.GetShareLink(ctx, tokenHash)
			if err != nil {
				log.Printf("[sharedMiddleware] Share link not found: %v", err)
				api.RespondWithError(w, http.StatusNotFound, "Share link not found")
				return
			}
			if link.Revoked {
				api.RespondWithError(w, http.StatusGone, "This share link has been revoked")
				return
			}
			if link.ExpiresAt > 0 && time.Now().Unix() > link.ExpiresAt {
				api.RespondWithError(w, http.StatusGone, "This share link has expired")
				return
			}

			ctx = context.WithValue(ctx, ctxkey.ShareLink, link)
			log.Printf("[sharedMiddleware] Share link validated for reader: %s", link.ReaderEmail)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func strictMiddleware(d daos.DaoInterface) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			log.Printf("[strictMiddleware] %s %s", r.Method, r.URL.Path)

			// Use the common auth helper
			userPtr, err := api.GetAuthenticatedUser(r)
			if err != nil {
				log.Printf("[strictMiddleware] Authentication failed: %v", err)
				api.RespondWithError(w, http.StatusUnauthorized, "Authentication failed")
				return
			}
			user := *userPtr
			log.Printf("[strictMiddleware] Auth successful for user: %s", user.Email)

			ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
			defer cancel()

			userDetails, err := d.UpsertUser(ctx, user.Email)
			if err != nil {
				log.Printf("[strictMiddleware] Failed to upsert user: %v", err)
				api.RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
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
