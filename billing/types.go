package billing

type createSubResp struct {
	SubscriptionID string `json:"subscription_id"`
	ClientSecret   string `json:"client_secret"`
	Status         string `json:"status"`
}
