package main

import (
	"RichDocter/API"
	"RichDocter/common"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/dgrijalva/jwt-go"
	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	SERVICE_PATH       = "/api"
	SOCKET_DIR         = "/ws"
	STORIES_COLLECTION = "stories"
	STATIC_FILES_DIR   = "public"
	PING_TIMEOUT       = 5000
	CONTEXT_TIMEOUT    = time.Duration(time.Second * 10)
)

type Config struct {
	DBHost   string `json:"dbHost"`
	DBPort   string `json:"dbPort"`
	DBUser   string `json:"dbUser"`
	DBPass   string `json:"dbPass"`
	DBName   string `json:"dbName"`
	HttpPort string `json:"httpPort"`
}

var credentials = Config{}

var conn *websocket.Conn
var dbClient *mongo.Client

func deleteBlock(blockID string, storyID primitive.ObjectID, ctx context.Context) error {
	log.Println("delete block", blockID, storyID)
	pages := dbClient.Database("Drafty").Collection(storyID.Hex() + "_blocks")
	filter := &bson.M{"storyID": storyID, "key": blockID}
	_, err := pages.DeleteOne(ctx, filter)
	return err
}

func saveAllBlocks(blocks []API.Block, storyID primitive.ObjectID, ctx context.Context) error {
	log.Println("resetting all blocks for", storyID.Hex())
	blocksColl := dbClient.Database("Drafty").Collection(storyID.Hex() + "_blocks")
	_, err := blocksColl.DeleteMany(ctx, bson.M{})
	if err != nil {
		return err
	}
	for count, val := range blocks {
		common.SaveBlock(dbClient, val.Key, val.Body, val.Entities, storyID, count)
	}
	return nil
}

func updateBlockOrder(order map[string]int, storyID primitive.ObjectID, ctx context.Context) error {
	log.Println("updating block order")
	blocks := dbClient.Database("Drafty").Collection(storyID.Hex() + "_blocks")
	cursor, err := blocks.Find(ctx, bson.D{})
	if err != nil {
		return err
	}
	for cursor.Next(ctx) {
		var b API.Block
		err := cursor.Decode(&b)
		if err != nil {
			return err
		}
		if _, ok := order[b.Key]; !ok {
			err = deleteBlock(b.Key, storyID, ctx)
			if err != nil {
				return err
			}
		}
	}

	for key, val := range order {
		filter := &bson.M{"storyID": storyID, "key": key}
		update := &bson.M{"$set": &bson.M{"key": key, "order": val}}
		_, err := blocks.UpdateOne(context.TODO(), filter, update)
		if err != nil {
			return err
		}
	}
	return nil
}

func createAssociation(text string, typeOf int, storyID primitive.ObjectID, ctx context.Context) error {
	log.Println("creating association", text, typeOf, storyID)
	if len(text) == 0 {
		return errors.New("Association cannot be blank")
	}
	assocs := dbClient.Database(`Drafty`).Collection(`Associations`)
	log.Println("filter", storyID, text, typeOf)
	filter := &bson.M{`storyID`: storyID, `name`: text}
	count, _ := assocs.CountDocuments(ctx, filter)
	log.Println("count", count)
	if count == 0 {
		log.Println("no association found")
		assoc := API.Association{primitive.NilObjectID, text, typeOf, storyID, API.AssociationDetails{}}
		insertResult, err := assocs.InsertOne(context.TODO(), assoc)
		if err != nil {
			log.Println("Error creating new association")
			return err
		}
		log.Println("Inserted an association: ", insertResult.InsertedID)
		return nil
	}
	return errors.New("You can only assign one association per document with the same text.")
}

func deleteAssociation(id primitive.ObjectID, ctx context.Context) error {
	log.Println("deleting association", id)
	assocs := dbClient.Database(`Drafty`).Collection(`Associations`)
	_, err := assocs.DeleteOne(ctx, bson.M{"_id": id})
	if err != nil {
		return err
	}
	deets := dbClient.Database(`Drafty`).Collection(`AssociationDetails`)
	_, err = deets.DeleteOne(ctx, bson.M{"_id": id})
	ctx, cancelDeets := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancelDeets()
	if err != nil {
		return err
	}
	return nil
}

func fetchAssociationsByType(typeOf int, storyID primitive.ObjectID, ctx context.Context) ([]API.Association, error) {
	assocs := dbClient.Database("Drafty").Collection("Associations")
	filter := &bson.M{"novelID": storyID, "type": typeOf}
	cur, err := assocs.Find(ctx, filter)
	if err != nil {
		return nil, err
	}
	var results []API.Association
	for cur.Next(ctx) {
		var a API.Association
		err := cur.Decode(&a)
		if err != nil {
			return nil, err
		}
		results = append(results, a)
	}
	return results, nil
}

