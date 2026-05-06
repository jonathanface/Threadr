package main

import (
	"net/http"
	"strings"
	"sync"
	"time"

	"Threadr/api"
	"Threadr/logger"
)

const (
	// Rate limit: 600 requests per minute per IP (10 req/sec).
	maxRequestsPerMinute = 600
	rateLimitWindow      = time.Minute
	cleanupInterval      = 5 * time.Minute
)

type rateLimiter struct {
	mu       sync.RWMutex
	requests map[string][]time.Time
}

func newRateLimiter() *rateLimiter {
	rl := &rateLimiter{
		requests: make(map[string][]time.Time),
	}
	// Start background cleanup goroutine
	go rl.cleanup()
	return rl
}

// cleanup removes old entries from the rate limiter map.
func (rl *rateLimiter) cleanup() {
	ticker := time.NewTicker(cleanupInterval)
	defer ticker.Stop()

	for range ticker.C {
		rl.mu.Lock()
		cutoff := time.Now().Add(-rateLimitWindow)
		for ip, timestamps := range rl.requests {
			// Remove IPs with no recent requests
			if len(timestamps) == 0 || timestamps[len(timestamps)-1].Before(cutoff) {
				delete(rl.requests, ip)
			}
		}
		rl.mu.Unlock()
	}
}

// allow checks if the request from this IP should be allowed.
func (rl *rateLimiter) allow(ip string) bool {
	now := time.Now()
	cutoff := now.Add(-rateLimitWindow)

	rl.mu.Lock()
	defer rl.mu.Unlock()

	// Get existing timestamps for this IP
	timestamps := rl.requests[ip]

	// Remove timestamps outside the window
	validTimestamps := make([]time.Time, 0, len(timestamps))
	for _, ts := range timestamps {
		if ts.After(cutoff) {
			validTimestamps = append(validTimestamps, ts)
		}
	}

	// Check if limit exceeded
	if len(validTimestamps) >= maxRequestsPerMinute {
		return false
	}

	// Add current timestamp
	validTimestamps = append(validTimestamps, now)
	rl.requests[ip] = validTimestamps

	return true
}

// getClientIP extracts the client IP from the request, considering proxies.
// For AWS ALB, we use the RIGHTMOST IP in X-Forwarded-For because:
//   - Clients can spoof the header by sending their own X-Forwarded-For
//   - ALB APPENDS the real client IP to the end of the header
//   - Format: "spoofed1, spoofed2, real-client-ip" (ALB adds the last one)
//
// We ignore X-Real-IP as it can be spoofed and ALB doesn't set it.
func getClientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		// Find the rightmost IP (added by ALB, not client-controllable)
		// Walk backwards to find the last comma, then take everything after it
		lastIP := xff
		for idx := len(xff) - 1; idx >= 0; idx-- {
			if xff[idx] == ',' {
				lastIP = xff[idx+1:]
				break
			}
		}
		// Trim any whitespace (X-Forwarded-For format is "ip1, ip2, ip3")
		return strings.TrimSpace(lastIP)
	}

	// Fall back to RemoteAddr (direct connection, no proxy)
	return r.RemoteAddr
}

// authRateLimiter enforces stricter per-endpoint rate limits for authentication endpoints.
type authRateLimiter struct {
	mu       sync.RWMutex
	requests map[string][]time.Time // key: "ip:path"
	limits   map[string]int         // path suffix -> max requests per window
	window   time.Duration
}

// Per-minute rate-limit budgets for sensitive auth endpoints. The lower
// figure (3) covers signup / password-reset *initiation*; the higher figure
// (5) covers retry-friendly actions like login and consuming a reset link.
const (
	authBudgetSensitive = 3
	authBudgetRetryable = 5
)

func newAuthRateLimiter() *authRateLimiter {
	arl := &authRateLimiter{
		requests: make(map[string][]time.Time),
		limits: map[string]int{
			"/email/login":          authBudgetRetryable,
			"/email/signup":         authBudgetSensitive,
			"/email/request-reset":  authBudgetSensitive,
			"/email/reset-password": authBudgetRetryable,
			"/email/link-oauth":     authBudgetRetryable,
		},
		window: time.Minute,
	}
	go arl.cleanup()
	return arl
}

func (arl *authRateLimiter) cleanup() {
	ticker := time.NewTicker(cleanupInterval)
	defer ticker.Stop()

	for range ticker.C {
		arl.mu.Lock()
		cutoff := time.Now().Add(-arl.window)
		for key, timestamps := range arl.requests {
			if len(timestamps) == 0 || timestamps[len(timestamps)-1].Before(cutoff) {
				delete(arl.requests, key)
			}
		}
		arl.mu.Unlock()
	}
}

func (arl *authRateLimiter) allow(ip, path string) bool {
	// Find the matching limit for this path
	limit := 0
	for suffix, l := range arl.limits {
		if strings.HasSuffix(path, suffix) {
			limit = l
			break
		}
	}
	if limit == 0 {
		return true // No specific limit for this path
	}

	now := time.Now()
	cutoff := now.Add(-arl.window)
	key := ip + ":" + path

	arl.mu.Lock()
	defer arl.mu.Unlock()

	timestamps := arl.requests[key]
	validTimestamps := make([]time.Time, 0, len(timestamps))
	for _, ts := range timestamps {
		if ts.After(cutoff) {
			validTimestamps = append(validTimestamps, ts)
		}
	}

	if len(validTimestamps) >= limit {
		return false
	}

	validTimestamps = append(validTimestamps, now)
	arl.requests[key] = validTimestamps
	return true
}

func authRateLimitMiddleware(limiter *authRateLimiter) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodOptions {
				next.ServeHTTP(w, r)
				return
			}

			ip := getClientIP(r)
			if !limiter.allow(ip, r.URL.Path) {
				logger.Warn("Auth rate limit exceeded",
					"ip", ip,
					"path", r.URL.Path,
					"method", r.Method)
				api.RespondWithError(w, http.StatusTooManyRequests, "too many attempts, please try again later")
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// rateLimitMiddleware returns a middleware that enforces rate limiting per IP.
func rateLimitMiddleware(limiter *rateLimiter) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Skip rate limiting for health checks (called frequently by load balancers)
			if r.URL.Path == "/health" {
				next.ServeHTTP(w, r)
				return
			}

			ip := getClientIP(r)

			if !limiter.allow(ip) {
				logger.Warn("Rate limit exceeded",
					"ip", ip,
					"path", r.URL.Path,
					"method", r.Method)
				api.RespondWithError(w, http.StatusTooManyRequests, "rate limit exceeded")
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
