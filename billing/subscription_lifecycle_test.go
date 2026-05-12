package billing

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"Threadr/daos"
	"Threadr/models"

	stripe "github.com/stripe/stripe-go/v79"
)

// ----------------------------------------------------------------------
// applySubscriptionTransition
// ----------------------------------------------------------------------

func TestApplySubscriptionTransition(t *testing.T) {
	ctx := context.Background()

	t.Run("active and not yet subscriber: promotes user, no restore needed", func(t *testing.T) {
		dao := daos.NewMockDAO()
		dao.MockCheckForSuspendedStories = func(_ string) (bool, error) { return false, nil }
		user := &models.UserInfo{Email: "a@x.com", Subscriber: false}

		needsRestore, err := applySubscriptionTransition(ctx, dao, user, true)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !user.Subscriber {
			t.Errorf("Subscriber: got false, want true")
		}
		if user.NotifyRestored {
			t.Errorf("NotifyRestored: should remain false when there are no suspended stories")
		}
		if needsRestore {
			t.Errorf("needsRestore: got true, want false")
		}
	})

	t.Run("active and not subscriber with suspended stories: flags NotifyRestored and asks for restore", func(t *testing.T) {
		dao := daos.NewMockDAO()
		dao.MockCheckForSuspendedStories = func(_ string) (bool, error) { return true, nil }
		user := &models.UserInfo{Email: "a@x.com", Subscriber: false}

		needsRestore, err := applySubscriptionTransition(ctx, dao, user, true)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !user.Subscriber {
			t.Errorf("Subscriber: got false, want true")
		}
		if !user.NotifyRestored {
			t.Errorf("NotifyRestored: want true when stories were previously suspended")
		}
		if !needsRestore {
			t.Errorf("needsRestore: want true so the caller can launch the restore goroutine")
		}
	})

	t.Run("inactive and currently subscriber: demotes user and suspends stories", func(t *testing.T) {
		dao := daos.NewMockDAO()
		dao.MockGetAllStories = func(_ string) ([]*models.Story, error) {
			return []*models.Story{
				{ID: "keep"},
				{ID: "suspend-1"},
				{ID: "suspend-2"},
			}, nil
		}
		var (
			mu          sync.Mutex
			softDeletes []string
		)
		dao.MockSoftDeleteStory = func(_, storyID string, _ bool) error {
			mu.Lock()
			softDeletes = append(softDeletes, storyID)
			mu.Unlock()
			return nil
		}
		user := &models.UserInfo{Email: "a@x.com", Subscriber: true}

		needsRestore, err := applySubscriptionTransition(ctx, dao, user, false)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if user.Subscriber {
			t.Errorf("Subscriber: want false after demotion")
		}
		if !user.NotifyExpired {
			t.Errorf("NotifyExpired: want true after demotion")
		}
		if needsRestore {
			t.Errorf("needsRestore: should be false on demotion")
		}

		// SoftDeleteStory runs in goroutines launched by suspendUserStories.
		// Wait briefly for them to commit.
		deadline := time.Now().Add(time.Second)
		for time.Now().Before(deadline) {
			mu.Lock()
			done := len(softDeletes) == 2
			mu.Unlock()
			if done {
				break
			}
			time.Sleep(5 * time.Millisecond)
		}
		mu.Lock()
		defer mu.Unlock()
		if len(softDeletes) != 2 {
			t.Fatalf("expected 2 stories to be suspended, got %d", len(softDeletes))
		}
		for _, id := range softDeletes {
			if id == "keep" {
				t.Errorf("the first story should be retained, not suspended")
			}
		}
	})

	t.Run("active and already subscriber: no-op", func(t *testing.T) {
		dao := daos.NewMockDAO()
		dao.MockCheckForSuspendedStories = func(_ string) (bool, error) {
			t.Fatalf("CheckForSuspendedStories should not be called for a no-op transition")
			return false, nil
		}
		user := &models.UserInfo{Email: "a@x.com", Subscriber: true}

		needsRestore, err := applySubscriptionTransition(ctx, dao, user, true)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !user.Subscriber {
			t.Errorf("Subscriber should remain true")
		}
		if needsRestore {
			t.Errorf("needsRestore should be false on no-op")
		}
	})

	t.Run("inactive and not subscriber: no-op", func(t *testing.T) {
		dao := daos.NewMockDAO()
		dao.MockGetAllStories = func(_ string) ([]*models.Story, error) {
			t.Fatalf("suspendUserStories should not be called for a no-op transition")
			return nil, nil
		}
		user := &models.UserInfo{Email: "a@x.com", Subscriber: false}

		needsRestore, err := applySubscriptionTransition(ctx, dao, user, false)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if user.Subscriber {
			t.Errorf("Subscriber should remain false")
		}
		if needsRestore {
			t.Errorf("needsRestore should be false on no-op")
		}
	})

	t.Run("CheckForSuspendedStories error is propagated", func(t *testing.T) {
		dao := daos.NewMockDAO()
		want := errors.New("dynamo on fire")
		dao.MockCheckForSuspendedStories = func(_ string) (bool, error) { return false, want }
		user := &models.UserInfo{Email: "a@x.com", Subscriber: false}

		_, err := applySubscriptionTransition(ctx, dao, user, true)
		if !errors.Is(err, want) {
			t.Fatalf("got %v, want %v", err, want)
		}
	})

	t.Run("GetAllStories error during suspend is propagated", func(t *testing.T) {
		dao := daos.NewMockDAO()
		want := errors.New("scan blew up")
		dao.MockGetAllStories = func(_ string) ([]*models.Story, error) { return nil, want }
		user := &models.UserInfo{Email: "a@x.com", Subscriber: true}

		_, err := applySubscriptionTransition(ctx, dao, user, false)
		if !errors.Is(err, want) {
			t.Fatalf("got %v, want %v", err, want)
		}
	})
}

