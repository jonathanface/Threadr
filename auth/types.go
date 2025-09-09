package auth

import (
	"RichDocter/models"
)

type Options struct {
	Mode         models.AppMode
	FrontEndURL  string
	GoogleId     string
	GoogleSecret string
	GoogleUrl    string
	AmazonId     string
	AmazonSecret string
	AmazonUrl    string
	MsnId        string
	MsnSecret    string
	MsnUrl       string
}
