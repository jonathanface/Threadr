package daos

import (
	"errors"
	"html"
	"strings"
	"time"

	"Threadr/logger"
	"Threadr/models"

	stripe "github.com/stripe/stripe-go/v79"
	"github.com/stripe/stripe-go/v79/promotioncode"
)

// htmlEscape is a thin alias for the stdlib so call sites read clearly.
func htmlEscape(s string) string { return html.EscapeString(s) }

// buildWelcomeHTMLBody renders the multipart/alternative HTML body of the
// welcome email. The upsell heading and the promo code are bolded; the
// subscribe URL becomes a clickable link. Other prose mirrors the plain
// text body so the two stay in sync semantically.
func buildWelcomeHTMLBody(promoCode string, promoExpiresAt int64, subscribeURL string) string {
	var b strings.Builder
	const bodyStyle = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI'," +
		"Roboto,sans-serif;line-height:1.5;color:#222;max-width:600px;" +
		"margin:0 auto;padding:24px;"
	b.WriteString(`<!doctype html><html><body style="`)
	b.WriteString(bodyStyle)
	b.WriteString(`">`)
	b.WriteString(`<p>Welcome to Threadr!</p>`)
	b.WriteString(`<p>Thank you for signing up. We're excited to help you ` +
		`organize your story and keep track of all your characters, places, ` +
		`and events.</p>`)
	b.WriteString(`<p><strong>Getting Started:</strong></p><ol>`)
	b.WriteString(`<li>Create your first story or series</li>`)
	b.WriteString(`<li>Add chapters and start writing</li>`)
	b.WriteString(`<li>Highlight text to create references to characters, places, and events</li>`)
	b.WriteString(`<li>Click any reference to view its details without losing your place</li>`)
	b.WriteString(`</ol>`)
	b.WriteString(`<p>Visit Threadr: <a href="https://threadr.net">https://threadr.net</a></p>`)
	b.WriteString(`<hr>`)
	b.WriteString(WelcomeBenefitsHTML())
	if promoCode != "" {
		expiry := time.Unix(promoExpiresAt, 0).UTC().Format("January 2, 2006")
		b.WriteString(`<p>First month on us: use promo code <strong>`)
		b.WriteString(htmlEscape(promoCode))
		b.WriteString(`</strong> at checkout. This code is for you only and expires on `)
		b.WriteString(htmlEscape(expiry))
		b.WriteString(`.</p>`)
	}
	b.WriteString(`<p><a href="`)
	b.WriteString(htmlEscape(subscribeURL))
	b.WriteString(`">Subscribe</a></p>`)
	b.WriteString(`<hr>`)
	b.WriteString(`<p>Need help? Have questions or feedback? Email us at ` +
		`<a href="mailto:support@threadr.net">support@threadr.net</a> ` +
		`— we'd love to hear from you!</p>`)
	b.WriteString(`<p>Happy writing!<br>The Threadr Team</p>`)
	b.WriteString(`</body></html>`)
	return b.String()
}

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

// WelcomeBenefitsHTML is the HTML-rendered counterpart of WelcomeBenefitsCopy,
// used as the multipart/alternative HTML body of the welcome email. The
// heading is wrapped in <strong>, the bullets become a <ul>. Content is
// escaped so future benefit copy can't inject markup.
func WelcomeBenefitsHTML() string {
	var b strings.Builder
	b.WriteString("<p><strong>Why upgrade to Threadr Premium?</strong></p><ul>")
	for _, benefit := range models.SubscriberBenefits {
		b.WriteString("<li><strong>")
		b.WriteString(htmlEscape(benefit.Title))
		b.WriteString("</strong> — ")
		b.WriteString(htmlEscape(benefit.Description))
		b.WriteString("</li>")
	}
	b.WriteString("</ul>")
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
