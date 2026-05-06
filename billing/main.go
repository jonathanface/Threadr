package billing

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"Threadr/logger"

	stripe "github.com/stripe/stripe-go/v79"
	"github.com/stripe/stripe-go/v79/subscription"
	"github.com/stripe/stripe-go/v79/webhook"

	ctxkey "Threadr/ctxkeys"
	"Threadr/daos"
	"Threadr/models"

	"github.com/stripe/stripe-go/v79/billingportal/session"
)

// Test seams: tests swap these to inject behavior without a full DI graph.
//
//nolint:gochecknoglobals // mock-injection points used only by tests.
var (
	getUserEmailFn   = getUserEmail
	ensureCustomerFn = ensureCustomer
)

// safeReturnURL validates and sanitizes return URLs to prevent open redirect attacks.
// Only allows:
//   - Relative paths starting with "/" (e.g., "/account/subscription")
//   - Absolute URLs matching the request's host
//
// Returns the validated URL or the default if validation fails.
func safeReturnURL(returnURL string, r *http.Request) string {
	scheme := "https"
	if r.TLS == nil && !strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
		scheme = "http"
	}
	defaultURL := scheme + "://" + r.Host + "/account/subscription"

	if returnURL == "" {
		return defaultURL
	}

	// Allow relative paths
	if strings.HasPrefix(returnURL, "/") {
		// Prevent protocol-relative URLs like "//evil.com"
		if strings.HasPrefix(returnURL, "//") {
			logger.Warn("safeReturnURL: rejected protocol-relative URL", "returnURL", returnURL)
			return defaultURL
		}
		return scheme + "://" + r.Host + returnURL
	}

	// Validate absolute URLs - must match request host
	parsed, err := url.Parse(returnURL)
	if err != nil {
		logger.Warn("safeReturnURL: failed to parse URL", "returnURL", returnURL, "error", err)
		return defaultURL
	}

	// Must be http or https
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		logger.Warn("safeReturnURL: rejected non-http(s) scheme", "returnURL", returnURL)
		return defaultURL
	}

	// Host must match (case-insensitive)
	if !strings.EqualFold(parsed.Host, r.Host) {
		logger.Warn("safeReturnURL: rejected mismatched host", "got", parsed.Host, "expected", r.Host)
		return defaultURL
	}

	return returnURL
}

