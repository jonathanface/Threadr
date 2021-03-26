package API

import (
	"context"
	"encoding/json"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"time"
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

var credentials = Config{}

func fetchAssociations(novelID int) ([]ReadAssociation, error) {
	client, ctx, err := mongoConnect()
	if err != nil {
		return nil, err
	}
	defer mongoDisconnect(client, ctx)
	assocs := client.Database("Drafty").Collection("Associations")
	filter := &bson.M{"novelID": novelID}
	cur, err := assocs.Find(context.TODO(), filter)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	var results []ReadAssociation
	for cur.Next(context.TODO()) {
		var a ReadAssociation
		err := cur.Decode(&a)
		if err != nil {
			return nil, err
		}
		results = append(results, a)
	}
	return results, nil
}

func mongoConnect() (*mongo.Client, context.Context, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	uri := "mongodb+srv://" + credentials.DBUser + ":" + credentials.DBPass + "@" + credentials.DBHost + "/" + credentials.DBName + "?w=majority"
	//log.Println(uri)
	client, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		return nil, nil, err
	}
	if err = client.Ping(ctx, nil); err != nil {
		return nil, nil, err
	}
	log.Println("Connected to MongoDB!")
	return client, ctx, nil
}
func mongoDisconnect(client *mongo.Client, ctx context.Context) error {
	if err := client.Disconnect(ctx); err != nil {
		return err
	}
	return nil
}

func getConfiguration() {
	jsonFile, err := os.Open("config.json")
	if err != nil {
		panic(err)
	}
	byteValue, _ := ioutil.ReadAll(jsonFile)
	json.Unmarshal(byteValue, &credentials)
	jsonFile.Close()
	log.Println("WTF")
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
func init() {
	getConfiguration()
}
