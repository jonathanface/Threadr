package auth

import (
	"Threadr/models"
)

type OauthOptions struct {
	Mode         models.AppMode
	FrontEndURL  string
	GoogleId     string
	GoogleSecret string
	GoogleUrl    string
	AmazonId     string
	AmazonSecret string
	AmazonUrl    string
}