//nolint:funlen // Stripe webhook dispatch: signature verify + event-type switch + cascade DAO writes.
func StripeWebhookEndpoint(w http.ResponseWriter, r *http.Request) {
	const tolerance = 300 * time.Second

	payload, _ := io.ReadAll(r.Body)
	defer r.Body.Close()

	sigHeader := r.Header.Get("Stripe-Signature")
	endpointSecret := os.Getenv("STRIPE_WEBHOOK_SECRET")
	if endpointSecret == "" {
		RespondWithError(w, http.StatusInternalServerError, "missing webhook secret")
		return
	}

	var (
		err error
	)
	daoOptions := daos.Options{
		Region:     getenv("AWS_REGION", defaultAwsRegion),
		MaxRetries: atoiDefault(os.Getenv("AWS_MAX_RETRIES"), defaultMaxRetries),
		BlockTableMinWriteCapacity: atoiDefault(
			os.Getenv("AWS_BLOCKTABLE_MIN_WRITE_CAPACITY"),
			defaultAWSBlockWriteCapacity,
		),
		WriteBatchSize: atoiDefault(os.Getenv("DYNAMO_WRITE_BATCH_SIZE"), defaultDynamoWriteBatchSize),
	}
	dao, err := daos.NewDAO(context.Background(), daoOptions)
	if err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}

	event, err := webhook.ConstructEventWithOptions(payload, sigHeader, endpointSecret, webhook.ConstructEventOptions{
		IgnoreAPIVersionMismatch: true,
		Tolerance:                tolerance,
	})
	if err != nil {
		logger.Error("Stripe signature verification failed", "error", err)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	var (
		needsRestore bool
		email        string
		user         *models.UserInfo
	)
	// Stripe defines ~270 event types we don't care about; the default branch ACKs them.
	switch event.Type { //nolint:exhaustive
	case "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted":
		var sub stripe.Subscription
		if err = json.NewDecoder(bytes.NewReader(event.Data.Raw)).Decode(&sub); err != nil {
			logger.Error("Bad request", "error", err)
			RespondWithError(w, http.StatusBadRequest, "Invalid request")
			return
		}

		logger.Info("StripeWebhook processing event",
			"eventType", event.Type,
			"subscriptionID", sub.ID,
			"customerID", sub.Customer.ID,
			"mode", os.Getenv("MODE"))

		email, err = dao.GetEmailByCustomerID(context.Background(), sub.Customer.ID)
		if err != nil || email == "" {
			logger.Warn("StripeWebhook: failed to find email for customer", "customerID", sub.Customer.ID, "error", err)
			RespondWithError(w, http.StatusBadRequest, "unknown customer")
			return
		}
		logger.Info("StripeWebhook: found email for customer", "email", email, "customerID", sub.Customer.ID)

		if err := dao.UpdateSubscription(context.Background(), models.Subscription{ //nolint:govet
			Email:                  email,
			CustomerID:             sub.Customer.ID,
			SubscriptionID:         sub.ID,
			LastSubCheck:           time.Now(),
			CurrentSubscriptionEnd: time.Unix(sub.CurrentPeriodEnd, 0).UTC(),
		}); err != nil {
			logger.Error("Internal error", "error", err)
			RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
			return
		}

		user, err = dao.GetUserDetails(context.Background(), email)
		if err != nil {
			logger.Error("Internal error", "error", err)
			RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
			return
		}

		isActive := sub.Status == stripe.SubscriptionStatusActive || sub.Status == stripe.SubscriptionStatusTrialing

		if isActive && !user.Subscriber {
			user.Subscriber = true
			if wasSuspended, err := dao.CheckForSuspendedStories( //nolint:govet
				context.Background(),
				user.Email,
			); err == nil &&
				wasSuspended {
				needsRestore = true
				user.NotifyRestored = true
			} else if err != nil {
				// validation/state still not ACKed yet, so we can error out
				logger.Error("Internal error", "error", err)
				RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
				return
			}
		} else if !isActive && user.Subscriber {
			user.Subscriber = false
			user.NotifyExpired = true

			// suspend others (async fan-out OK)
			stories, err := dao.GetAllStories(context.Background(), user.Email) //nolint:govet
			if err != nil && !errors.Is(err, sql.ErrNoRows) {
				logger.Error("Internal error", "error", err)
				RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
				return
			}
			for idx, s := range stories {
				if idx > 0 {
					go func(storyID string) {
						if delErr := dao.SoftDeleteStory(
							context.Background(),
							user.Email,
							storyID,
							true,
						); delErr != nil {
							logger.Error("background SoftDeleteStory failed", "storyID", storyID, "error", delErr)
						}
					}(s.ID)
				}
			}
		}

		if err = dao.UpdateUser(context.Background(), *user); err != nil {
			logger.Error("Internal error", "error", err)
			RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
			return
		}

	default:
		// Not a type we care about: ACK and return
		RespondWithJSON(w, http.StatusOK, nil)
		return
	}
	RespondWithJSON(w, http.StatusOK, nil)

	if needsRestore {
		go func(email string) {
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute) //nolint:mnd
			defer cancel()

			events, err := dao.RestoreAutomaticallyDeletedStories(ctx, email) //nolint:govet
			if err != nil {
				logger.Error("restore start failed", "email", email, "error", err)
				return
			}
			for ev := range events {
				if ev.Err == nil {
					story, getErr := dao.GetStoryByID(context.Background(), email, ev.StoryID)
					if getErr == nil {
						story.Inactive = false
						if _, e2 := dao.EditStory(context.Background(), email, *story); e2 != nil {
							logger.Error("post-restore EditStory failed", "storyID", ev.StoryID, "error", e2)
						}
					} else {
						logger.Error("GetStoryByID failed", "storyID", ev.StoryID, "error", getErr)
					}
					logger.Info("restored story", "storyID", ev.StoryID, "index", ev.Index, "total", ev.Total)
				} else {
					logger.Error("restore error",
						"storyID", ev.StoryID, "index", ev.Index, "total", ev.Total, "error", ev.Err)
				}
			}
		}(email)
	}
}

