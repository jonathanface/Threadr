package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestNewRateLimiter(t *testing.T) {
	rl := newRateLimiter()
	if rl == nil {
		t.Fatal("Expected non-nil rate limiter")
	}
	if rl.requests == nil {
		t.Fatal("Expected initialized requests map")
	}
}

func TestRateLimiterAllow(t *testing.T) {
	rl := newRateLimiter()

	// First request should be allowed
	if !rl.allow("192.168.1.1") {
		t.Error("First request should be allowed")
	}

	// Multiple requests within limit should be allowed
	for i := 0; i < 50; i++ {
		if !rl.allow("192.168.1.1") {
			t.Errorf("Request %d should be allowed", i+2)
		}
	}

	// Check that requests are tracked
	if len(rl.requests["192.168.1.1"]) != 51 {
		t.Errorf("Expected 51 tracked requests, got %d", len(rl.requests["192.168.1.1"]))
	}
}

func TestRateLimiterExceedsLimit(t *testing.T) {
	rl := newRateLimiter()
	ip := "192.168.1.2"

	// Fill up the rate limit
	for i := 0; i < maxRequestsPerMinute; i++ {
		if !rl.allow(ip) {
			t.Fatalf("Request %d should be allowed", i+1)
		}
	}

	// Next request should be denied
	if rl.allow(ip) {
		t.Error("Request exceeding limit should be denied")
	}
}

func TestRateLimiterMultipleIPs(t *testing.T) {
	rl := newRateLimiter()

	// Different IPs should have independent limits
	ip1 := "192.168.1.3"
	ip2 := "192.168.1.4"

	// Fill limit for first IP
	for i := 0; i < maxRequestsPerMinute; i++ {
		if !rl.allow(ip1) {
			t.Fatalf("Request %d for IP1 should be allowed", i+1)
		}
	}

	// Second IP should still be allowed
	if !rl.allow(ip2) {
		t.Error("Request from different IP should be allowed")
	}

	// First IP should be blocked
	if rl.allow(ip1) {
		t.Error("Request from rate-limited IP should be denied")
	}
}

func TestRateLimiterWindowExpiry(t *testing.T) {
	// This test would require manipulating time or waiting,
	// so we just verify the logic works with old timestamps
	rl := newRateLimiter()
	ip := "192.168.1.5"

	// Add some old timestamps manually
	oldTime := time.Now().Add(-2 * rateLimitWindow)
	rl.mu.Lock()
	rl.requests[ip] = []time.Time{oldTime, oldTime, oldTime}
	rl.mu.Unlock()

	// New request should be allowed since old ones expired
	if !rl.allow(ip) {
		t.Error("Request should be allowed after old requests expired")
	}

	// Should only have 1 request now (old ones cleaned up)
	rl.mu.RLock()
	count := len(rl.requests[ip])
	rl.mu.RUnlock()
	if count != 1 {
		t.Errorf("Expected 1 request after cleanup, got %d", count)
	}
}

func TestGetClientIP(t *testing.T) {
	testCases := []struct {
		name           string
		remoteAddr     string
		xForwardedFor  string
		xRealIP        string
		expectedIP     string
	}{
		{
			name:       "RemoteAddr only",
			remoteAddr: "192.168.1.100:8080",
			expectedIP: "192.168.1.100:8080",
		},
		{
			name:           "X-Forwarded-For single IP",
			remoteAddr:     "10.0.0.1:8080",
			xForwardedFor:  "203.0.113.1",
			expectedIP:     "203.0.113.1",
		},
		{
			name:           "X-Forwarded-For multiple IPs uses rightmost (ALB-added)",
			remoteAddr:     "10.0.0.1:8080",
			xForwardedFor:  "203.0.113.1, 70.41.3.18, 150.172.238.178",
			expectedIP:     "150.172.238.178",
		},
		{
			name:       "X-Real-IP ignored (falls back to RemoteAddr)",
			remoteAddr: "10.0.0.1:8080",
			xRealIP:    "203.0.113.2",
			expectedIP: "10.0.0.1:8080",
		},
		{
			name:           "X-Forwarded-For used even when X-Real-IP present",
			remoteAddr:     "10.0.0.1:8080",
			xForwardedFor:  "203.0.113.1",
			xRealIP:        "203.0.113.2",
			expectedIP:     "203.0.113.1",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/test", nil)
			req.RemoteAddr = tc.remoteAddr
			if tc.xForwardedFor != "" {
				req.Header.Set("X-Forwarded-For", tc.xForwardedFor)
			}
			if tc.xRealIP != "" {
				req.Header.Set("X-Real-IP", tc.xRealIP)
			}

			ip := getClientIP(req)
			if ip != tc.expectedIP {
				t.Errorf("Expected IP %s, got %s", tc.expectedIP, ip)
			}
		})
	}
}

