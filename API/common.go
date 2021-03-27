package API

import (
	"encoding/json"
	"errors"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"net/http"
)

const (
	HTTP_PORT        = ":85"
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

type AssociationDetails struct {
	ID          primitive.ObjectID `json:"id,omitempty" bson:"_id,omitempty"`
	Description string             `json:"description" bson:"text"`
}

type Association struct {
	ID      primitive.ObjectID `json:"id,omitempty" bson:"_id,omitempty"`
	Text    string             `json:"text" bson:"text"`
	Type    int                `json:"type" bson:"type"`
	NovelID int                `json:"novelID" bson:"novelID"`
	Details AssociationDetails `json:"details,omitempty"`
}

type Page struct {
	Page    int             `json:"page" bson:"page"`
	Body    json.RawMessage `json:"body" bson:"body"`
	NovelID int             `json:"novelID" bson:"novelID"`
}

func respondWithError(w http.ResponseWriter, code int, msg string) {
	respondWithJson(w, code, map[string]string{"error": msg})
}

func respondWithJson(w http.ResponseWriter, code int, payload interface{}) {
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