func SubscribeCustomerEndpoint(w http.ResponseWriter, r *http.Request) {
	priceID := os.Getenv("STRIPE_PRICE_ID")
	if len(priceID) == 0 {
		RespondWithError(w, http.StatusInternalServerError, "missing stripe price id")
		return
	}

	var (
		email string
		err   error
		dao   daos.DaoInterface
		ok    bool
	)
	if email, err = getUserEmailFn(r); err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}

	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	user, err := dao.GetUserDetails(r.Context(), email)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve user info")
		return
	}

	sub, err := dao.GetSubscription(r.Context(), email)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		RespondWithError(w, http.StatusInternalServerError, "unable to load subscription")
		return
	}

	custID, err := ensureCustomerFn(user, sub)
	if err != nil {
		logger.Error("Failed to ensure Stripe customer", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}

	// Check if there's an existing incomplete subscription for this customer
	var s *stripe.Subscription
	if sub != nil && sub.SubscriptionID != "" {
		logger.Info("SubscribeCustomer: checking existing subscription",
			"subscriptionID", sub.SubscriptionID, "email", email)
		existingSub, err := subscription.Get(sub.SubscriptionID, nil) //nolint:govet
		if err == nil && existingSub.Status == stripe.SubscriptionStatusIncomplete {
			logger.Info("SubscribeCustomer: reusing existing incomplete subscription",
				"subscriptionID", sub.SubscriptionID, "email", email)
			// Reuse the existing incomplete subscription
			s = existingSub
		} else if err != nil {
			logger.Warn("SubscribeCustomer: could not fetch existing subscription",
				"subscriptionID", sub.SubscriptionID, "error", err)
		}
	}

	// If no incomplete subscription found, create a new one
	if s == nil {
		logger.Info("SubscribeCustomer: creating new subscription", "email", email)
		params := &stripe.SubscriptionParams{
			Customer:        stripe.String(custID),
			Items:           []*stripe.SubscriptionItemsParams{{Price: stripe.String(priceID)}},
			PaymentBehavior: stripe.String("default_incomplete"),
			PaymentSettings: &stripe.SubscriptionPaymentSettingsParams{
				SaveDefaultPaymentMethod: stripe.String("on_subscription"),
			},
			Expand: []*string{
				stripe.String("latest_invoice.payment_intent"),
			},
		}
		s, err = subscription.New(params)
		if err != nil {
			logger.Error("Internal error", "error", err)
			http.Error(w, "An internal error occurred", http.StatusInternalServerError)
			return
		}
		logger.Info("SubscribeCustomer: created new subscription", "subscriptionID", s.ID, "email", email)
	} else {
		// Expand the latest invoice for the existing subscription
		s, err = subscription.Get(s.ID, &stripe.SubscriptionParams{
			Params: stripe.Params{
				Expand: []*string{
					stripe.String("latest_invoice.payment_intent"),
				},
			},
		})
		if err != nil {
			logger.Error("Internal error", "error", err)
			http.Error(w, "An internal error occurred", http.StatusInternalServerError)
			return
		}
	}

	inv := s.LatestInvoice
	if inv == nil || inv.PaymentIntent == nil {
		RespondWithError(w, http.StatusFailedDependency, "missing payment_intent")
		return
	}
	var periodEnd time.Time
	if s.CurrentPeriodEnd > 0 {
		periodEnd = time.Unix(s.CurrentPeriodEnd, 0).UTC()
	}

	err = dao.UpdateSubscription(r.Context(), models.Subscription{
		Email:                  user.Email,
		SubscriptionID:         s.ID,
		CustomerID:             custID,
		CurrentSubscriptionEnd: periodEnd,
		LastSubCheck:           time.Now(),
	})
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "unable to update subscription")
		return
	}
	RespondWithJSON(w, http.StatusOK, createSubResp{
		SubscriptionID: s.ID,
		Status:         string(s.Status),
		ClientSecret:   inv.PaymentIntent.ClientSecret,
	})
}

func SummaryEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		email string
		err   error
		dao   daos.DaoInterface
		ok    bool
	)

	if email, err = getUserEmailFn(r); err != nil {
		logger.Error("Authentication failed", "error", err)
		RespondWithError(w, http.StatusUnauthorized, "Authentication failed")
		return
	}

	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "DAO missing from context")
		return
	}

	user, err := dao.GetUserDetails(r.Context(), email)
	if err != nil || user == nil {
		RespondWithError(w, http.StatusInternalServerError, "unable to load user")
		return
	}

	sub, err := dao.GetSubscription(r.Context(), email)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		RespondWithError(w, http.StatusInternalServerError, "unable to load user")
		return
	}

	if _, err = ensureCustomerFn(user, sub); err != nil {
		logger.Error("Failed to ensure Stripe customer", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}

	if sub != nil && sub.SubscriptionID != "" {
		logger.Info("BillingSummary: fetching subscription from Stripe API",
			"subscriptionID", sub.SubscriptionID, "email", email)
		stripeSub, err := subscription.Get(sub.SubscriptionID, nil) //nolint:govet
		if err != nil {
			logger.Error("BillingSummary: failed to get subscription from Stripe", "email", email, "error", err)
			RespondWithError(w, http.StatusInternalServerError, "unable to retrieve subscription from stripe")
			return
		}
		logger.Info("BillingSummary: retrieved subscription",
			"subscriptionID", stripeSub.ID,
			"email", email,
			"status", stripeSub.Status,
			"customerID", stripeSub.Customer.ID)

		var custID string
		if stripeSub.Customer != nil && stripeSub.Customer.ID != "" {
			custID = stripeSub.Customer.ID
		}
		var cpeTime time.Time
		if stripeSub.CurrentPeriodEnd > 0 {
			cpeTime = time.Unix(stripeSub.CurrentPeriodEnd, 0).UTC()
		}
		sub.CustomerID = custID
		sub.LastSubCheck = time.Now().UTC()
		sub.CurrentSubscriptionEnd = cpeTime

		err = dao.UpdateSubscription(r.Context(), *sub)
		if err != nil {
			RespondWithError(w, http.StatusInternalServerError, "error updating subscription")
			return
		}
		var cpe string
		if !cpeTime.IsZero() {
			cpe = cpeTime.Format(time.RFC3339)
		}
		logger.Info("BillingSummary: returning subscription status",
			"status", stripeSub.Status,
			"cancelAtPeriodEnd", stripeSub.CancelAtPeriodEnd)
		RespondWithJSON(w, http.StatusOK, map[string]any{
			"id":                stripeSub.ID,
			"status":            stripeSub.Status,
			"currentPeriodEnd":  cpe,
			"cancelAtPeriodEnd": stripeSub.CancelAtPeriodEnd,
		})
		return
	}

	// no subscriptions found
	RespondWithJSON(w, http.StatusOK, map[string]any{
		"status": "none",
	})
}

func PortalSessionEndpoint(w http.ResponseWriter, r *http.Request) {
	// 1) Who is the user?
	email, err := getUserEmailFn(r)
	if err != nil {
		logger.Error("Authentication failed", "error", err)
		RespondWithError(w, http.StatusUnauthorized, "Authentication failed")
		return
	}

	// 2) DAO from context
	dao, ok := r.Context().Value(ctxkey.DAO).(daos.DaoInterface)
	if !ok {
		RespondWithError(w, http.StatusInternalServerError, "DAO missing from context")
		return
	}

	// 3) Load app user
	user, err := dao.GetUserDetails(r.Context(), email)
	if err != nil || user == nil {
		RespondWithError(w, http.StatusInternalServerError, "unable to load user")
		return
	}

	sub, err := dao.GetSubscription(r.Context(), email)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		RespondWithError(w, http.StatusInternalServerError, "unable to load user")
		return
	}

	// 4) Ensure Stripe customer exists / get ID
	custID, err := ensureCustomerFn(user, sub)
	if err != nil {
		logger.Error("Failed to ensure Stripe customer", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}

	// 5) Determine return URL (from header or fallback)
	// Validate to prevent open redirect attacks
	retURL := safeReturnURL(r.Header.Get("X-Return-Url"), r)

	// 6) Create Portal session
	sess, err := session.New(&stripe.BillingPortalSessionParams{
		Customer:  stripe.String(custID),
		ReturnURL: stripe.String(retURL),
	})
	if err != nil {
		logger.Error("Stripe portal error", "error", err)
		RespondWithError(w, http.StatusBadGateway, "Payment service error")
		return
	}

	if sub != nil {
		var zeroTime time.Time
		sub.LastSubCheck = zeroTime
		err = dao.UpdateSubscription(r.Context(), *sub)
		if err != nil {
			logger.Error("Failed to update subscription", "error", err)
			RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
			return
		}
	}

	// 7) Respond with the redirect URL
	RespondWithJSON(w, http.StatusOK, map[string]string{"url": sess.URL})
}
