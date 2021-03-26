package API

import (
	"encoding/json"
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

type ReadAssociation struct {
	ID      primitive.ObjectID `json:"id" bson:"_id"`
	Text    string             `json:"text" bson:"text"`
	Type    int                `json:"type" bson:"type"`
	NovelID int                `json:"novelID" bson:"novelID"`
}

type WriteAssociation struct {
	Text    string `json:"text" bson:"text"`
	Type    int    `json:"type" bson:"type"`
	NovelID int    `json:"novelID" bson:"novelID"`
}

type WriteAssociationDescription struct {
	ID          primitive.ObjectID `json:"id" bson:"_id"`
	Description string             `json:"text" bson:"text"`
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
