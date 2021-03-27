package main

import (
	"RichDocter/API"
	"RichDocter/common"
	"context"
	"encoding/json"
	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"log"
	"net/http"
	"time"
)

type Story struct {
	//ID          bson.ObjectId `bson:"_id" json:"id"`
	Title string `bson:"title" json:"title"`
	Body  string `bson:"body"  json:"body"`
}

type User struct {
	//ID          bson.ObjectId `bson:"_id"   json:"id"`
	Login string `bson:"login" json:"login"`
	Name  string `bson:"title"  json:"title"`
}

type SocketMessage struct {
	Command string          `json:"command"`
	Data    json.RawMessage `json:"data"`
}

const (
	SERVICE_PATH       = "/api"
	HTTP_PORT          = ":85"
	SOCKET_DIR         = "/ws"
	STORIES_COLLECTION = "stories"

	PING_TIMEOUT = 5000
)

var conn *websocket.Conn

func deletePage(pageNum int, novelID int) error {
	log.Println("delete page", pageNum, novelID)
	client, ctx, err := common.MongoConnect()
	if err != nil {
		log.Println("ERROR CONNECTING: ", err)
		return err
	}
	defer common.MongoDisconnect(client, ctx)
	pages := client.Database("Drafty").Collection("Pages")
	filter := &bson.M{"novelID": novelID, "page": pageNum}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err = pages.DeleteOne(ctx, filter)
	return err
}

func savePage(pageNum int, body []byte, novelID int) error {
	log.Println("save page", pageNum, novelID)
	client, ctx, err := common.MongoConnect()
	if err != nil {
		log.Println("ERROR CONNECTING: ", err)
		return err
	}
	defer common.MongoDisconnect(client, ctx)
	pages := client.Database("Drafty").Collection("Pages")
	filter := &bson.M{"novelID": novelID, "page": pageNum}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	result := API.Page{}
	err = pages.FindOne(ctx, filter).Decode(&result)
	if err != nil {
		log.Println("no page found")
		page := API.Page{pageNum, body, novelID}

		insertResult, err := pages.InsertOne(context.TODO(), page)
		if err != nil {
			log.Println("Error creating new page")
			return err
		}
		log.Println("Inserted a Single Document: ", insertResult.InsertedID)
		return nil
	}
	update := bson.D{
		{"$set", bson.D{{"body", body}}},
	}
	log.Println("updated page body", string(body))
	_, err = pages.UpdateOne(context.TODO(), filter, update)
	return err
}

func createAssociation(text string, typeOf int, novelID int) error {
	log.Println("creating association", text, typeOf, novelID)
	client, ctx, err := common.MongoConnect()
	if err != nil {
		log.Println("ERROR CONNECTING: ", err)
		return err
	}
	defer common.MongoDisconnect(client, ctx)
	assocs := client.Database(`Drafty`).Collection(`Associations`)
	filter := &bson.M{`novelID`: novelID, `text`: text, `type`: typeOf}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	result := API.Association{}
	err = assocs.FindOne(ctx, filter).Decode(&result)
	if err != nil {
		log.Println("no association found")
		assoc := API.Association{primitive.NilObjectID, text, typeOf, novelID, API.AssociationDetails{}}
		insertResult, err := assocs.InsertOne(context.TODO(), assoc)
		if err != nil {
			log.Println("Error creating new association")
			return err
		}
		log.Println("Inserted an association: ", insertResult.InsertedID)
		return nil
	}
	return err
}

func fetchAssociationsByType(typeOf int, novelID int) ([]API.Association, error) {
	client, ctx, err := common.MongoConnect()
	if err != nil {
		return nil, err
	}
	defer common.MongoDisconnect(client, ctx)
	assocs := client.Database("Drafty").Collection("Associations")
	filter := &bson.M{"novelID": novelID, "type": typeOf}
	cur, err := assocs.Find(context.TODO(), filter)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	var results []API.Association
	for cur.Next(context.TODO()) {
		var a API.Association
		err := cur.Decode(&a)
		if err != nil {
			return nil, err
		}
		results = append(results, a)
	}
	return results, nil
}

func fetchAssociations(novelID int) ([]API.Association, error) {
	client, ctx, err := common.MongoConnect()
	if err != nil {
		return nil, err
	}
	defer common.MongoDisconnect(client, ctx)
	assocs := client.Database("Drafty").Collection("Associations")
	filter := &bson.M{"novelID": novelID}
	cur, err := assocs.Find(context.TODO(), filter)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	var results []API.Association
	for cur.Next(context.TODO()) {
		var a API.Association
		err := cur.Decode(&a)
		if err != nil {
			return nil, err
		}
		results = append(results, a)
	}
	return results, nil
}

func main() {
	log.Println("\n\n**********************START")
	log.Println("Listening for http on " + HTTP_PORT)
	common.GetConfiguration()

	hub := newHub()
	go hub.run()

	rtr := mux.NewRouter()
	rtr.HandleFunc(SERVICE_PATH+"/stories", API.AllStoriesEndPoint).Methods("GET")
	rtr.HandleFunc(SERVICE_PATH+"/story/{[0-9]+}", API.StoryEndPoint).Methods("GET")
	rtr.HandleFunc(SERVICE_PATH+"/story/{[0-9]+}/pages", API.AllPagesEndPoint).Methods("GET")
	rtr.HandleFunc(SERVICE_PATH+"/story/{[0-9]+}/associations", API.AllAssociationsEndPoint).Methods("GET")
	rtr.HandleFunc(SERVICE_PATH+"/story/{[0-9]+}/association/{[0-9a-zA-Z]+}", API.AssociationDetailsEndPoint).Methods("GET")
	rtr.HandleFunc("/wsinit", API.SetupWebsocket).Methods("GET")

	rtr.HandleFunc(SERVICE_PATH+"/usr/login", API.LoginEndPoint).Methods("PUT")
	rtr.HandleFunc(SERVICE_PATH+"/story/{[0-9]+}/associations", API.EditAssociationEndPoint).Methods("PUT")

	http.HandleFunc(SOCKET_DIR, func(w http.ResponseWriter, r *http.Request) {
		serveWs(hub, w, r)
	})
	rtr.PathPrefix("/").Handler(http.FileServer(http.Dir("./public/")))
	http.Handle("/", rtr)
	log.Fatal(http.ListenAndServe(HTTP_PORT, nil))
}
