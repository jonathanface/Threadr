package main

import (
	"RichDocter/auth"
	"RichDocter/daos"
	"RichDocter/models"
	"context"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"log"
	"os"

	"net/http"
	_ "net/http/pprof"
	"strings"

	"github.com/joho/godotenv"
)

const (
	DEFAULT_MAX_RETRIES              = 3
	DEFAULT_AWS_BLOCK_WRITE_CAPACITY = 10
	DEFAULT_AWS_REGION               = "us-east-1"
	DEFAULT_DYNAMO_WRITE_BATCH_SIZE  = 50
	DEFAULT_VERSION                  = "dev"
	DEFAULT_PORT                     = "8080"
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
	port := getenv("PORT", DEFAULT_PORT)
	addr := normalizeAddr(port)
	version := getenv("VERSION", DEFAULT_VERSION)

	initCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	daoOptions := daos.Options{
		Region:                     getenv("AWS_REGION", DEFAULT_AWS_REGION),
		MaxRetries:                 atoiDefault(os.Getenv("AWS_MAX_RETRIES"), DEFAULT_MAX_RETRIES),
		BlockTableMinWriteCapacity: atoiDefault(os.Getenv("AWS_BLOCKTABLE_MIN_WRITE_CAPACITY"), DEFAULT_AWS_BLOCK_WRITE_CAPACITY),
		WriteBatchSize:             atoiDefault(os.Getenv("DYNAMO_WRITE_BATCH_SIZE"), DEFAULT_DYNAMO_WRITE_BATCH_SIZE),
	}
	dao, err := daos.NewDAO(initCtx, daoOptions)
	if err != nil {
		log.Fatalf("Unable to initialize DAO: %v", err)
	}

	authOptions := auth.Options{
		GoogleId:     getenv("GOOGLE_OAUTH_CLIENT_ID", ""),
		GoogleSecret: getenv("GOOGLE_OAUTH_CLIENT_SECRET", ""),
		GoogleUrl:    getenv("GOOGLE_OAUTH_REDIRECT_URL", ""),
		AmazonId:     getenv("AMAZON_OAUTH_CLIENT_ID", ""),
		AmazonSecret: getenv("AMAZON_OAUTH_CLIENT_SECRET", ""),
		AmazonUrl:    getenv("AMAZON_OAUTH_REDIRECT_URL", ""),
		MsnId:        getenv("MSN_OAUTH_CLIENT_ID", ""),
		MsnSecret:    getenv("MSN_OAUTH_CLIENT_SECRET", ""),
		MsnUrl:       getenv("MSN_OAUTH_REDIRECT_URL", ""),
		FrontEndURL:  getenv("FRONTEND_URL", ""),
	}

	auth.New(authOptions)

	rtr := setupRouter(mode, dao, authOptions)
	srv := &http.Server{
		Addr:              addr,
		Handler:           rtr,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	log.Printf("RichDocter %s listening on %s (mode=%s)", version, addr, mode)
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

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("graceful shutdown error: %v", err)
	}
	log.Println("server stopped")
}
