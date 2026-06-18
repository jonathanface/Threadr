package billing

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"time"

	"Threadr/daos"
	"Threadr/logger"
	"Threadr/models"

	stripe "github.com/stripe/stripe-go/v79"
	"github.com/stripe/stripe-go/v79/webhook"
)

// setupWebhookEvent reads the request body, verifies the Stripe signature
// and returns a constructed event plus a freshly-built DAO. On any failure
// it writes the appropriate HTTP error and returns ok=false; callers should
// just return.
func setupWebhookEvent(w http.ResponseWriter, r *http.Request) (dao daos.DaoInterface, event stripe.Event, ok bool) {
	const tolerance = 300 * time.Second

	payload, _ := io.ReadAll(r.Body)
	defer r.Body.Close()

	endpointSecret := os.Getenv("STRIPE_WEBHOOK_SECRET")
	if endpointSecret == "" {
		RespondWithError(w, http.StatusInternalServerError, "missing webhook secret")
		return nil, stripe.Event{}, false
	}

	daoOptions := daos.Options{
		Region:     getenv("AWS_REGION", defaultAwsRegion),
		MaxRetries: atoiDefault(os.Getenv("AWS_MAX_RETRIES"), defaultMaxRetries),
		BlockTableMinWriteCapacity: atoiDefault(
			os.Getenv("AWS_BLOCKTABLE_MIN_WRITE_CAPACITY"),
			defaultAWSBlockWriteCapacity,
		),
		WriteBatchSize: atoiDefault(os.Getenv("DYNAMO_WRITE_BATCH_SIZE"), defaultDynamoWriteBatchSize),
	}
	builtDao, err := newDAOFn(context.Background(), daoOptions)
	if err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return nil, stripe.Event{}, false
	}

	sigHeader := r.Header.Get("Stripe-Signature")
	ev, err := webhook.ConstructEventWithOptions(payload, sigHeader, endpointSecret, webhook.ConstructEventOptions{
		IgnoreAPIVersionMismatch: true,
		Tolerance:                tolerance,
	})
	if err != nil {
		logger.Error("Stripe signature verification failed", "error", err)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return nil, stripe.Event{}, false
	}
	return builtDao, ev, true
}

// handleSubscriptionEvent processes a customer.subscription.* webhook event:
// resolves the customer's email, persists the subscription record, mutates
// the user's subscriber state to match Stripe, and writes the user back.
// Returns the resolved email and whether a story-restoration goroutine
// should be launched (true when transitioning suspended → active). On any
// failure it writes the appropriate HTTP error and returns ok=false.
func handleSubscriptionEvent(
	w http.ResponseWriter,
	dao daos.DaoInterface,
	event stripe.Event,
) (email string, needsRestore, ok bool) {
	var sub stripe.Subscription
	if err := json.NewDecoder(bytes.NewReader(event.Data.Raw)).Decode(&sub); err != nil {
		logger.Error("Bad request", "error", err)
		RespondWithError(w, http.StatusBadRequest, "Invalid request")
		return "", false, false
	}

	logger.Info("StripeWebhook processing event",
		"eventType", event.Type,
		"subscriptionID", sub.ID,
		"customerID", sub.Customer.ID,
		"mode", os.Getenv("MODE"))

	ctx := context.Background()
	email, err := dao.GetEmailByCustomerID(ctx, sub.Customer.ID)
	if err != nil || email == "" {
		logger.Warn("StripeWebhook: failed to find email for customer", "customerID", sub.Customer.ID, "error", err)
		RespondWithError(w, http.StatusBadRequest, "unknown customer")
		return "", false, false
	}
	logger.Info("StripeWebhook: found email for customer", "email", email, "customerID", sub.Customer.ID)

	if err = dao.UpdateSubscription(ctx, models.Subscription{
		Email:                  email,
		CustomerID:             sub.Customer.ID,
		SubscriptionID:         sub.ID,
		LastSubCheck:           time.Now(),
		CurrentSubscriptionEnd: time.Unix(sub.CurrentPeriodEnd, 0).UTC(),
	}); err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return "", false, false
	}

	user, err := dao.GetUserDetails(ctx, email)
	if err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return "", false, false
	}

	isActive := sub.Status == stripe.SubscriptionStatusActive || sub.Status == stripe.SubscriptionStatusTrialing
	needsRestore, err = applySubscriptionTransition(ctx, dao, user, isActive)
	if err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return "", false, false
	}

	if err = dao.UpdateUser(ctx, *user); err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return "", false, false
	}
	return email, needsRestore, true
}

