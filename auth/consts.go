package auth

import "time"

const (
	verificationTokenExpiry = 24 * time.Hour
	resetTokenExpiry        = 1 * time.Hour
	minPasswordLength       = 8
	maxPasswordLength       = 72 // bcrypt limit
	// maxAuthRequestBody caps each email-auth request body. Email/password
	// payloads are tiny (<1KB), so 4096 is plenty without enabling abuse.
	maxAuthRequestBody = 4096
)
