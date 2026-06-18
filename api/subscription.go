package api

import (
	"net/http"

	ctxkey "Threadr/ctxkeys"
	"Threadr/models"
)

// RequireSubscriber gates a handler on the request user's subscription
// status. It looks up ctxkey.Subscriber from the request context and:
//
//   - returns true when the user is a subscriber and the caller should
//     continue normally;
//   - writes a 500 and returns false when the subscriber key is missing or
//     malformed (auth middleware should have set it);
//   - writes a 402 Payment Required with a benefit-keyed message and
//     returns false when the user is authenticated but not a subscriber.
//
// The `benefit` argument should be one of the models.Benefit* IDs so error
// messages and metrics stay in sync with models.SubscriberBenefits.
func RequireSubscriber(w http.ResponseWriter, r *http.Request, benefit string) bool {
	isSubscriber, ok := r.Context().Value(ctxkey.Subscriber).(bool)
	if !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve subscriber key from context")
		return false
	}
	if !isSubscriber {
		RespondWithError(w, http.StatusPaymentRequired, benefit+" requires a Threadr subscription")
		return false
	}
	return true
}

// FilterSuspendedAssociations returns the non-suspended entries of in.
// Non-subscriber read paths (the thumbnail GET and the cap check on writes)
// call this so a user who lapsed sees exactly cap-many associations per
// story while the rest stay safely on disk awaiting resubscribe.
func FilterSuspendedAssociations(in []*models.SimplifiedAssociation) []*models.SimplifiedAssociation {
	out := make([]*models.SimplifiedAssociation, 0, len(in))
	for _, a := range in {
		if a != nil && a.SuspendedAt == 0 {
			out = append(out, a)
		}
	}
	return out
}