func fetchAssociations(storyID primitive.ObjectID, ctx context.Context) ([]API.Association, error) {
	log.Println("fetching story assocs", storyID)
	assocs := dbClient.Database("Drafty").Collection("Associations")
	filter := &bson.M{"storyID": storyID}
	cur, err := assocs.Find(ctx, filter)
	if err != nil {
		return nil, err
	}
	var results []API.Association
	deets := dbClient.Database("Drafty").Collection("AssociationDetails")
	for cur.Next(ctx) {
		var a API.Association
		err := cur.Decode(&a)
		if err != nil {
			return nil, err
		}
		var descr API.AssociationDetails
		filter = &bson.M{"_id": a.ID}
		deets.FindOne(ctx, filter).Decode(&descr)
		a.Details = descr
		results = append(results, a)
	}
	return results, nil
}

func getGooglePublicKey(keyID string) (string, error) {
	resp, err := http.Get("https://www.googleapis.com/oauth2/v1/certs")
	if err != nil {
		return "", err
	}
	dat, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	myResp := map[string]string{}
	err = json.Unmarshal(dat, &myResp)
	if err != nil {
		return "", err
	}
	key, ok := myResp[keyID]
	if !ok {
		return "", errors.New("key not found")
	}
	return key, nil
}

func validateGoogleJWT(tokenString string) (API.GoogleClaims, error) {
	claimsStruct := API.GoogleClaims{}
	token, err := jwt.ParseWithClaims(
		tokenString,
		&claimsStruct,
		func(token *jwt.Token) (interface{}, error) {
			pem, err := getGooglePublicKey(fmt.Sprintf("%s", token.Header["kid"]))
			if err != nil {
				return nil, err
			}
			key, err := jwt.ParseRSAPublicKeyFromPEM([]byte(pem))
			if err != nil {
				return nil, err
			}
			return key, nil
		},
	)
	if err != nil {
		return API.GoogleClaims{}, err
	}
	claims, ok := token.Claims.(*API.GoogleClaims)

	if !ok {
		return API.GoogleClaims{}, errors.New("Invalid Google JWT")
	}
	if claims.Issuer != "accounts.google.com" && claims.Issuer != "https://accounts.google.com" {
		return API.GoogleClaims{}, errors.New("iss is invalid")
	}
	if claims.Audience != "878388830212-tq6uhegouorlrn7srsn3getqkn4er3fg.apps.googleusercontent.com" {
		return API.GoogleClaims{}, errors.New("auth is invalid")
	}

	if claims.ExpiresAt < time.Now().UTC().Unix() {
		return API.GoogleClaims{}, errors.New("JWT is expired")
	}
	return *claims, nil
}

func middleware(next http.HandlerFunc) http.HandlerFunc {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := strings.Split(r.Header.Get("Authorization"), "Bearer ")
		if len(authHeader) != 2 {
			API.RespondWithError(w, http.StatusBadRequest, "Malformed Token")
		} else {
			claims, err := validateGoogleJWT(authHeader[1])
			if err != nil {
				log.Println("problem with claims")
				//should do token refresh here
				API.RespondWithError(w, http.StatusForbidden, err.Error())
				return
			}
			users := dbClient.Database("Drafty").Collection("Users")
			filter := &bson.M{"email": claims.Email}
			opts := options.Update().SetUpsert(true)
			update := &bson.M{"$set": &bson.M{"lastActive": primitive.Timestamp{T: uint32(time.Now().Unix())}}}
			result, err := users.UpdateOne(context.Background(), filter, update, opts)
			if err != nil {
				API.RespondWithError(w, http.StatusInternalServerError, err.Error())
				return
			}

			if claims.ID == primitive.NilObjectID {
				err = users.FindOne(context.Background(), filter).Decode(&claims)
				if err != nil {
					API.RespondWithError(w, http.StatusInternalServerError, err.Error())
					return
				}
			} else {
				claims.ID, err = primitive.ObjectIDFromHex(result.UpsertedID.(string))
				if err != nil {
					API.RespondWithError(w, http.StatusInternalServerError, err.Error())
					return
				}
			}
			if next != nil {
				ctx := context.WithValue(r.Context(), "props", claims)
				ctx, cancel := context.WithTimeout(ctx, time.Duration(time.Second*10))
				defer cancel()
				next.ServeHTTP(w, r.WithContext(ctx))
			} else {
				// This is just if I requested user details from the claims
				var nameHolder struct {
					FirstName string `json:"given_name"`
					LastName  string `json:"family_name"`
				}
				nameHolder.FirstName = claims.FirstName
				nameHolder.LastName = claims.LastName
				API.RespondWithJson(w, http.StatusOK, nameHolder)
			}
		}
	})
}

