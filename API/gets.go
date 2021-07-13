package API

import (
	"context"
	"github.com/gorilla/mux"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
	"log"
	"net/http"
	"strings"
)

func AllStoriesEndPoint(w http.ResponseWriter, r *http.Request) {
	claims := r.Context().Value("props").(GoogleClaims)
	log.Println("decoded", claims)

	storiesColl := dbClient.Database("Drafty").Collection("Stories")
	log.Println("stories for user", claims.ID)
	filter := &bson.M{"user": claims.ID}
	findOptions := options.Find()
	findOptions.SetSort(bson.D{{"lastAccessed", -1}})
	var stories []Story
	found, err := storiesColl.Find(context.Background(), filter, findOptions)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer found.Close(context.Background())

	for found.Next(context.TODO()) {
		//Create a value into which the single document can be decoded
		var s Story
		err := found.Decode(&s)
		if err != nil {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
		stories = append(stories, s)
	}
	if len(stories) == 0 {
		RespondWithError(w, http.StatusNotFound, "No stories found.")
		return
	}
	RespondWithJson(w, http.StatusOK, stories)
}

func StoryEndPoint(w http.ResponseWriter, r *http.Request) {

}

func AssociationDetailsEndPoint(w http.ResponseWriter, r *http.Request) {
	associationID := mux.Vars(r)[`[0-9a-zA-Z]+`]
	if len(associationID) == 0 {
		RespondWithError(w, http.StatusBadRequest, "No association ID received")
		return
	}
	mgoID, err := validateBSON(associationID)
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, "Missing or invalid associationID")
		return
	}

	assocs := dbClient.Database("Drafty").Collection("Associations")
	filter := &bson.M{"_id": mgoID}
	var results Association
	err = assocs.FindOne(context.TODO(), filter).Decode(&results)
	if err != nil {
		RespondWithError(w, http.StatusNotFound, err.Error())
		return
	}

	deets := dbClient.Database("Drafty").Collection("AssociationDetails")
	var descr AssociationDetails
	filter = &bson.M{"_id": mgoID}
	deets.FindOne(context.TODO(), filter).Decode(&descr)
	results.Details = descr
	RespondWithJson(w, http.StatusOK, results)
}

func AllAssociationsEndPoint(w http.ResponseWriter, r *http.Request) {
	sid := mux.Vars(r)[`[0-9a-zA-Z]+`]
	if len(sid) == 0 {
		RespondWithError(w, http.StatusBadRequest, "No story ID received")
		return
	}
	assocs := dbClient.Database("Drafty").Collection("Associations")
	mgoID, err := validateBSON(sid)
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, "Missing or invalid storyID")
		return
	}
	filter := &bson.M{"storyID": mgoID}
	cur, err := assocs.Find(context.TODO(), filter)
	if err != nil {
		RespondWithError(w, http.StatusNotFound, err.Error())
		return
	}
	defer cur.Close(context.TODO())
	var results []Association
	deetsDB := dbClient.Database("Drafty").Collection("AssociationDetails")
	for cur.Next(context.TODO()) {
		var a Association
		err := cur.Decode(&a)
		deetsFilter := &bson.M{"_id": a.ID}
		var deets AssociationDetails
		deetsDB.FindOne(context.TODO(), deetsFilter).Decode(&deets)
		a.Details = deets
		if err != nil {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
		results = append(results, a)
	}
	if len(results) == 0 {
		RespondWithError(w, http.StatusNotFound, "No pages")
		return
	}
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	RespondWithJson(w, http.StatusOK, results)
}

func AllBlocksEndPoint(w http.ResponseWriter, r *http.Request) {
	sid := mux.Vars(r)[`[0-9a-zA-Z]+`]
	if len(sid) == 0 {
		RespondWithError(w, http.StatusBadRequest, "No story ID received")
		return
	}
	pages := dbClient.Database("Drafty").Collection(sid + "_blocks")
	mgoID, err := validateBSON(sid)
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, "Missing or invalid storyID")
		return
	}
	filter := &bson.M{"storyID": mgoID}
	findOptions := options.Find()
	findOptions.SetSort(bson.D{{"order", 1}})
	cur, err := pages.Find(context.TODO(), filter, findOptions)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer cur.Close(context.TODO())

	var results []Block
	for cur.Next(context.TODO()) {
		var b Block
		err := cur.Decode(&b)
		if err != nil {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
		results = append(results, b)
	}
	if len(results) == 0 {
		RespondWithError(w, http.StatusNotFound, "No blocks")
		return
	}
	RespondWithJson(w, http.StatusOK, results)
}

func SetupWebsocket(w http.ResponseWriter, r *http.Request) {
	toSlice := strings.Split(r.Host, ":")
	hostName := toSlice[0]
	port := ""
	if len(toSlice) > 1 {
		port = toSlice[1]
	}
	url := "ws://"
	if strings.Index(r.Referer(), "https") != -1 {
		log.Println("listening for secure websocket on " + hostName + ":" + port)
		url = "wss://"
	} else {
		log.Println("listening for websocket on " + hostName + ":" + port)
	}
	if port == "" {
		url += hostName + SOCKET_DIR
	} else {
		url += hostName + ":" + port + SOCKET_DIR
	}
	RespondWithJson(w, http.StatusOK, map[string]string{"url": url})
}
