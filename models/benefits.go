package models

// SubscriberBenefit describes one feature that distinguishes a paid Threadr
// subscription from the free tier. This package is the authoritative source
// for the subscriber/free split — handler gates, marketing copy, in-app
// alerts, and the welcome email should all reference these values.
type SubscriberBenefit struct {
	ID          string
	Title       string
	Description string
}

// Benefit IDs are stable strings used by:
//   - api.RequireSubscriber to format 402 error messages
//   - frontend code (when consumed via an API endpoint) to render the right
//     "subscribe to unlock X" prompt
//   - audit logs / metrics that want to slice by gated feature
const (
	BenefitAssociations     = "associations"
	BenefitExport           = "export"
	BenefitShare            = "share"
	BenefitPrioritySupport  = "priority_support"
)

// MaxFreeAssociationsPerStory is the per-story (or per-series) cap on
// associations for non-subscribers. Subscribers have no cap. This number is
// the source of truth — handler code should reference it instead of
// hard-coding 10.
const MaxFreeAssociationsPerStory = 10

// SubscriberBenefits is the ordered, authoritative list of features that
// require a subscription. Display surfaces (welcome email, /subscribe page,
// in-app prompts) should iterate this slice rather than hard-coding copy.
var SubscriberBenefits = []SubscriberBenefit{
	{
		ID:    BenefitAssociations,
		Title: "Unlimited associations",
		Description: "Track every character, setting, and event across your stories without limit. " +
			"Free accounts can create up to 10 associations per story or series.",
	},
	{
		ID:          BenefitExport,
		Title:       "Manuscript export",
		Description: "Export your finished work to PDF, DOCX, or EPUB whenever you want.",
	},
	{
		ID:          BenefitShare,
		Title:       "Share with readers",
		Description: "Send your story to early readers with a unique share link and collect their feedback in-app.",
	},
	{
		ID:          BenefitPrioritySupport,
		Title:       "Priority support",
		Description: "Get faster replies from the Threadr team when you email us at support@threadr.net.",
	},
}
