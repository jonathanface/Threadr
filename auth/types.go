package auth

import (
	"Threadr/models"
)

type OauthOptions struct {
	Mode         models.AppMode
	FrontEndURL  string
	GoogleID     string
	GoogleSecret string
	GoogleURL    string
	AmazonID     string
	AmazonSecret string
	AmazonURL    string
}
