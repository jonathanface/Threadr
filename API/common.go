package API

import (
	"encoding/json"
	"errors"
	"github.com/dgrijalva/jwt-go"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"net/http"
	"time"
)

const (
	HTTP_PORT        = ":88"
	SOCKET_DIR       = "/ws"
	USERS_COLLECTION = "users"
)

type Config struct {
	DBHost string `json:"dbHost"`
	DBPort string `json:"dbPort"`
	DBUser string `json:"dbUser"`
	DBPass string `json:"dbPass"`
	DBName string `json:"dbName"`
}

type Story struct {
	ID           primitive.ObjectID `json:"id,omitempty" bson:"_id,omitempty"`
	Title        string             `bson:"title" json:"title"`
	LastAccessed time.Time          `bson:"lastAccessed" json:"lastAccessed"`
}

type AssociationDetails struct {
	ID            primitive.ObjectID `json:"id,omitempty" bson:"_id,omitempty"`
	Description   string             `json:"description" bson:"description,omitempty"`
	Aliases       string             `json:"aliases" bson:"aliases,omitempty"`
	CaseSensitive bool               `json:"caseSensitive" bson:"caseSensitive,omitempty"`
}

type Association struct {
	ID      primitive.ObjectID `json:"id,omitempty" bson:"_id,omitempty"`
	Text    string             `json:"text" bson:"text"`
	Type    int                `json:"type" bson:"type"`
	StoryID primitive.ObjectID `json:"storyID" bson:"storyID"`
	Details AssociationDetails `json:"details" bson:"omitempty"`
}

type Page struct {
	Page    int                `json:"page" bson:"page"`
	Body    json.RawMessage    `json:"body" bson:"body"`
	StoryID primitive.ObjectID `json:"storyID" bson:"storyID,omitempty"`
}

type GoogleClaims struct {
	ID            primitive.ObjectID `json:"id,omitempty" bson:"_id,omitempty"`
	Email         string             `json:"email"`
	EmailVerified bool               `json:"email_verified"`
	FirstName     string             `json:"given_name"`
	LastName      string             `json:"family_name"`
	jwt.StandardClaims
}

func RespondWithError(w http.ResponseWriter, code int, msg string) {
	RespondWithJson(w, code, map[string]string{"error": msg})
}

func RespondWithJson(w http.ResponseWriter, code int, payload interface{}) {
	response, _ := json.Marshal(payload)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	w.Write(response)
}

func validateBSON(bsonID string) (primitive.ObjectID, error) {
	mgoID, err := primitive.ObjectIDFromHex(bsonID)
	if err != nil {
		return primitive.NilObjectID, err
	}
	if mgoID.IsZero() || mgoID == primitive.NilObjectID {
		return mgoID, errors.New("Invalid bsonID")
	}
	return mgoID, nil
}
