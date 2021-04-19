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
	"go.mongodb.org/mongo-driver/mongo/options"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type SocketMessage struct {
	Command string          `json:"command"`
	Data    json.RawMessage `json:"data"`
}

const (
	SERVICE_PATH       = "/api"
	HTTP_PORT          = ":85"
	SOCKET_DIR         = "/ws"
	STORIES_COLLECTION = "stories"
	STATIC_FILES_DIR   = "public"
	PING_TIMEOUT       = 5000
)

var conn *websocket.Conn

func deletePage(pageNum int, storyID primitive.ObjectID) error {
	log.Println("delete page", pageNum, storyID)
	client, ctx, err := common.MongoConnect()
	if err != nil {
		log.Println("ERROR CONNECTING: ", err)
		return err
	}
	defer common.MongoDisconnect(client, ctx)
	pages := client.Database("Drafty").Collection("Pages")
	filter := &bson.M{"storyID": storyID, "page": pageNum}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err = pages.DeleteOne(ctx, filter)
	return err
}

func savePage(pageNum int, body []byte, storyID primitive.ObjectID) error {
	log.Println("save page", pageNum, storyID)
	client, ctx, err := common.MongoConnect()
	if err != nil {
		log.Println("ERROR CONNECTING: ", err)
		return err
	}
	defer common.MongoDisconnect(client, ctx)
	pages := client.Database("Drafty").Collection("Pages")
	filter := &bson.M{"storyID": storyID, "page": pageNum}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	result := API.Page{}
	err = pages.FindOne(ctx, filter).Decode(&result)
	if err != nil {
		log.Println("no page found")
		page := API.Page{pageNum, body, storyID}

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

func createAssociation(text string, typeOf int, storyID primitive.ObjectID) error {
	log.Println("creating association", text, typeOf, storyID)
	client, ctx, err := common.MongoConnect()
	if err != nil {
		log.Println("ERROR CONNECTING: ", err)
		return err
	}
	defer common.MongoDisconnect(client, ctx)
	assocs := client.Database(`Drafty`).Collection(`Associations`)
	filter := &bson.M{`storyID`: storyID, `text`: text, `type`: typeOf}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	result := API.Association{}
	err = assocs.FindOne(ctx, filter).Decode(&result)
	if err != nil {
		log.Println("no association found ", storyID)
		assoc := API.Association{primitive.NilObjectID, text, typeOf, storyID, API.AssociationDetails{}}
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

func fetchAssociationsByType(typeOf int, storyID primitive.ObjectID) ([]API.Association, error) {
	client, ctx, err := common.MongoConnect()
	if err != nil {
		return nil, err
	}
	defer common.MongoDisconnect(client, ctx)
	assocs := client.Database("Drafty").Collection("Associations")
	filter := &bson.M{"novelID": storyID, "type": typeOf}
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

func fetchAssociations(storyID primitive.ObjectID) ([]API.Association, error) {
	client, ctx, err := common.MongoConnect()
	if err != nil {
		return nil, err
	}
	defer common.MongoDisconnect(client, ctx)
	assocs := client.Database("Drafty").Collection("Associations")
	filter := &bson.M{"storyID": storyID}
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
				API.RespondWithError(w, http.StatusForbidden, "Invalid google auth")
				return
			}
			client, ctx, err := common.MongoConnect()
			if err != nil {
				API.RespondWithError(w, http.StatusInternalServerError, "Error writing user account to DB")
				return
			}
			defer common.MongoDisconnect(client, ctx)
			users := client.Database("Drafty").Collection("Users")
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
				ctx = context.WithValue(r.Context(), "props", claims)
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
	if _, err := os.Stat(truePath); os.IsNotExist(err) {
		http.StripPrefix(r.URL.Path, http.FileServer(http.Dir("./public"))).ServeHTTP(w, r)
		return
	}
	http.FileServer(http.Dir("."+string(os.PathSeparator)+STATIC_FILES_DIR+string(os.PathSeparator))).ServeHTTP(w, r)
}

func main() {
	log.Println("Listening for http on " + HTTP_PORT)
	common.GetConfiguration()

	hub := newHub()
	go hub.run()

	rtr := mux.NewRouter()
	rtr.HandleFunc(SERVICE_PATH+"/stories", middleware(API.AllStoriesEndPoint)).Methods("GET", "OPTIONS")
	rtr.HandleFunc(SERVICE_PATH+"/story/{[0-9a-zA-Z]+}", middleware(API.StoryEndPoint)).Methods("GET", "OPTIONS")
	rtr.HandleFunc(SERVICE_PATH+"/story/{[0-9a-zA-Z]+}/pages", middleware(API.AllPagesEndPoint)).Methods("GET", "OPTIONS")
	rtr.HandleFunc(SERVICE_PATH+"/story/{[0-9a-zA-Z]+}/associations", middleware(API.AllAssociationsEndPoint)).Methods("GET", "OPTIONS")
	rtr.HandleFunc(SERVICE_PATH+"/association/{[0-9a-zA-Z]+}", middleware(API.AssociationDetailsEndPoint)).Methods("GET", "OPTIONS")
	rtr.HandleFunc(SERVICE_PATH+"/user/name", middleware(nil)).Methods("GET", "OPTIONS")
	rtr.HandleFunc("/wsinit", middleware(API.SetupWebsocket)).Methods("GET", "OPTIONS")

	rtr.HandleFunc(SERVICE_PATH+"/story/{[0-9a-zA-Z]+}/title", middleware(API.EditTitleEndPoint)).Methods("PUT")
	rtr.HandleFunc(SERVICE_PATH+"/story/{[0-9a-zA-Z]+}/associations", middleware(API.EditAssociationEndPoint)).Methods("PUT")

	http.HandleFunc(SOCKET_DIR, func(w http.ResponseWriter, r *http.Request) {
		serveWs(hub, w, r)
	})
	rtr.PathPrefix("/").HandlerFunc(serveRootDirectory)
	http.Handle("/", rtr)
	log.Fatal(http.ListenAndServe(HTTP_PORT, nil))
}