// ----------------------------------------------------------------------
// suspendUserStories
// ----------------------------------------------------------------------

func TestSuspendUserStories(t *testing.T) {
	t.Run("no stories: nothing to do", func(t *testing.T) {
		dao := daos.NewMockDAO()
		dao.MockGetAllStories = func(_ string) ([]*models.Story, error) {
			return []*models.Story{}, nil
		}
		dao.MockSoftDeleteStory = func(_, _ string, _ bool) error {
			t.Fatalf("SoftDeleteStory should not be called when there are no stories")
			return nil
		}
		if err := suspendUserStories(context.Background(), dao, "a@x.com"); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("one story: kept, no soft-deletes", func(t *testing.T) {
		dao := daos.NewMockDAO()
		dao.MockGetAllStories = func(_ string) ([]*models.Story, error) {
			return []*models.Story{{ID: "solo"}}, nil
		}
		dao.MockSoftDeleteStory = func(_, _ string, _ bool) error {
			t.Fatalf("the user's first story should be retained")
			return nil
		}
		if err := suspendUserStories(context.Background(), dao, "a@x.com"); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("three stories: first kept, remaining two soft-deleted in background", func(t *testing.T) {
		dao := daos.NewMockDAO()
		dao.MockGetAllStories = func(_ string) ([]*models.Story, error) {
			return []*models.Story{
				{ID: "keep"},
				{ID: "drop-1"},
				{ID: "drop-2"},
			}, nil
		}
		var (
			mu      sync.Mutex
			deleted []string
		)
		dao.MockSoftDeleteStory = func(_, storyID string, includeBlocks bool) error {
			if !includeBlocks {
				t.Errorf("SoftDeleteStory should be called with includeBlocks=true (got false for %s)", storyID)
			}
			mu.Lock()
			deleted = append(deleted, storyID)
			mu.Unlock()
			return nil
		}

		if err := suspendUserStories(context.Background(), dao, "a@x.com"); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		deadline := time.Now().Add(time.Second)
		for time.Now().Before(deadline) {
			mu.Lock()
			done := len(deleted) == 2
			mu.Unlock()
			if done {
				break
			}
			time.Sleep(5 * time.Millisecond)
		}
		mu.Lock()
		defer mu.Unlock()
		if len(deleted) != 2 {
			t.Fatalf("expected 2 background soft-deletes, got %d (%v)", len(deleted), deleted)
		}
		for _, id := range deleted {
			if id == "keep" {
				t.Errorf("the first story should never be soft-deleted")
			}
		}
	})

	t.Run("GetAllStories error is propagated", func(t *testing.T) {
		dao := daos.NewMockDAO()
		want := errors.New("scan failed")
		dao.MockGetAllStories = func(_ string) ([]*models.Story, error) { return nil, want }
		err := suspendUserStories(context.Background(), dao, "a@x.com")
		if !errors.Is(err, want) {
			t.Fatalf("got %v, want %v", err, want)
		}
	})
}

// ----------------------------------------------------------------------
// safeReturnURL
// ----------------------------------------------------------------------

func TestSafeReturnURL(t *testing.T) {
	type tc struct {
		name      string
		returnURL string
		host      string
		tls       bool
		xfProto   string
		want      string
	}

	cases := []tc{
		{
			name: "empty returnURL falls back to default http",
			host: "threadr.test",
			want: "http://threadr.test/account/subscription",
		},
		{
			name: "empty returnURL with TLS request uses https",
			host: "threadr.test",
			tls:  true,
			want: "https://threadr.test/account/subscription",
		},
		{
			name:    "empty returnURL with X-Forwarded-Proto=https uses https",
			host:    "threadr.test",
			xfProto: "https",
			want:    "https://threadr.test/account/subscription",
		},
		{
			name:      "relative path is prefixed with the request scheme + host",
			host:      "threadr.test",
			tls:       true,
			returnURL: "/stories/abc",
			want:      "https://threadr.test/stories/abc",
		},
		{
			name:      "protocol-relative URL is rejected",
			host:      "threadr.test",
			returnURL: "//evil.com/path",
			want:      "http://threadr.test/account/subscription",
		},
		{
			name:      "same-host absolute URL is returned as-is",
			host:      "threadr.test",
			returnURL: "https://threadr.test/path",
			want:      "https://threadr.test/path",
		},
		{
			name:      "mismatched host is rejected",
			host:      "threadr.test",
			returnURL: "https://evil.com/path",
			want:      "http://threadr.test/account/subscription",
		},
		{
			name:      "javascript: scheme is rejected",
			host:      "threadr.test",
			returnURL: "javascript:alert(1)",
			want:      "http://threadr.test/account/subscription",
		},
		{
			name:      "ftp: scheme is rejected",
			host:      "threadr.test",
			returnURL: "ftp://threadr.test/file",
			want:      "http://threadr.test/account/subscription",
		},
		{
			name:      "host comparison is case-insensitive",
			host:      "Threadr.Test",
			tls:       true,
			returnURL: "https://threadr.test/path",
			want:      "https://threadr.test/path",
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "http://"+c.host+"/", nil)
			req.Host = c.host
			if c.tls {
				req.TLS = &tls.ConnectionState{}
			}
			if c.xfProto != "" {
				req.Header.Set("X-Forwarded-Proto", c.xfProto)
			}

			got := safeReturnURL(c.returnURL, req)
			if got != c.want {
				t.Fatalf("got %q, want %q", got, c.want)
			}
		})
	}
}

// ----------------------------------------------------------------------
// restoreSuspendedStoriesAsync — driven by a channel of restore events.
// ----------------------------------------------------------------------

func TestRestoreSuspendedStoriesAsync(t *testing.T) {
	t.Run("RestoreAutomaticallyDeletedStories error returns early without panic", func(t *testing.T) {
		dao := daos.NewMockDAO()
		dao.MockRestoreAutomaticallyDeletedStories = func(_ string) (<-chan daos.RestoreStoryEvent, error) {
			return nil, errors.New("kickoff failed")
		}
		dao.MockGetStoryByID = func(_, _ string) (*models.Story, error) {
			t.Fatalf("GetStoryByID should not be called when kickoff fails")
			return nil, nil
		}
		restoreSuspendedStoriesAsync(dao, "a@x.com") // should not panic
	})

	t.Run("happy path: clears Inactive on each successful event", func(t *testing.T) {
		ch := make(chan daos.RestoreStoryEvent, 3)
		ch <- daos.RestoreStoryEvent{StoryID: "s1", Index: 1, Total: 2}
		ch <- daos.RestoreStoryEvent{StoryID: "s2", Index: 2, Total: 2}
		close(ch)

		dao := daos.NewMockDAO()
		dao.MockRestoreAutomaticallyDeletedStories = func(_ string) (<-chan daos.RestoreStoryEvent, error) {
			return ch, nil
		}
		dao.MockGetStoryByID = func(_, storyID string) (*models.Story, error) {
			return &models.Story{ID: storyID, Inactive: true}, nil
		}
		var (
			mu      sync.Mutex
			edits   []models.Story
		)
		dao.MockEditStory = func(_ string, s models.Story) (models.Story, error) {
			mu.Lock()
			edits = append(edits, s)
			mu.Unlock()
			return s, nil
		}

		restoreSuspendedStoriesAsync(dao, "a@x.com")

		if len(edits) != 2 {
			t.Fatalf("EditStory call count: got %d, want 2", len(edits))
		}
		for _, s := range edits {
			if s.Inactive {
				t.Errorf("story %s was edited with Inactive=true; want false", s.ID)
			}
		}
	})

	t.Run("events that arrive with errors are skipped without calling GetStoryByID", func(t *testing.T) {
		ch := make(chan daos.RestoreStoryEvent, 2)
		ch <- daos.RestoreStoryEvent{StoryID: "s1", Err: errors.New("per-story failure")}
		ch <- daos.RestoreStoryEvent{StoryID: "s2"} // ok
		close(ch)

		dao := daos.NewMockDAO()
		dao.MockRestoreAutomaticallyDeletedStories = func(_ string) (<-chan daos.RestoreStoryEvent, error) {
			return ch, nil
		}
		var (
			mu       sync.Mutex
			fetched  []string
		)
		dao.MockGetStoryByID = func(_, storyID string) (*models.Story, error) {
			mu.Lock()
			fetched = append(fetched, storyID)
			mu.Unlock()
			return &models.Story{ID: storyID, Inactive: true}, nil
		}
		dao.MockEditStory = func(_ string, s models.Story) (models.Story, error) {
			return s, nil
		}

		restoreSuspendedStoriesAsync(dao, "a@x.com")

		if len(fetched) != 1 || fetched[0] != "s2" {
			t.Fatalf("GetStoryByID should only be called for the ok event; got %v", fetched)
		}
	})

	t.Run("GetStoryByID error: that event is skipped, others still processed", func(t *testing.T) {
		ch := make(chan daos.RestoreStoryEvent, 2)
		ch <- daos.RestoreStoryEvent{StoryID: "bad"}
		ch <- daos.RestoreStoryEvent{StoryID: "good"}
		close(ch)

		dao := daos.NewMockDAO()
		dao.MockRestoreAutomaticallyDeletedStories = func(_ string) (<-chan daos.RestoreStoryEvent, error) {
			return ch, nil
		}
		dao.MockGetStoryByID = func(_, storyID string) (*models.Story, error) {
			if storyID == "bad" {
				return nil, errors.New("not found")
			}
			return &models.Story{ID: storyID, Inactive: true}, nil
		}
		var edits []string
		dao.MockEditStory = func(_ string, s models.Story) (models.Story, error) {
			edits = append(edits, s.ID)
			return s, nil
		}

		restoreSuspendedStoriesAsync(dao, "a@x.com")

		if len(edits) != 1 || edits[0] != "good" {
			t.Fatalf("EditStory should only be called for the good event; got %v", edits)
		}
	})
}

// ----------------------------------------------------------------------
// handleSubscriptionEvent — covers the orchestration paths that hit the
// DAO and depend on subscription status.
// ----------------------------------------------------------------------

func newSubEvent(t *testing.T, eventType, subID, custID, status string, periodEnd int64) stripe.Event {
	t.Helper()
	sub := struct {
		ID               string `json:"id"`
		CustomerID       string `json:"customer"`
		Status           string `json:"status"`
		CurrentPeriodEnd int64  `json:"current_period_end"`
	}{
		ID:               subID,
		CustomerID:       custID,
		Status:           status,
		CurrentPeriodEnd: periodEnd,
	}
	raw, err := json.Marshal(sub)
	if err != nil {
		t.Fatalf("marshal sub: %v", err)
	}
	return stripe.Event{Type: stripe.EventType(eventType), Data: &stripe.EventData{Raw: raw}}
}

func TestHandleSubscriptionEvent(t *testing.T) {
	t.Run("invalid event JSON returns 400", func(t *testing.T) {
		dao := daos.NewMockDAO()
		w := httptest.NewRecorder()
		ev := stripe.Event{Type: "customer.subscription.updated", Data: &stripe.EventData{Raw: []byte("{not json")}}

		_, _, ok := handleSubscriptionEvent(w, dao, ev)
		if ok {
			t.Errorf("ok: want false")
		}
		if w.Code != http.StatusBadRequest {
			t.Errorf("status: got %d, want 400", w.Code)
		}
	})

	t.Run("unknown customer returns 400", func(t *testing.T) {
		dao := daos.NewMockDAO()
		dao.MockGetEmailByCustomerID = func(_ string) (string, error) { return "", nil }
		w := httptest.NewRecorder()
		ev := newSubEvent(t, "customer.subscription.updated", "sub_1", "cus_1", "active", time.Now().Unix())

		_, _, ok := handleSubscriptionEvent(w, dao, ev)
		if ok {
			t.Errorf("ok: want false")
		}
		if w.Code != http.StatusBadRequest {
			t.Errorf("status: got %d, want 400", w.Code)
		}
		if !strings.Contains(w.Body.String(), "unknown customer") {
			t.Errorf("body: want %q, got %q", "unknown customer", w.Body.String())
		}
	})

	t.Run("GetEmailByCustomerID error returns 400 (treated as unknown customer)", func(t *testing.T) {
		dao := daos.NewMockDAO()
		dao.MockGetEmailByCustomerID = func(_ string) (string, error) {
			return "", errors.New("dynamo lookup failed")
		}
		w := httptest.NewRecorder()
		ev := newSubEvent(t, "customer.subscription.updated", "sub_1", "cus_1", "active", time.Now().Unix())

		_, _, ok := handleSubscriptionEvent(w, dao, ev)
		if ok {
			t.Errorf("ok: want false")
		}
		if w.Code != http.StatusBadRequest {
			t.Errorf("status: got %d, want 400", w.Code)
		}
		if !strings.Contains(w.Body.String(), "unknown customer") {
			t.Errorf("body: want %q, got %q", "unknown customer", w.Body.String())
		}
	})

	t.Run("GetUserDetails error returns 500", func(t *testing.T) {
		dao := daos.NewMockDAO()
		dao.MockGetEmailByCustomerID = func(_ string) (string, error) { return "a@x.com", nil }
		dao.MockUpdateSubscription = func(_ models.Subscription) error { return nil }
		dao.MockGetUserDetails = func(_ string) (*models.UserInfo, error) {
			return nil, errors.New("dynamo read failed")
		}
		w := httptest.NewRecorder()
		ev := newSubEvent(t, "customer.subscription.updated", "sub_1", "cus_1", "active", time.Now().Unix())

		_, _, ok := handleSubscriptionEvent(w, dao, ev)
		if ok {
			t.Errorf("ok: want false")
		}
		if w.Code != http.StatusInternalServerError {
			t.Errorf("status: got %d, want 500", w.Code)
		}
	})

	t.Run("applySubscriptionTransition error returns 500", func(t *testing.T) {
		// Trigger a transition into the active branch where
		// CheckForSuspendedStories runs and fails — that propagates back up
		// through applySubscriptionTransition into handleSubscriptionEvent.
		dao := daos.NewMockDAO()
		dao.MockGetEmailByCustomerID = func(_ string) (string, error) { return "a@x.com", nil }
		dao.MockUpdateSubscription = func(_ models.Subscription) error { return nil }
		dao.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
			return &models.UserInfo{Email: email, Subscriber: false}, nil
		}
		dao.MockCheckForSuspendedStories = func(_ string) (bool, error) {
			return false, errors.New("scan failed")
		}
		w := httptest.NewRecorder()
		ev := newSubEvent(t, "customer.subscription.updated", "sub_1", "cus_1", "active", time.Now().Unix())

		_, _, ok := handleSubscriptionEvent(w, dao, ev)
		if ok {
			t.Errorf("ok: want false")
		}
		if w.Code != http.StatusInternalServerError {
			t.Errorf("status: got %d, want 500", w.Code)
		}
	})

	t.Run("UpdateUser error returns 500", func(t *testing.T) {
		dao := daos.NewMockDAO()
		dao.MockGetEmailByCustomerID = func(_ string) (string, error) { return "a@x.com", nil }
		dao.MockUpdateSubscription = func(_ models.Subscription) error { return nil }
		dao.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
			return &models.UserInfo{Email: email, Subscriber: true}, nil
		}
		// No-op transition (already subscriber + active) so apply* succeeds.
		dao.MockUpdateUser = func(_ models.UserInfo) error {
			return errors.New("dynamo write failed")
		}
		w := httptest.NewRecorder()
		ev := newSubEvent(t, "customer.subscription.updated", "sub_1", "cus_1", "active", time.Now().Unix())

		_, _, ok := handleSubscriptionEvent(w, dao, ev)
		if ok {
			t.Errorf("ok: want false")
		}
		if w.Code != http.StatusInternalServerError {
			t.Errorf("status: got %d, want 500", w.Code)
		}
	})

	t.Run("UpdateSubscription error returns 500", func(t *testing.T) {
		dao := daos.NewMockDAO()
		dao.MockGetEmailByCustomerID = func(_ string) (string, error) { return "a@x.com", nil }
		dao.MockUpdateSubscription = func(_ models.Subscription) error { return errors.New("dynamo down") }
		w := httptest.NewRecorder()
		ev := newSubEvent(t, "customer.subscription.updated", "sub_1", "cus_1", "active", time.Now().Unix())

		_, _, ok := handleSubscriptionEvent(w, dao, ev)
		if ok {
			t.Errorf("ok: want false")
		}
		if w.Code != http.StatusInternalServerError {
			t.Errorf("status: got %d, want 500", w.Code)
		}
	})

	t.Run("happy path: promotes user, persists sub, asks for restore when stories were suspended", func(t *testing.T) {
		dao := daos.NewMockDAO()
		dao.MockGetEmailByCustomerID = func(_ string) (string, error) { return "a@x.com", nil }

		var (
			savedSub  models.Subscription
			savedUser models.UserInfo
		)
		dao.MockUpdateSubscription = func(s models.Subscription) error { savedSub = s; return nil }
		dao.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
			return &models.UserInfo{Email: email, Subscriber: false}, nil
		}
		dao.MockCheckForSuspendedStories = func(_ string) (bool, error) { return true, nil }
		dao.MockUpdateUser = func(u models.UserInfo) error { savedUser = u; return nil }

		w := httptest.NewRecorder()
		periodEnd := time.Now().Add(30 * 24 * time.Hour).Unix()
		ev := newSubEvent(t, "customer.subscription.created", "sub_42", "cus_42", "active", periodEnd)

		email, needsRestore, ok := handleSubscriptionEvent(w, dao, ev)
		if !ok {
			t.Fatalf("ok: want true (body=%q)", w.Body.String())
		}
		if email != "a@x.com" {
			t.Errorf("email: got %q, want a@x.com", email)
		}
		if !needsRestore {
			t.Errorf("needsRestore: want true (user had suspended stories)")
		}
		if savedSub.SubscriptionID != "sub_42" || savedSub.CustomerID != "cus_42" {
			t.Errorf("subscription record: got %+v", savedSub)
		}
		if !savedUser.Subscriber {
			t.Errorf("user.Subscriber: want true after promotion")
		}
		if !savedUser.NotifyRestored {
			t.Errorf("user.NotifyRestored: want true")
		}
	})

	t.Run("inactive status demotes a previously-subscribed user and suspends stories", func(t *testing.T) {
		dao := daos.NewMockDAO()
		dao.MockGetEmailByCustomerID = func(_ string) (string, error) { return "a@x.com", nil }
		dao.MockUpdateSubscription = func(_ models.Subscription) error { return nil }
		dao.MockGetUserDetails = func(email string) (*models.UserInfo, error) {
			return &models.UserInfo{Email: email, Subscriber: true}, nil
		}
		dao.MockGetAllStories = func(_ string) ([]*models.Story, error) {
			return []*models.Story{{ID: "keep"}, {ID: "drop"}}, nil
		}
		var deletedCount int32
		dao.MockSoftDeleteStory = func(_, _ string, _ bool) error {
			atomic.AddInt32(&deletedCount, 1)
			return nil
		}
		var savedUser models.UserInfo
		dao.MockUpdateUser = func(u models.UserInfo) error { savedUser = u; return nil }

		w := httptest.NewRecorder()
		ev := newSubEvent(t, "customer.subscription.deleted", "sub_1", "cus_1", "canceled", 0)

		_, needsRestore, ok := handleSubscriptionEvent(w, dao, ev)
		if !ok {
			t.Fatalf("ok: want true (body=%q)", w.Body.String())
		}
		if needsRestore {
			t.Errorf("needsRestore: want false on demotion")
		}
		if savedUser.Subscriber {
			t.Errorf("user.Subscriber: want false after demotion")
		}
		if !savedUser.NotifyExpired {
			t.Errorf("user.NotifyExpired: want true")
		}

		// suspendUserStories fans soft-deletes out into goroutines.
		deadline := time.Now().Add(time.Second)
		for time.Now().Before(deadline) {
			if atomic.LoadInt32(&deletedCount) == 1 {
				break
			}
			time.Sleep(5 * time.Millisecond)
		}
		if got := atomic.LoadInt32(&deletedCount); got != 1 {
			t.Fatalf("soft-deletes: got %d, want 1", got)
		}
	})
}

