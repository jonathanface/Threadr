package billing

import (
	"RichDocter/api"
	"RichDocter/daos"
	"RichDocter/models"
	"RichDocter/sessions"
	"encoding/json"
	"fmt"
	"net/http"
	"os"

	stripe "github.com/stripe/stripe-go/v72"
	"github.com/stripe/stripe-go/v72/customer"
	"github.com/stripe/stripe-go/v72/paymentmethod"
	"github.com/stripe/stripe-go/v72/setupintent"
)

func GetCustomerEndpoint(w http.ResponseWriter, r *http.Request) {
	stripe.Key = os.Getenv("STRIPE_SECRET")
	if stripe.Key == "" {
		api.RespondWithError(w, http.StatusNoContent, "missing stripe secret")
		return
	}
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

	var (
		dao daos.DaoInterface
		ok  bool
	)
	if dao, ok = r.Context().Value("dao").(daos.DaoInterface); !ok {
		api.RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}
	var userWithDetails *models.UserInfo
	if userWithDetails, err = dao.GetUserDetails(user.Email); err != nil {
		api.RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	c, err := customer.Get(userWithDetails.CustomerID, nil)
	if err != nil {
		api.RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	api.RespondWithJson(w, http.StatusOK, c)
}

func CreateCardIntentEndpoint(w http.ResponseWriter, r *http.Request) {
	stripe.Key = os.Getenv("STRIPE_SECRET")
	if stripe.Key == "" {
		api.RespondWithError(w, http.StatusNoContent, "missing stripe secret")
		return
	}
	decoder := json.NewDecoder(r.Body)
	customer := models.StripeCustomer{}
	if err := decoder.Decode(&customer); err != nil {
		api.RespondWithError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}
	secret, err := createCardIntent(customer.Id)
	if err != nil {
		api.RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	customer.Cards = append(customer.Cards, secret)
	api.RespondWithJson(w, http.StatusOK, customer)
}

func createCardIntent(customerID string) (secret *string, err error) {
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

func CreateCustomerEndpoint(w http.ResponseWriter, r *http.Request) {
	stripe.Key = os.Getenv("STRIPE_SECRET")
	if stripe.Key == "" {
		api.RespondWithError(w, http.StatusNoContent, "missing stripe secret")
		return
	}

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
	var (
		dao daos.DaoInterface
		ok  bool
	)
	if dao, ok = r.Context().Value("dao").(daos.DaoInterface); !ok {
		api.RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	var userWithDetails *models.UserInfo
	if userWithDetails, err = dao.GetUserDetails(user.Email); err != nil {
		api.RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	var customerID string
	if userWithDetails.CustomerID != "" {
		customerID = userWithDetails.CustomerID
	} else {
		customerID, err = createCustomer(user.Email)
		if err != nil {
			api.RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
		err = dao.AddCustomerID(&user.Email, &customerID)
		if err != nil {
			api.RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}

	sources, err := getPaymentMethodsForCustomer(customerID)
	if err != nil {
		api.RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	customer := models.StripeCustomer{
		Email:          user.Email,
		Id:             customerID,
		PaymentMethods: sources,
	}
	api.RespondWithJson(w, http.StatusOK, customer)
}

func getPaymentMethodsForCustomer(customerID string) ([]models.PaymentMethod, error) {
	stripe.Key = os.Getenv("STRIPE_SECRET")
	if stripe.Key == "" {
		return nil, fmt.Errorf("missing stripe secret")
	}

	c, err := customer.Get(customerID, nil)
	if err != nil {
		return nil, err
	}
	fmt.Println("getting payments for", customerID)
	var defaultPaymentMethodID *string
	if c.InvoiceSettings.DefaultPaymentMethod != nil {
		defaultPaymentMethodID = &c.InvoiceSettings.DefaultPaymentMethod.ID
	}
	listParams := &stripe.PaymentMethodListParams{
		Customer: stripe.String(customerID),
		Type:     stripe.String("card"), // Filter to retrieve only card payment methods
	}

	// List payment methods associated with the customer
	iter := paymentmethod.List(listParams)

	var methods []models.PaymentMethod
	for iter.Next() {
		pm := iter.PaymentMethod()
		localPM := models.PaymentMethod{}
		localPM.Id = pm.ID
		localPM.Brand = pm.Card.Brand
		localPM.LastFour = pm.Card.Last4
		localPM.ExpirationMonth = pm.Card.ExpMonth
		localPM.ExpirationYear = pm.Card.ExpYear
		if defaultPaymentMethodID != nil && *defaultPaymentMethodID == pm.ID {
			localPM.IsDefault = true
		}
		methods = append(methods, localPM)
	}
	return methods, nil
}

func UpdateCustomerPaymentMethodEndpoint(w http.ResponseWriter, r *http.Request) {
	stripe.Key = os.Getenv("STRIPE_SECRET")
	if stripe.Key == "" {
		api.RespondWithError(w, http.StatusNoContent, "missing stripe secret")
		return
	}
	var requestBody map[string]string
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(&requestBody); err != nil {
		api.RespondWithError(w, http.StatusBadRequest, "missing or invalid payment id or customer id")
		return
	}
	paymentMethodID := requestBody["payment_method_id"]
	customerID := requestBody["customer_id"]

	// Retrieve the list of payment methods for the customer
	listParams := &stripe.PaymentMethodListParams{
		Customer: stripe.String(customerID),
		Type:     stripe.String("card"), // Filter to retrieve only card payment methods
	}

	pmList := paymentmethod.List(listParams)

	// Check if the payment method is already attached to the customer
	attached := false

	for pmList.Next() {
		pm := pmList.PaymentMethod()
		if pm.ID == paymentMethodID {
			attached = true
			break
		}
	}

	if err := pmList.Err(); err != nil {
		fmt.Println("Error listing payment methods:", err)
		api.RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if !attached {
		// Payment method is not attached to the specified customer, so attach it
		attachParams := &stripe.PaymentMethodAttachParams{
			Customer: stripe.String(customerID),
		}
		_, err := paymentmethod.Attach(paymentMethodID, attachParams)
		if err != nil {
			fmt.Println("Error attaching payment method:", err)
			api.RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}

	params := &stripe.CustomerParams{
		InvoiceSettings: &stripe.CustomerInvoiceSettingsParams{
			DefaultPaymentMethod: stripe.String(paymentMethodID),
		},
	}
	_, err := customer.Update(customerID, params)
	if err != nil {
		fmt.Println("Error updating customer:", err)
		api.RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	api.RespondWithJson(w, http.StatusOK, nil)
}

func createCustomer(email string) (string, error) {
	params := &stripe.CustomerParams{
		Email: &email,
		//DefaultSource: "",
	}
	c, err := customer.New(params)
	if err != nil {
		return "", err
	}

	return c.ID, nil
}
