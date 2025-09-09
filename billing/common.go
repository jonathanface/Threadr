package billing

import (
	"RichDocter/models"
	"RichDocter/sessions"
	"encoding/json"
	"errors"
	"net/http"

	stripe "github.com/stripe/stripe-go/v79"
	"github.com/stripe/stripe-go/v79/customer"
)

func ensureCustomer(u *models.UserInfo, s *models.Subscription) string {
	if u == nil {
		panic("empty user passed to ensureCustomer")
	}
	if s != nil && s.CustomerID != "" {
		return s.CustomerID
	}
	// 1) try to find by email
	lp := &stripe.CustomerListParams{
		Email: stripe.String(u.Email),
	}
	lp.Limit = stripe.Int64(1) // set embedded ListParams.Limit here

	it := customer.List(lp)
	if it.Next() {
		return it.Customer().ID
	}

	// 2) otherwise create
	c, err := customer.New(&stripe.CustomerParams{
		Email: stripe.String(u.Email),
	})
	if err != nil {
		// handle/log error appropriately
		panic(err)
	}
	return c.ID
}

func RespondWithError(w http.ResponseWriter, code int, msg string) {
	RespondWithJson(w, code, map[string]string{"error": msg})
}

func RespondWithJson(w http.ResponseWriter, code int, payload interface{}) {
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
	token, err := sessions.Get(r, "token")
	if err != nil || token.IsNew {
		return "", errors.New("unable to retrieve token")
	}
	user := models.UserInfo{}
	if err = json.Unmarshal(token.Values["token_data"].([]byte), &user); err != nil {
		return "", err
	}
	return user.Email, nil
}
