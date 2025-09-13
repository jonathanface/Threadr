package billing

type createSubResp struct {
	SubscriptionID string `json:"subscription_id"`
	ClientSecret   string `json:"client_secret"`
	Status         string `json:"status"`
}

// type stripeRouteSpec struct {

// }

type stripeRouteSpec struct {
	// customers
	ExistingCustomerID string
	CreateCustomerID   string
	CreateShouldError  bool

	// subscriptions list/create
	ListSubStatus            string // if non-empty, list returns one subscription with this status
	ListSubCurrentPeriodEnd  int64  // unix seconds; 0 => omit
	ListSubCancelAtPeriodEnd bool   // include flag

	CreateSubID          string
	CreateSubShouldError bool
	// if true, the created subscription will have no latest_invoice.payment_intent (to hit 424 path)
	CreateSubNoPI bool

	// billing portal session
	PortalURL         string
	PortalShouldError bool

	// 	// For GET /v1/subscriptions/{id}
	GetSubID                string
	GetSubStatus            string
	GetSubCurrentPeriodEnd  int64
	GetSubCancelAtPeriodEnd bool
	GetSubCustomerID        string
}