func TestRateLimitMiddleware(t *testing.T) {
	limiter := newRateLimiter()
	middleware := rateLimitMiddleware(limiter)

	// Handler that should be called if rate limit passes
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	wrappedHandler := middleware(handler)

	t.Run("allows requests within limit", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/test", nil)
		req.RemoteAddr = "192.168.1.10:8080"
		w := httptest.NewRecorder()

		wrappedHandler.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("Expected status 200, got %d", w.Code)
		}
		if w.Body.String() != "OK" {
			t.Errorf("Expected body 'OK', got %s", w.Body.String())
		}
	})

	t.Run("blocks requests exceeding limit", func(t *testing.T) {
		// Fill up the rate limit with the same address format that getClientIP returns
		ip := "192.168.1.11:8080"
		for i := 0; i < maxRequestsPerMinute; i++ {
			limiter.allow(ip)
		}

		req := httptest.NewRequest("GET", "/api/test", nil)
		req.RemoteAddr = ip
		w := httptest.NewRecorder()

		wrappedHandler.ServeHTTP(w, req)

		if w.Code != http.StatusTooManyRequests {
			t.Errorf("Expected status 429, got %d", w.Code)
		}
	})

	t.Run("allows health check without rate limiting", func(t *testing.T) {
		// Fill up rate limit for this IP
		ip := "192.168.1.12:8080"
		for i := 0; i < maxRequestsPerMinute; i++ {
			limiter.allow(ip)
		}

		// Health check should still work
		req := httptest.NewRequest("GET", "/health", nil)
		req.RemoteAddr = ip
		w := httptest.NewRecorder()

		wrappedHandler.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("Health check should bypass rate limit, expected 200, got %d", w.Code)
		}
	})
}

func TestRateLimiterCleanup(t *testing.T) {
	rl := newRateLimiter()

	// Add some entries with old timestamps
	oldTime := time.Now().Add(-10 * time.Minute)
	rl.mu.Lock()
	rl.requests["old-ip"] = []time.Time{oldTime, oldTime}
	rl.requests["recent-ip"] = []time.Time{time.Now()}
	rl.mu.Unlock()

	// Manually trigger cleanup logic
	cutoff := time.Now().Add(-rateLimitWindow)
	rl.mu.Lock()
	for ip, timestamps := range rl.requests {
		if len(timestamps) == 0 || timestamps[len(timestamps)-1].Before(cutoff) {
			delete(rl.requests, ip)
		}
	}
	rl.mu.Unlock()

	// Old IP should be cleaned up
	rl.mu.RLock()
	_, oldExists := rl.requests["old-ip"]
	_, recentExists := rl.requests["recent-ip"]
	rl.mu.RUnlock()

	if oldExists {
		t.Error("Old IP should have been cleaned up")
	}
	if !recentExists {
		t.Error("Recent IP should still exist")
	}
}

func BenchmarkRateLimiterAllow(b *testing.B) {
	rl := newRateLimiter()
	ip := "192.168.1.100"

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		rl.allow(ip)
	}
}

func BenchmarkRateLimiterMultipleIPs(b *testing.B) {
	rl := newRateLimiter()
	ips := []string{
		"192.168.1.1",
		"192.168.1.2",
		"192.168.1.3",
		"192.168.1.4",
		"192.168.1.5",
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		ip := ips[i%len(ips)]
		rl.allow(ip)
	}
}
