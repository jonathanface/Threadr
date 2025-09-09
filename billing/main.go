package billing

import (
	"database/sql"
	"fmt"
	"net/http"
	"os"
	"time"

	stripe "github.com/stripe/stripe-go/v79"
	"github.com/stripe/stripe-go/v79/subscription"

	ctxkey "RichDocter/ctxkeys"
	"RichDocter/daos"
	"RichDocter/models"

	"github.com/stripe/stripe-go/v79/billingportal/session"
)

// stubs to make these funcs mockable in tests
var getUserEmailFn = getUserEmail
var ensureCustomerFn = ensureCustomer

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
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	user, err := dao.GetUserDetails(email)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve user info")
		return
	}

	sub, err := dao.GetSubscription(email)
	if err != nil && err != sql.ErrNoRows {
		RespondWithError(w, http.StatusInternalServerError, "unable to load subscription")
		return
	}

	custID := ensureCustomerFn(user, sub)

	// Create (or reuse) a subscription in incomplete state
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
	s, err := subscription.New(params)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
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

	err = dao.UpdateSubscription(models.Subscription{
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
	RespondWithJson(w, http.StatusOK, createSubResp{
		SubscriptionID: s.ID,
		Status:         string(s.Status),
		ClientSecret:   inv.PaymentIntent.ClientSecret,
	})
}

func BillingSummaryEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		email string
		err   error
		dao   daos.DaoInterface
		ok    bool
	)

	if email, err = getUserEmailFn(r); err != nil {
		RespondWithError(w, http.StatusUnauthorized, err.Error())
		return
	}

	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "DAO missing from context")
		return
	}

	user, err := dao.GetUserDetails(email)
	if err != nil || user == nil {
		RespondWithError(w, http.StatusInternalServerError, "unable to load user")
		return
	}

	sub, err := dao.GetSubscription(email)
	if err != nil && err != sql.ErrNoRows {
		RespondWithError(w, http.StatusInternalServerError, "unable to load user")
		return
	}

	custID := ensureCustomerFn(user, sub)

	params := &stripe.SubscriptionListParams{
		Customer: stripe.String(custID),
	}
	params.Limit = stripe.Int64(1)

	it := subscription.List(params)
	if err := it.Err(); err != nil {
		RespondWithError(w, http.StatusBadGateway, "stripe list error: "+err.Error())
		return
	}

	if it.Next() {
		s := it.Subscription()

		var cpe string
		if s.CurrentPeriodEnd > 0 {
			cpe = time.Unix(s.CurrentPeriodEnd, 0).UTC().Format(time.RFC3339)
		}
		fmt.Println(s.Status)

		RespondWithJson(w, http.StatusOK, map[string]any{
			"id":                s.ID,
			"status":            s.Status,            // "active", "trialing", "past_due", "incomplete", "canceled", etc.
			"currentPeriodEnd":  cpe,                 // RFC3339 string or ""
			"cancelAtPeriodEnd": s.CancelAtPeriodEnd, // bool
		})
		return
	}

	// no subscriptions found
	RespondWithJson(w, http.StatusOK, map[string]any{
		"status": "none",
	})
}

func BillingPortalSessionEndpoint(w http.ResponseWriter, r *http.Request) {
	// 1) Who is the user?
	email, err := getUserEmailFn(r)
	if err != nil {
		RespondWithError(w, http.StatusUnauthorized, err.Error())
		return
	}

	// 2) DAO from context
	dao, ok := r.Context().Value(ctxkey.DAO).(daos.DaoInterface)
	if !ok {
		RespondWithError(w, http.StatusInternalServerError, "DAO missing from context")
		return
	}

	// 3) Load app user
	user, err := dao.GetUserDetails(email)
	if err != nil || user == nil {
		RespondWithError(w, http.StatusInternalServerError, "unable to load user")
		return
	}

	sub, err := dao.GetSubscription(email)
	if err != nil && err != sql.ErrNoRows {
		RespondWithError(w, http.StatusInternalServerError, "unable to load user")
		return
	}

	// 4) Ensure Stripe customer exists / get ID
	custID := ensureCustomerFn(user, sub)

	// 5) Determine return URL (from header or fallback)
	retURL := r.Header.Get("X-Return-Url")
	if retURL == "" {
		scheme := "https"
		if r.TLS == nil {
			scheme = "http"
		}
		retURL = scheme + "://" + r.Host + "/account/subscription"
	}

	// 6) Create Portal session
	sess, err := session.New(&stripe.BillingPortalSessionParams{
		Customer:  stripe.String(custID),
		ReturnURL: stripe.String(retURL),
	})
	if err != nil {
		RespondWithError(w, http.StatusBadGateway, "stripe portal error: "+err.Error())
		return
	}

	// 7) Respond with the redirect URL
	RespondWithJson(w, http.StatusOK, map[string]string{"url": sess.URL})
}
