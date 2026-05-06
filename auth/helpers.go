package auth

import (
	"context"
	"fmt"
	"strings"
	"time"

	"Threadr/daos"
	"Threadr/logger"
	"Threadr/models"
)

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
