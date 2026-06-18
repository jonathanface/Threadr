package billing

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"Threadr/logger"

	stripe "github.com/stripe/stripe-go/v79"
	"github.com/stripe/stripe-go/v79/subscription"

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
	// newDAOFn returns the interface, not the concrete *DAO, so tests can
	// inject a *daos.MockDAO without touching DynamoDB.
	newDAOFn = func(ctx context.Context, opts daos.Options) (daos.DaoInterface, error) {
		return daos.NewDAO(ctx, opts)
	}
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

// StripeWebhookEndpoint receives Stripe webhook events. We only care about
// customer.subscription.* events; everything else is ACKed without action.
// Stripe defines ~270 event types we don't care about, so the default
// branch is intentional, not exhaustive.
func StripeWebhookEndpoint(w http.ResponseWriter, r *http.Request) {
	dao, event, ok := setupWebhookEvent(w, r)
	if !ok {
		return
	}

	switch event.Type { //nolint:exhaustive
	case "customer.subscription.created",
		"customer.subscription.updated",
		"customer.subscription.deleted":
		email, needsRestore, handled := handleSubscriptionEvent(w, dao, event)
		if !handled {
			return
		}
		RespondWithJSON(w, http.StatusOK, nil)
		if needsRestore {
			go restoreSuspendedStoriesAsync(dao, email)
		}
	default:
		RespondWithJSON(w, http.StatusOK, nil)
	}
}

func SubscribeCustomerEndpoint(w http.ResponseWriter, r *http.Request) {
	priceID := os.Getenv("STRIPE_PRICE_ID")
	if len(priceID) == 0 {
		RespondWithError(w, http.StatusInternalServerError, "missing stripe price id")
		return
	}

	// Optional JSON body: { "promo_code": "..." }. Body absence is fine —
	// older clients that just POST don't send anything.
	var reqBody struct {
		PromoCode string `json:"promo_code"`
	}
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&reqBody)
	}
	reqBody.PromoCode = strings.TrimSpace(reqBody.PromoCode)

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
		// Optional promotion code from the request body. Resolve the
		// customer-facing code string to a Stripe Promotion Code ID and
		// attach via Discounts. Invalid/expired codes fail fast with 400.
		if reqBody.PromoCode != "" {
			promoID, presolveErr := resolvePromoCodeID(reqBody.PromoCode)
			if presolveErr != nil {
				RespondWithError(w, http.StatusBadRequest, presolveErr.Error())
				return
			}
			params.Discounts = []*stripe.SubscriptionDiscountParams{
				{PromotionCode: stripe.String(promoID)},
			}
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
