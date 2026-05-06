package auth

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"html"
	"net/http"
	"strconv"
	"strings"
	"time"

	"Threadr/api"
	"Threadr/daos"
	"Threadr/logger"
	"Threadr/models"
)

// resolveCallbackUser fetches an existing user record by email, or creates
// a fresh one if no user exists. Returns the user details plus newUser /
// returningUser flags (the latter true when re-registering a previously
// soft-deleted account). On any DB error other than not-found, writes the
// HTTP error and returns ok=false.
func resolveCallbackUser(
	ctx context.Context,
	w http.ResponseWriter,
	dao daos.DaoInterface,
	email, remoteAddr, provider string,
) (userDetails *models.UserInfo, newUser, returningUser, ok bool) {
	userDetails, err := dao.GetUserDetails(ctx, email)
	if err == nil {
		return userDetails, false, false, true
	}
	if !errors.Is(err, sql.ErrNoRows) {
		logger.Error("Failed to retrieve user details",
			"error", err, "email", email, "remoteAddr", remoteAddr)
		api.RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return nil, false, false, false
	}

	logger.Info("New user detected, creating account",
		"email", email, "provider", provider, "remoteAddr", remoteAddr)
	userDetails, err = dao.CreateUser(ctx, email)
	if err != nil {
		logger.Error("Failed to create new user", "error", err, "email", email, "remoteAddr", remoteAddr)
		api.RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return nil, false, false, false
	}
	logger.Info("User created successfully",
		"email", email, "newUser", userDetails.NewUser,
		"returningUser", userDetails.ReturningUser, "remoteAddr", remoteAddr)
	return userDetails, userDetails.NewUser, userDetails.ReturningUser, true
}

// applyOAuthSubscriptionUpdate runs the post-auth subscription refresh: asks
// the DAO whether the user is still subscribed (which may also re-verify
// with Stripe), persists any change, and fires expiry/restore alerts. Any
// internal error during persistence aborts with a 500 (returns false).
// Stripe lookup failures are logged but tolerated.
func applyOAuthSubscriptionUpdate(
	ctx context.Context,
	w http.ResponseWriter,
	dao daos.DaoInterface,
	userDetails *models.UserInfo,
	remoteAddr string,
) bool {
	updated, err := dao.IsUserSubscribed(ctx, *userDetails)
	if err != nil {
		logger.Error("Failed to check subscription status",
			"error", err, "email", userDetails.Email, "remoteAddr", remoteAddr)
		return true
	}
	logger.Debug("Subscription status checked",
		"email", userDetails.Email, "subscriber", updated.Subscriber, "remoteAddr", remoteAddr)

	if userDetails.Subscriber != updated.Subscriber {
		logger.Info("Subscription status changed",
			"email", userDetails.Email,
			"previousStatus", userDetails.Subscriber,
			"newStatus", updated.Subscriber, "remoteAddr", remoteAddr)
		if err = dao.UpdateUser(ctx, *updated); err != nil {
			logger.Error("Failed to update user subscription status",
				"error", err, "email", userDetails.Email, "remoteAddr", remoteAddr)
			api.RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
			return false
		}
	}
	if updated.NotifyExpired {
		logger.Info("User subscription expired, creating alert",
			"email", userDetails.Email, "remoteAddr", remoteAddr)
		sendSubscriptionAlert(ctx, dao, models.Alert{
			ID:          "sub-expired-" + userDetails.Email,
			Subject:     "Subscription Expired",
			Message:     "Your subscription has expired. Renew to regain access to premium features.",
			Link:        "/subscribe",
			TargetEmail: userDetails.Email,
		})
	}
	if updated.NotifyRestored {
		logger.Info("User subscription restored, creating alert",
			"email", userDetails.Email, "remoteAddr", remoteAddr)
		sendSubscriptionAlert(ctx, dao, models.Alert{
			ID:          "sub-restored-" + userDetails.Email + "-" + strconv.FormatInt(time.Now().Unix(), 10),
			Subject:     "Subscription Restored",
			Message:     "Your subscription is active again. Your stories are being restored and will be available shortly.",
			Link:        "/stories",
			TargetEmail: userDetails.Email,
		})
	}
	maybeSendExpiringSoonAlert(ctx, dao, updated, userDetails.Email)
	return true
}

// renderMobileRedirectPage writes an HTML page with a JavaScript redirect to
// the mobile deep link. Used because HTTP redirects to custom schemes
// (minithreadr://, exp://) don't fire reliably from Chrome Custom Tabs.
// For Expo Go (exp://), auto-redirect is disabled — the user must tap the
// rendered link manually.
func renderMobileRedirectPage(w http.ResponseWriter, deepLinkURL string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)

	instructions := "Tap the link below to return to the app"
	if strings.HasPrefix(deepLinkURL, "exp://") {
		instructions = "Tap the link below to return to Expo Go"
	}

	page := fmt.Sprintf(mobileRedirectPageTemplate,
		html.EscapeString(instructions),
		html.EscapeString(deepLinkURL),
		html.EscapeString(deepLinkURL))
	_, _ = w.Write([]byte(page))
}

