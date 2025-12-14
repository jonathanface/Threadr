package billing

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	stripe "github.com/stripe/stripe-go/v79"
	"github.com/stripe/stripe-go/v79/subscription"
	"github.com/stripe/stripe-go/v79/webhook"

	ctxkey "RichDocter/ctxkeys"
	"RichDocter/daos"
	"RichDocter/models"

	"github.com/stripe/stripe-go/v79/billingportal/session"
)

// stubs to make these funcs mockable in tests
var getUserEmailFn = getUserEmail
var ensureCustomerFn = ensureCustomer

const (
	DEFAULT_MAX_RETRIES              = 3
	DEFAULT_AWS_BLOCK_WRITE_CAPACITY = 10
	DEFAULT_AWS_REGION               = "us-east-1"
	DEFAULT_DYNAMO_WRITE_BATCH_SIZE  = 50
)

func StripeWebhookEndpoint(w http.ResponseWriter, r *http.Request) {
	log.Println("stripe hook hit")
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
		Region:                     getenv("AWS_REGION", DEFAULT_AWS_REGION),
		MaxRetries:                 atoiDefault(os.Getenv("AWS_MAX_RETRIES"), DEFAULT_MAX_RETRIES),
		BlockTableMinWriteCapacity: atoiDefault(os.Getenv("AWS_BLOCKTABLE_MIN_WRITE_CAPACITY"), DEFAULT_AWS_BLOCK_WRITE_CAPACITY),
		WriteBatchSize:             atoiDefault(os.Getenv("DYNAMO_WRITE_BATCH_SIZE"), DEFAULT_DYNAMO_WRITE_BATCH_SIZE),
	}
	dao, err := daos.NewDAO(context.Background(), daoOptions)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	event, err := webhook.ConstructEventWithOptions(payload, sigHeader, endpointSecret, webhook.ConstructEventOptions{
		IgnoreAPIVersionMismatch: true,
		Tolerance:                tolerance,
	})
	if err != nil {
		http.Error(w, "signature verification failed: "+err.Error(), http.StatusBadRequest)
		return
	}

	var (
		needsRestore bool
		email        string
		user         *models.UserInfo
	)
	switch event.Type {
	case "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted":
		var sub stripe.Subscription
		if err := json.NewDecoder(bytes.NewReader(event.Data.Raw)).Decode(&sub); err != nil {
			RespondWithError(w, http.StatusBadRequest, err.Error())
			return
		}

		log.Printf("[StripeWebhook] Processing %s event for subscription %s, customer %s, MODE=%s",
			event.Type, sub.ID, sub.Customer.ID, os.Getenv("MODE"))

		email, err = dao.GetEmailByCustomerId(context.Background(), sub.Customer.ID)
		if err != nil || email == "" {
			log.Printf("[StripeWebhook] Failed to find email for customer %s: %v", sub.Customer.ID, err)
			RespondWithError(w, http.StatusBadRequest, "unknown customer")
			return
		}
		log.Printf("[StripeWebhook] Found email %s for customer %s", email, sub.Customer.ID)

		if err := dao.UpdateSubscription(context.Background(), models.Subscription{
			Email:                  email,
			CustomerID:             sub.Customer.ID,
			SubscriptionID:         sub.ID,
			LastSubCheck:           time.Now(),
			CurrentSubscriptionEnd: time.Unix(sub.CurrentPeriodEnd, 0).UTC(),
		}); err != nil {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}

		user, err = dao.GetUserDetails(context.Background(), email)
		if err != nil {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}

		isActive := sub.Status == stripe.SubscriptionStatusActive || sub.Status == stripe.SubscriptionStatusTrialing

		if isActive && !user.Subscriber {
			user.Subscriber = true
			if wasSuspended, err := dao.CheckForSuspendedStories(context.Background(), user.Email); err == nil && wasSuspended {
				needsRestore = true
				user.NotifyRestored = true
			} else if err != nil {
				// validation/state still not ACKed yet, so we can error out
				RespondWithError(w, http.StatusInternalServerError, err.Error())
				return
			}
		} else if !isActive && user.Subscriber {
			user.Subscriber = false
			user.NotifyExpired = true

			// suspend others (async fan-out OK)
			stories, err := dao.GetAllStories(context.Background(), user.Email)
			if err != nil && err != sql.ErrNoRows {
				RespondWithError(w, http.StatusInternalServerError, err.Error())
				return
			}
			for idx, s := range stories {
				if idx > 0 {
					go dao.SoftDeleteStory(context.Background(), user.Email, s.ID, true)
				}
			}
		}

		if err := dao.UpdateUser(context.Background(), *user); err != nil {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}

	default:
		// Not a type we care about: ACK and return
		RespondWithJson(w, http.StatusOK, nil)
		return
	}
	RespondWithJson(w, http.StatusOK, nil)

	if needsRestore {
		go func(email string) {
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
			defer cancel()

			events, err := dao.RestoreAutomaticallyDeletedStories(ctx, email)
			if err != nil {
				log.Printf("restore start failed for %s: %v", email, err)
				return
			}
			for ev := range events {
				if ev.Err == nil {
					if story, err := dao.GetStoryByID(context.Background(), email, ev.StoryID); err == nil {
						story.Inactive = false
						if _, e2 := dao.EditStory(context.Background(), email, *story); e2 != nil {
							log.Printf("post-restore EditStory failed %s: %v", ev.StoryID, e2)
						}
					} else {
						log.Printf("GetStoryByID failed %s: %v", ev.StoryID, err)
					}
					log.Printf("restored %s (%d/%d)", ev.StoryID, ev.Index, ev.Total)
				} else {
					log.Printf("restore error %s (%d/%d): %v", ev.StoryID, ev.Index, ev.Total, ev.Err)
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
		RespondWithError(w, http.StatusInternalServerError, err.Error())
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
	if err != nil && err != sql.ErrNoRows {
		RespondWithError(w, http.StatusInternalServerError, "unable to load subscription")
		return
	}

	custID, err := ensureCustomerFn(user, sub)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "unable to ensure Stripe customer: "+err.Error())
		return
	}

	// Check if there's an existing incomplete subscription for this customer
	var s *stripe.Subscription
	if sub != nil && sub.SubscriptionID != "" {
		log.Printf("[SubscribeCustomer] Checking existing subscription %s for %s", sub.SubscriptionID, email)
		existingSub, err := subscription.Get(sub.SubscriptionID, nil)
		if err == nil && existingSub.Status == stripe.SubscriptionStatusIncomplete {
			log.Printf("[SubscribeCustomer] Reusing existing incomplete subscription %s for %s", sub.SubscriptionID, email)
			// Reuse the existing incomplete subscription
			s = existingSub
		} else if err != nil {
			log.Printf("[SubscribeCustomer] Could not fetch existing subscription %s: %v", sub.SubscriptionID, err)
		}
	}

	// If no incomplete subscription found, create a new one
	if s == nil {
		log.Printf("[SubscribeCustomer] Creating new subscription for %s", email)
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
			http.Error(w, err.Error(), 500)
			return
		}
		log.Printf("[SubscribeCustomer] Created new subscription %s for %s", s.ID, email)
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
			http.Error(w, err.Error(), 500)
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
	RespondWithJson(w, http.StatusOK, createSubResp{
		SubscriptionID: s.ID,
		Status:         string(s.Status),
		ClientSecret:   inv.PaymentIntent.ClientSecret,
	})
}

func BillingSummaryEndpoint(w http.ResponseWriter, r *http.Request) {
	log.Println("billing portal summary")
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

	user, err := dao.GetUserDetails(r.Context(), email)
	if err != nil || user == nil {
		RespondWithError(w, http.StatusInternalServerError, "unable to load user")
		return
	}

	sub, err := dao.GetSubscription(r.Context(), email)
	if err != nil && err != sql.ErrNoRows {
		RespondWithError(w, http.StatusInternalServerError, "unable to load user")
		return
	}

	if _, err := ensureCustomerFn(user, sub); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "unable to ensure Stripe customer: "+err.Error())
		return
	}

	if sub != nil && sub.SubscriptionID != "" {
		log.Printf("[BillingSummary] Fetching subscription %s from Stripe API for %s", sub.SubscriptionID, email)
		stripeSub, err := subscription.Get(sub.SubscriptionID, nil)
		if err != nil {
			log.Printf("[BillingSummary] Failed to get subscription from Stripe for %s: %v", email, err)
			RespondWithError(w, http.StatusInternalServerError, "unable to retrieve subscription from stripe")
			return
		}
		log.Printf("[BillingSummary] Retrieved subscription %s for %s - Status: %s, Customer: %s", stripeSub.ID, email, stripeSub.Status, stripeSub.Customer.ID)

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
		log.Printf("[BillingSummary] Returning subscription status: %s, CancelAtPeriodEnd: %v", stripeSub.Status, stripeSub.CancelAtPeriodEnd)
		RespondWithJson(w, http.StatusOK, map[string]any{
			"id":                stripeSub.ID,
			"status":            stripeSub.Status,
			"currentPeriodEnd":  cpe,
			"cancelAtPeriodEnd": stripeSub.CancelAtPeriodEnd,
		})
		return
	}

	// no subscriptions found
	RespondWithJson(w, http.StatusOK, map[string]any{
		"status": "none",
	})
}

func BillingPortalSessionEndpoint(w http.ResponseWriter, r *http.Request) {
	log.Println("in billing portal endpoint")
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
	user, err := dao.GetUserDetails(r.Context(), email)
	if err != nil || user == nil {
		RespondWithError(w, http.StatusInternalServerError, "unable to load user")
		return
	}

	sub, err := dao.GetSubscription(r.Context(), email)
	if err != nil && err != sql.ErrNoRows {
		RespondWithError(w, http.StatusInternalServerError, "unable to load user")
		return
	}

	// 4) Ensure Stripe customer exists / get ID
	custID, err := ensureCustomerFn(user, sub)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "unable to ensure Stripe customer: "+err.Error())
		return
	}

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

	if sub != nil {
		var zeroTime time.Time
		sub.LastSubCheck = zeroTime
		err = dao.UpdateSubscription(r.Context(), *sub)
		if err != nil {
			RespondWithError(w, http.StatusInternalServerError, "error updating subscription: "+err.Error())
			return
		}
	}

	// 7) Respond with the redirect URL
	RespondWithJson(w, http.StatusOK, map[string]string{"url": sess.URL})
}
