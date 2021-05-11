package common

import (
	"context"
	"encoding/json"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"io/ioutil"
	"log"
	"os"
	"time"
)

type Config struct {
	DBHost string `json:"dbHost"`
	DBPort string `json:"dbPort"`
	DBUser string `json:"dbUser"`
	DBPass string `json:"dbPass"`
	DBName string `json:"dbName"`
}

type SocketMessage struct {
	Command string          `json:"command"`
	Data    json.RawMessage `json:"data"`
}

type SocketError struct {
	Text string `json:"text"`
}

var credentials = Config{}

func GetConfiguration() {
	jsonFile, err := os.Open("config.json")
	if err != nil {
		panic(err)
	}
	byteValue, _ := ioutil.ReadAll(jsonFile)
	json.Unmarshal(byteValue, &credentials)
	jsonFile.Close()
}

func MongoConnect() (*mongo.Client, context.Context, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	uri := "mongodb+srv://" + credentials.DBUser + ":" + credentials.DBPass + "@" + credentials.DBHost + "/" + credentials.DBName + "?w=majority"
	log.Println(uri)
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
func MongoDisconnect(client *mongo.Client, ctx context.Context) error {
	if err := client.Disconnect(ctx); err != nil {
		return err
	}
	return nil
}