// applySubscriptionTransition mutates user in-place to reflect a transition
// to/from active subscription state. Returns needsRestore=true when the
// transition is suspended→active and the user has stories that were
// auto-suspended (the caller should kick off the async restore goroutine
// after the OK response is written).
func applySubscriptionTransition(
	ctx context.Context,
	dao daos.DaoInterface,
	user *models.UserInfo,
	isActive bool,
) (needsRestore bool, err error) {
	switch {
	case isActive && !user.Subscriber:
		user.Subscriber = true
		wasSuspended, sErr := dao.CheckForSuspendedStories(ctx, user.Email)
		if sErr != nil {
			return false, sErr
		}
		if wasSuspended {
			user.NotifyRestored = true
			return true, nil
		}
	case !isActive && user.Subscriber:
		user.Subscriber = false
		suspendExcessAssociationsAsync(ctx, dao, user.Email)
		fireSubscriptionExpiredAlert(ctx, dao, user.Email)
	}
	return false, nil
}

// fireSubscriptionExpiredAlert writes a persisted "Subscription Expired" alert
// so the user sees the notification on any page, not just after their next
// OAuth login. The alert ID is deterministic so a later OAuth-path retry
// upserts the same row.
func fireSubscriptionExpiredAlert(ctx context.Context, dao daos.DaoInterface, email string) {
	alert := models.Alert{
		ID:          "sub-expired-" + email,
		Subject:     "Subscription Expired",
		Message:     "Your subscription has expired. Your stories are safe, but exporting, sharing with readers, and adding more than 10 associations per story are paused until you resubscribe.",
		Link:        "/subscribe",
		TargetEmail: email,
		AlertType:   models.AlertTypePersonal,
		CreatedAt:   time.Now().Unix(),
		CreatedBy:   "system",
	}
	go func() {
		bgCtx := context.WithoutCancel(ctx)
		if err := dao.CreateAlert(bgCtx, alert); err != nil {
			logger.Error("failed to create subscription-expired alert",
				"error", err, "email", email, "alertID", alert.ID)
		}
	}()
}


// suspendExcessAssociationsAsync runs SuspendExcessAssociations in a
// background goroutine so the Stripe webhook can ACK quickly. Failures are
// logged but never block the response — a missed suspension just means the
// user temporarily sees over-cap associations until the next cleanup pass
// or until they touch the data.
func suspendExcessAssociationsAsync(ctx context.Context, dao daos.DaoInterface, email string) {
	go func() {
		bgCtx := context.WithoutCancel(ctx)
		if err := dao.SuspendExcessAssociations(bgCtx, email); err != nil {
			logger.Error("background SuspendExcessAssociations failed",
				"email", email, "error", err)
		}
	}()
}

// restoreSuspendedStoriesAsync drives the post-resubscription restoration:
// streams events from RestoreAutomaticallyDeletedStories, clears each
// restored story's Inactive flag, and removes any suspended_at flags on
// the user's associations. Runs with a 30-minute timeout to bound
// long-running restores.
func restoreSuspendedStoriesAsync(dao daos.DaoInterface, email string) {
	const restoreTimeout = 30 * time.Minute
	ctx, cancel := context.WithTimeout(context.Background(), restoreTimeout)
	defer cancel()

	// Clear suspended_at on associations so the user immediately sees them
	// again, independently of the (legacy) story restoration loop below.
	if err := dao.RestoreSuspendedAssociations(ctx, email); err != nil {
		logger.Error("RestoreSuspendedAssociations failed", "email", email, "error", err)
	}

	events, err := dao.RestoreAutomaticallyDeletedStories(ctx, email)
	if err != nil {
		logger.Error("restore start failed", "email", email, "error", err)
		return
	}
	for ev := range events {
		if ev.Err != nil {
			logger.Error("restore error",
				"storyID", ev.StoryID, "index", ev.Index, "total", ev.Total, "error", ev.Err)
			continue
		}
		story, getErr := dao.GetStoryByID(context.Background(), email, ev.StoryID)
		if getErr != nil {
			logger.Error("GetStoryByID failed", "storyID", ev.StoryID, "error", getErr)
			continue
		}
		story.Inactive = false
		if _, e2 := dao.EditStory(context.Background(), email, *story); e2 != nil {
			logger.Error("post-restore EditStory failed", "storyID", ev.StoryID, "error", e2)
		}
		logger.Info("restored story", "storyID", ev.StoryID, "index", ev.Index, "total", ev.Total)
	}
}