// mobileRedirectPageTemplate is the HTML page shown after OAuth completes
// when the resolved redirect target is a mobile deep link. The three %s
// substitutions are: the user-facing instructions, the deep link href on
// the visible button, and the deep link URL the embedded JS redirects to.
const mobileRedirectPageTemplate = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Redirecting...</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%%, #764ba2 100%%);
        }
        .container {
            background: white;
            border-radius: 10px;
            padding: 40px;
            text-align: center;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            max-width: 90%%;
        }
        h1 { color: #333; margin-bottom: 20px; }
        p { color: #666; margin: 10px 0; }
        .instructions {
            font-size: 18px;
            font-weight: 600;
            color: #333;
            margin: 30px 0 20px 0;
        }
        .spinner {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #667eea;
            border-radius: 50%%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 20px auto;
        }
        @keyframes spin {
            0%% { transform: rotate(0deg); }
            100%% { transform: rotate(360deg); }
        }
        a {
            display: inline-block;
            margin-top: 20px;
            padding: 15px 30px;
            background: #667eea;
            color: white;
            text-decoration: none;
            border-radius: 8px;
            font-size: 18px;
            font-weight: 600;
        }
        a:active {
            background: #5568d3;
        }
        .note {
            font-size: 14px;
            color: #999;
            margin-top: 30px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Authentication Successful</h1>
        <div class="spinner"></div>
        <p class="instructions">%s:</p>
        <p><a href="%s" id="deepLink">Return to App</a></p>
        <p class="note">You can close this page after tapping the link above</p>
    </div>
    <script>
        var redirectUrl = "%s";
        var isExpoGo = redirectUrl.startsWith('exp://');

        if (!isExpoGo) {
            setTimeout(function() {
                window.location.href = redirectUrl;
            }, 100);
            setTimeout(function() {
                document.getElementById('deepLink').click();
            }, 500);
        } else {
            document.querySelector('.spinner').style.display = 'none';
        }
    </script>
</body>
</html>`

// resolveRedirectTarget validates a candidate post-auth redirect URL and
// returns the URL to actually redirect to. Mobile schemes (minithreadr://,
// exp://) go through safeMobileRedirect; everything else is run through
// safeRedirect against allowedOrigins. On rejection, falls back to frontend.
// `source` is interpolated into log messages ("query", "session") so callers
// can distinguish where the candidate came from.
func resolveRedirectTarget(candidate, frontend, source string, allowedOrigins []string) string {
	if strings.HasPrefix(candidate, "minithreadr://") || strings.HasPrefix(candidate, "exp://") {
		validURL, ok := safeMobileRedirect(candidate)
		if ok {
			logger.Info("Validated mobile redirect URL from "+source, "url", validURL)
			return validURL
		}
		logger.Warn("Rejected invalid mobile redirect URL from "+source, "url", candidate)
		return frontend
	}
	return safeRedirect(candidate, frontend, allowedOrigins)
}

// sendSubscriptionAlert fills in the standard system-alert fields and fires
// the DAO write in a detached goroutine. Caller supplies the variable parts
// (ID, Subject, Message, Link, TargetEmail).
func sendSubscriptionAlert(ctx context.Context, dao daos.DaoInterface, alert models.Alert) {
	alert.AlertType = models.AlertTypePersonal
	alert.CreatedAt = time.Now().Unix()
	alert.CreatedBy = "system"
	go func() {
		bgCtx := context.WithoutCancel(ctx)
		if err := dao.CreateAlert(bgCtx, alert); err != nil {
			logger.Error("Failed to create subscription alert",
				"error", err, "email", alert.TargetEmail, "alertID", alert.ID)
		}
	}()
}

// maybeSendExpiringSoonAlert sends a "subscription expires in N days" alert
// if the user is currently subscribed and the period ends within 7 days.
func maybeSendExpiringSoonAlert(
	ctx context.Context,
	dao daos.DaoInterface,
	updated *models.UserInfo,
	email string,
) {
	if !updated.Subscriber {
		return
	}
	sub, subErr := dao.GetSubscription(ctx, email)
	if subErr != nil || sub.CurrentSubscriptionEnd.IsZero() {
		return
	}
	daysLeft := int(time.Until(sub.CurrentSubscriptionEnd).Hours() / 24) //nolint:mnd
	if daysLeft < 0 || daysLeft > 7 {
		return
	}
	plural := ""
	if daysLeft != 1 {
		plural = "s"
	}
	sendSubscriptionAlert(ctx, dao, models.Alert{
		// Dedup: use a fixed ID so we don't spam on every login.
		ID:      "sub-expiring-" + email,
		Subject: "Subscription Expiring Soon",
		Message: fmt.Sprintf(
			"Your subscription expires in %d day%s. Renew to keep access to premium features.",
			daysLeft,
			plural,
		),
		Link:        "/account/subscription",
		TargetEmail: email,
	})
}
