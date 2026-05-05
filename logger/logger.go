package logger

import (
	"context"
	"log/slog"
	"os"
)

var log *slog.Logger

func init() {
	// Default to JSON handler for production, can be configured via env
	var handler slog.Handler
	logLevel := os.Getenv("LOG_LEVEL")

	level := slog.LevelInfo
	switch logLevel {
	case "DEBUG":
		level = slog.LevelDebug
	case "WARN":
		level = slog.LevelWarn
	case "ERROR":
		level = slog.LevelError
	}

	opts := &slog.HandlerOptions{
		Level: level,
	}

	// Use JSON handler for structured logging
	handler = slog.NewJSONHandler(os.Stdout, opts)

	log = slog.New(handler)
}

// Debug logs a debug message with optional key-value pairs.
func Debug(msg string, args ...any) {
	log.Debug(msg, args...)
}

// Info logs an info message with optional key-value pairs.
func Info(msg string, args ...any) {
	log.Info(msg, args...)
}

// Warn logs a warning message with optional key-value pairs.
func Warn(msg string, args ...any) {
	log.Warn(msg, args...)
}

// Error logs an error message with optional key-value pairs.
func Error(msg string, args ...any) {
	log.Error(msg, args...)
}

// DebugContext logs a debug message with context.
func DebugContext(ctx context.Context, msg string, args ...any) {
	log.DebugContext(ctx, msg, args...)
}

// InfoContext logs an info message with context.
func InfoContext(ctx context.Context, msg string, args ...any) {
	log.InfoContext(ctx, msg, args...)
}

// WarnContext logs a warning message with context.
func WarnContext(ctx context.Context, msg string, args ...any) {
	log.WarnContext(ctx, msg, args...)
}

// ErrorContext logs an error message with context.
func ErrorContext(ctx context.Context, msg string, args ...any) {
	log.ErrorContext(ctx, msg, args...)
}

// With returns a new logger with the given attributes.
func With(args ...any) *slog.Logger {
	return log.With(args...)
}
