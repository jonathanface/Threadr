package billing

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"strconv"

	"Threadr/api"
	"Threadr/models"

	stripe "github.com/stripe/stripe-go/v79"
	"github.com/stripe/stripe-go/v79/customer"
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
		w.Write([]byte(err.Error()))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	w.Write(response)
}

func getUserEmail(r *http.Request) (string, error) {
	// Use the common authentication helper that supports both Bearer tokens and cookies
	user, err := api.GetAuthenticatedUser(r)
	if err != nil {
		return "", err
	}
	return user.Email, nil
}
