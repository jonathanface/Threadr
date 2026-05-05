package main

import (
	"context"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"Threadr/auth"
	"Threadr/daos"
	"Threadr/logger"
	"Threadr/models"
	"Threadr/sessions"

	"log"
	"os"

	"net/http"
	_ "net/http/pprof"
	"strings"

	"github.com/joho/godotenv"
	stripe "github.com/stripe/stripe-go/v79"
)

const (
	defaultMaxRetries            = 3
	defaultAWSBlockWriteCapacity = 10
	defaultAWSRegion             = "us-east-1"
	defaultDynamoWriteBatchSize  = 50
	defaultVersion               = "dev"
	defaultPort                  = "8080"
	// serverLifecycleTimeout caps DAO init at startup and graceful HTTP
	// shutdown — both have to finish promptly or we abandon the operation.
	serverLifecycleTimeout = 10 * time.Second
)

func normalizeAddr(p string) string {
	if p == "" {
		p = "8080"
	}
	if p[0] != ':' {
		return ":" + p
	}
	return p
}

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
func atoiDefault(s string, def int) int {
	if s == "" {
		return def
	}
	if n, err := strconv.Atoi(s); err == nil {
		return n
	}
	return def
}

func main() {
	mode := models.AppMode(strings.ToLower(os.Getenv("MODE")))
	if mode != models.ModeProduction && mode != models.ModeStaging {
		if err := godotenv.Load(); err != nil {
			log.Println("warning: .env not loaded:", err)
		}
	}
	port := getenv("PORT", defaultPort)
	addr := normalizeAddr(port)
	version := getenv("VERSION", defaultVersion)
	stripe.Key = getenv("STRIPE_SECRET", "")

	// Initialize and validate session store
	if err := sessions.Initialize(); err != nil {
		log.Fatalf("Failed to initialize sessions: %v", err)
	}
	sessions.StartTokenCleanup()

	initCtx, cancel := context.WithTimeout(context.Background(), serverLifecycleTimeout)
	defer cancel()

	awsRegion := getenv("AWS_REGION", defaultAWSRegion)
	logger.Info("Initializing DAO", "region", awsRegion)
	daoOptions := daos.Options{
		Region:                     awsRegion,
		MaxRetries:                 defaultMaxRetries,
		BlockTableMinWriteCapacity: defaultAWSBlockWriteCapacity,
		WriteBatchSize:             defaultDynamoWriteBatchSize,
	}
	dao, err := daos.NewDAO(initCtx, daoOptions)
	if err != nil {
		log.Fatalf("Unable to initialize DAO: %v", err)
	}
	logger.Info("DAO initialized successfully")

	// Determine OAuth redirect URLs based on USE_NGROK flag
	useNgrok := strings.ToLower(getenv("USE_NGROK", "false")) == "true"
	googleUrl := getenv("GOOGLE_OAUTH_REDIRECT_URL", "")
	amazonUrl := getenv("AMAZON_OAUTH_REDIRECT_URL", "")

	if useNgrok {
		if ngrokGoogle := getenv("GOOGLE_OAUTH_REDIRECT_URL_NGROK", ""); ngrokGoogle != "" {
			googleUrl = ngrokGoogle
		}
		if ngrokAmazon := getenv("AMAZON_OAUTH_REDIRECT_URL_NGROK", ""); ngrokAmazon != "" {
			amazonUrl = ngrokAmazon
		}
	}

	authOptions := auth.OauthOptions{
		Mode:         mode,
		GoogleId:     getenv("GOOGLE_OAUTH_CLIENT_ID", ""),
		GoogleSecret: getenv("GOOGLE_OAUTH_CLIENT_SECRET", ""),
		GoogleUrl:    googleUrl,
		AmazonId:     getenv("AMAZON_OAUTH_CLIENT_ID", ""),
		AmazonSecret: getenv("AMAZON_OAUTH_CLIENT_SECRET", ""),
		AmazonUrl:    amazonUrl,
		FrontEndURL:  getenv("FRONTEND_URL", ""),
	}

	auth.New(authOptions)

	// Check if maintenance mode is enabled
	maintenanceMode := strings.ToLower(getenv("MAINTENANCE_MODE", "false")) == "true"
	if maintenanceMode {
		logger.Warn("MAINTENANCE MODE ENABLED - Site will show maintenance page to all users")
	}

	rtr := setupRouter(mode, dao, authOptions, maintenanceMode)
	srv := &http.Server{
		Addr:              addr,
		Handler:           rtr,
		ReadHeaderTimeout: 5 * time.Second,  //nolint:mnd
		ReadTimeout:       15 * time.Second, //nolint:mnd
		WriteTimeout:      30 * time.Second, //nolint:mnd
		IdleTimeout:       60 * time.Second, //nolint:mnd
	}

	log.Printf("Threadr %s listening on %s (mode=%s)", version, addr, mode)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Start server
	errCh := make(chan error, 1)
	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errCh <- err
		}
	}()

	select {
	case <-ctx.Done():
		// graceful shutdown
	case err := <-errCh:
		log.Printf("server error: %v", err)
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), serverLifecycleTimeout)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("graceful shutdown error: %v", err)
	}
	log.Println("server stopped")
}
