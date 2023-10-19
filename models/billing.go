package models

import (
	"time"

	"github.com/stripe/stripe-go/v72"
)

type PaymentMethod struct {
	Id              string                        `json:"id"`
	Brand           stripe.PaymentMethodCardBrand `json:"brand"`
	LastFour        string                        `json:"last_four"`
	ExpirationMonth uint64                        `json:"expiration_month"`
	ExpirationYear  uint64                        `json:"expiration_year"`
	IsDefault       bool                          `json:"is_default"`
}

type StripeCustomer struct {
	Email          string          `json:"email"`
	Id             string          `json:"id"`
	Cards          []*string       `json:"secret"`
	PaymentMethods []PaymentMethod `json:"payment_methods"`
}

type Product struct {
	ProductID        string `json:"product_id"`
	PriceID          string `json:"price_id"`
	Name             string `json:"name"`
	Description      string `json:"description"`
	BillingAmount    string `json:"billing_amount"`
	BillingFrequency string `json:"billing_frequency"`
}

type SubscriptionResults struct {
	SubscriptionID string    `json:"subscription_id"`
	PeriodStart    time.Time `json:"period_start"`
	PeriodEnd      time.Time `json:"period_end"`
}
