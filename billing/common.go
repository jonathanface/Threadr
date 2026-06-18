package billing

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"strconv"
	"time"

	"Threadr/api"
	"Threadr/models"

	stripe "github.com/stripe/stripe-go/v79"
	"github.com/stripe/stripe-go/v79/customer"
	"github.com/stripe/stripe-go/v79/promotioncode"
)

func atoiDefault(s string, def int) int {
	if s == "" {
		return def
	}
	if n, err := strconv.Atoi(s); err == nil {
		return n
	}
	return def
}
func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

// resolvePromoCodeID looks up a customer-facing promo code string (e.g. the
// one we mint in daos.CreateWelcomePromoCode and include in the welcome
// email) and returns Stripe's internal PromotionCode ID (`promo_xxx`) for
// passing to subscription.New's Discounts field. Returns a user-facing error
// when the code doesn't exist, is inactive, or is past its expiry.
func resolvePromoCodeID(code string) (string, error) {
	if code == "" {
		return "", errors.New("promo code is required")
	}
	listParams := &stripe.PromotionCodeListParams{Code: stripe.String(code)}
	listParams.Limit = stripe.Int64(1)
	it := promotioncode.List(listParams)
	if !it.Next() {
		return "", errors.New("promo code not found")
	}
	pc := it.PromotionCode()
	if !pc.Active {
		return "", errors.New("promo code is no longer active")
	}
	if pc.ExpiresAt > 0 && pc.ExpiresAt < time.Now().Unix() {
		return "", errors.New("promo code has expired")
	}
	return pc.ID, nil
}

func ensureCustomer(u *models.UserInfo, s *models.Subscription) (string, error) {
	if u == nil {
		return "", errors.New("empty user passed to ensureCustomer")
	}
	if s != nil && s.CustomerID != "" {
		return s.CustomerID, nil
	}
	// 1) try to find by email
	lp := &stripe.CustomerListParams{
		Email: stripe.String(u.Email),
	}
	lp.Limit = stripe.Int64(1) // set embedded ListParams.Limit here

	it := customer.List(lp)
	if it.Next() {
		return it.Customer().ID, nil
	}

	// 2) otherwise create
	c, err := customer.New(&stripe.CustomerParams{
		Email: stripe.String(u.Email),
	})
	if err != nil {
		return "", err
	}
	return c.ID, nil
}

func RespondWithError(w http.ResponseWriter, code int, msg string) {
	RespondWithJSON(w, code, map[string]string{"error": msg})
}

func RespondWithJSON(w http.ResponseWriter, code int, payload any) {
	var (
		response []byte
		err      error
	)
	if response, err = json.Marshal(payload); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(err.Error()))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_, _ = w.Write(response)
}

func getUserEmail(r *http.Request) (string, error) {
	// Use the common authentication helper that supports both Bearer tokens and cookies
	user, err := api.GetAuthenticatedUser(r)
	if err != nil {
		return "", err
	}
	return user.Email, nil
}