func serveRootDirectory(w http.ResponseWriter, r *http.Request) {
	abs, err := filepath.Abs(".")
	if err != nil {
		log.Println(err.Error())
		return
	}
	cleanedPath := filepath.Clean(r.URL.Path)
	truePath := abs + string(os.PathSeparator) + STATIC_FILES_DIR + cleanedPath
	log.Println("true", r.URL.Path)
	if _, err := os.Stat(truePath); os.IsNotExist(err) {
		// return an error if this is a bad API request
		if strings.Contains(r.URL.Path, SERVICE_PATH) {
			API.RespondWithError(w, http.StatusNotFound, err.Error())
			return
		}
		http.StripPrefix(r.URL.Path, http.FileServer(http.Dir("./public"))).ServeHTTP(w, r)
		return
	}
	http.FileServer(http.Dir("."+string(os.PathSeparator)+STATIC_FILES_DIR+string(os.PathSeparator))).ServeHTTP(w, r)
}

func mongoConnect() (*mongo.Client, context.Context, error) {
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
func mongoDisconnect(client *mongo.Client, ctx context.Context) error {
	if err := client.Disconnect(ctx); err != nil {
		return err
	}
	return nil
}

func loadConfiguration() {
	jsonFile, err := os.Open("config.json")
	if err != nil {
		panic(err)
	}
	byteValue, _ := ioutil.ReadAll(jsonFile)
	json.Unmarshal(byteValue, &credentials)
	jsonFile.Close()
}

func getHTTPPort() string {
	return credentials.HttpPort
}

func main() {
	loadConfiguration()
	log.Println("Listening for http on " + getHTTPPort())
	var ctx context.Context
	var err error
	dbClient, ctx, err = mongoConnect()
	if err != nil {
		log.Fatal("Database won't connect", err)
	}
	defer mongoDisconnect(dbClient, ctx)
	API.SetDB(dbClient)
	hub := newHub()
	go hub.run()

	rtr := mux.NewRouter()
	rtr.HandleFunc(SERVICE_PATH+"/stories", middleware(API.AllStoriesEndPoint)).Methods("GET", "OPTIONS")
	rtr.HandleFunc(SERVICE_PATH+"/story/{[0-9a-zA-Z]+}", middleware(API.StoryEndPoint)).Methods("GET", "OPTIONS")
	rtr.HandleFunc(SERVICE_PATH+"/story/{[0-9a-zA-Z]+}/blocks", middleware(API.AllBlocksEndPoint)).Methods("GET", "OPTIONS")
	rtr.HandleFunc(SERVICE_PATH+"/story/{[0-9a-zA-Z]+}/associations", middleware(API.AllAssociationsEndPoint)).Methods("GET", "OPTIONS")
	rtr.HandleFunc(SERVICE_PATH+"/association/{[0-9a-zA-Z]+}", middleware(API.AssociationDetailsEndPoint)).Methods("GET", "OPTIONS")
	rtr.HandleFunc(SERVICE_PATH+"/wsinit", middleware(API.SetupWebsocket)).Methods("GET", "OPTIONS")
	rtr.HandleFunc(SERVICE_PATH+"/user/name", middleware(nil)).Methods("GET", "OPTIONS")

	rtr.HandleFunc(SERVICE_PATH+"/story/{[0-9a-zA-Z]+}/title", middleware(API.EditTitleEndPoint)).Methods("PUT")
	rtr.HandleFunc(SERVICE_PATH+"/story/{[0-9a-zA-Z]+}/associations", middleware(API.EditAssociationEndPoint)).Methods("PUT")

	rtr.HandleFunc(SERVICE_PATH+"/story", middleware(API.CreateStoryEndPoint)).Methods("POST")

	rtr.HandleFunc(SERVICE_PATH+"/story/{[0-9a-zA-Z]+}", middleware(API.DeleteStoryEndPoint)).Methods("DELETE")

	http.HandleFunc(SOCKET_DIR, func(w http.ResponseWriter, r *http.Request) {
		serveWs(hub, w, r)
	})
	rtr.PathPrefix("/").HandlerFunc(serveRootDirectory)
	http.Handle("/", rtr)
	log.Fatal(http.ListenAndServe(":"+getHTTPPort(), nil))
}
