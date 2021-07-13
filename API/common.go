package API

import (
	"encoding/json"
	"errors"
	"github.com/dgrijalva/jwt-go"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"net/http"
	"time"
)

const (
	SOCKET_DIR       = "/ws"
	USERS_COLLECTION = "users"
)

var dbClient *mongo.Client

type Story struct {
	ID           primitive.ObjectID `json:"id,omitempty" bson:"_id,omitempty"`
	Title        string             `bson:"title" json:"title"`
	LastAccessed time.Time          `bson:"lastAccessed" json:"lastAccessed"`
	User         primitive.ObjectID `json:"user,omitempty" bson:"user,omitempty"`
}

type AssociationDetails struct {
	ID            primitive.ObjectID `json:"id,omitempty" bson:"_id,omitempty"`
	Description   string             `json:"description" bson:"description,omitempty"`
	Aliases       string             `json:"aliases" bson:"aliases,omitempty"`
	CaseSensitive bool               `json:"caseSensitive" bson:"caseSensitive,omitempty"`
}

type Association struct {
	ID      primitive.ObjectID `json:"id,omitempty" bson:"_id,omitempty"`
	Name    string             `json:"name" bson:"name"`
	Type    int                `json:"type" bson:"type"`
	StoryID primitive.ObjectID `json:"storyID" bson:"storyID"`
	Details AssociationDetails `json:"details" bson:"omitempty"`
}

type Block struct {
	Key      string             `json:"key" bson:"key"`
	Body     json.RawMessage    `json:"body" bson:"body"`
	Entities json.RawMessage    `json:"entities" bson:"entities"`
	StoryID  primitive.ObjectID `json:"storyID" bson:"storyID,omitempty"`
	Order    int                `json:"order" bson:"order,omitempty"`
}

type BlockOrder struct {
	Order   map[string]int     `json:"order" bson:"order"`
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

func SetDB(client *mongo.Client) {
	dbClient = client
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
