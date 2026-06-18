package daos

import (
	"errors"
	"strings"
	"time"

	"Threadr/logger"
	"Threadr/models"

	stripe "github.com/stripe/stripe-go/v79"
	"github.com/stripe/stripe-go/v79/promotioncode"
)

// WelcomeBenefitsCopy renders the authoritative list in
// models.SubscriberBenefits as a plain-text upsell block suitable for the
// welcome email body. Edit models/benefits.go to change the pitch.
func WelcomeBenefitsCopy() string {
	var b strings.Builder
	b.WriteString("Why upgrade to Threadr Premium?\n")
	for _, benefit := range models.SubscriberBenefits {
		b.WriteString("\n- ")
		b.WriteString(benefit.Title)
		b.WriteString(" — ")
		b.WriteString(benefit.Description)
	}
	return b.String()
}

const (
	welcomeCouponID      = "welcome_first_month_free"
	welcomeCodeValidDays = 30
)

// CreateWelcomePromoCode mints a one-shot Stripe Promotion Code against the
// welcome_first_month_free coupon. The code is unique per signup, capped at
// one redemption, and expires 30 days after issue. The email is recorded in
// metadata for auditing; the code is NOT bound to a Stripe Customer because
// customers are created lazily on first subscribe attempt.
func CreateWelcomePromoCode(email string) (code string, expiresAt int64, err error) {
	if stripe.Key == "" {
		return "", 0, errors.New("stripe key not configured")
	}
	expiresAt = time.Now().AddDate(0, 0, welcomeCodeValidDays).Unix()
	params := &stripe.PromotionCodeParams{
		Coupon:         stripe.String(welcomeCouponID),
		MaxRedemptions: stripe.Int64(1),
		ExpiresAt:      stripe.Int64(expiresAt),
	}
	params.AddMetadata("issued_to", email)
	params.AddMetadata("purpose", "welcome")
	pc, pcErr := promotioncode.New(params)
	if pcErr != nil {
		logger.Error("Failed to create welcome promotion code",
			"email", email, "error", pcErr)
		return "", 0, pcErr
	}
	return pc.Code, expiresAt, nil
}
