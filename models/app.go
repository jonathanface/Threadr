package models

type AppMode string

const (
	ModeProduction  AppMode = "production"
	ModeStaging     AppMode = "staging"
	ModeDevelopment AppMode = "development"
)
