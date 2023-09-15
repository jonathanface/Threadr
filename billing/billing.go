package billing

import (
	"RichDocter/api"
	"RichDocter/models"
	"RichDocter/sessions"
	"encoding/json"
	"net/http"

	stripe "github.com/stripe/stripe-go/v72"
	"github.com/stripe/stripe-go/v72/customer"
	"github.com/stripe/stripe-go/v72/setupintent"
	"github.com/stripe/stripe-go/v72/sub"
)

type StripeCustomer struct {
	Email string    `json:"email"`
	Id    string    `json:"id"`
	Cards []*string `json:"secret"`
}

func CreateCardEndpoint(w http.ResponseWriter, r *http.Request) {

	decoder := json.NewDecoder(r.Body)
	customer := StripeCustomer{}
	if err := decoder.Decode(&customer); err != nil {
		api.RespondWithError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	secret, err := setupNewCard(customer.Id)
	if err != nil {
		api.RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	customer.Cards = append(customer.Cards, secret)
	api.RespondWithJson(w, http.StatusOK, customer)
}

func CreateCustomerEndpoint(w http.ResponseWriter, r *http.Request) {
	token, err := sessions.Get(r, "token")
	if err != nil || token.IsNew {
		api.RespondWithError(w, http.StatusNotFound, "cannot find token")
		return
	}
	var user models.UserInfo
	if err := json.Unmarshal(token.Values["token_data"].([]byte), &user); err != nil {
		api.RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	customerID, err := createCustomer(user.Email)
	if err != nil {
		api.RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	var customer = StripeCustomer{
		Email: user.Email,
		Id:    *customerID,
	}
	api.RespondWithJson(w, http.StatusOK, customer)
}

func createCustomer(email string) (*string, error) {
	params := &stripe.CustomerParams{
		Email: &email,
	}
	c, err := customer.New(params)
	if err != nil {
		return nil, err
	}

	return &c.ID, nil
}

func setupNewCard(customerID string) (secret *string, err error) {
	params := &stripe.SetupIntentParams{
		PaymentMethodTypes: []*string{
			stripe.String("card"),
		},
		Customer: &customerID,
	}
	si, err := setupintent.New(params)
	if err != nil {
		return nil, err
	}

	return &si.ClientSecret, nil
}

func createSubscription(customerID, priceID, paymentMethodID string, trialEnd int64) (*string, error) {
	subscriptionParams := &stripe.SubscriptionParams{
		Customer: &customerID,
		Items: []*stripe.SubscriptionItemsParams{
			{
				Plan: &priceID,
			},
		},
		TrialEnd:             &trialEnd,
		DefaultPaymentMethod: &paymentMethodID,
	}
	sb, err := sub.New(subscriptionParams)
	if err != nil {
		return nil, err
	}
	return &sb.ID, nil
}

func cancelSubscription(subscriptionID string) error {
	cancel := true
	subscriptionParams := &stripe.SubscriptionParams{
		CancelAtPeriodEnd: &cancel,
	}

	_, err := sub.Update(subscriptionID, subscriptionParams)
	if err != nil {
		return err
	}

	return nil
}
