package API

import (
	"RichDocter/common"
	"context"
	"github.com/gorilla/mux"
	"go.mongodb.org/mongo-driver/bson"
	"log"
	"net/http"
	"strings"
)

func AllStoriesEndPoint(w http.ResponseWriter, r *http.Request) {
	client, ctx, err := common.MongoConnect()
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer common.MongoDisconnect(client, ctx)

	claims := r.Context().Value("props").(GoogleClaims)
	log.Println("decoded", claims)

	storiesColl := client.Database("Drafty").Collection("Stories")
	log.Println("stories for user", claims.ID)
	filter := &bson.M{"user": claims.ID}
	var stories []Story
	found, err := storiesColl.Find(context.Background(), filter)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer found.Close(ctx)

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
	client, ctx, err := common.MongoConnect()
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer common.MongoDisconnect(client, ctx)
	assocs := client.Database("Drafty").Collection("Associations")
	filter := &bson.M{"_id": mgoID}
	var results Association
	err = assocs.FindOne(context.TODO(), filter).Decode(&results)
	if err != nil {
		RespondWithError(w, http.StatusNotFound, err.Error())
		return
	}

	deets := client.Database("Drafty").Collection("AssociationDetails")
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
	client, ctx, err := common.MongoConnect()
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	assocs := client.Database("Drafty").Collection("Associations")
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
	defer cur.Close(ctx)
	var results []Association
	for cur.Next(context.TODO()) {
		var a Association
		a.Details = AssociationDetails{}
		err := cur.Decode(&a)
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

func AllPagesEndPoint(w http.ResponseWriter, r *http.Request) {
	sid := mux.Vars(r)[`[0-9a-zA-Z]+`]
	if len(sid) == 0 {
		RespondWithError(w, http.StatusBadRequest, "No story ID received")
		return
	}
	client, ctx, err := common.MongoConnect()
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer common.MongoDisconnect(client, ctx)
	pages := client.Database("Drafty").Collection("Pages")
	mgoID, err := validateBSON(sid)
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, "Missing or invalid storyID")
		return
	}
	filter := &bson.M{"storyID": mgoID}
	cur, err := pages.Find(context.TODO(), filter)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer cur.Close(ctx)

	var results []Page
	for cur.Next(context.TODO()) {
		//Create a value into which the single document can be decoded
		var p Page
		err := cur.Decode(&p)
		if err != nil {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
		results = append(results, p)
	}
	if len(results) == 0 {
		RespondWithError(w, http.StatusNotFound, "No pages")
		return
	}
	RespondWithJson(w, http.StatusOK, results)
}

func SetupWebsocket(w http.ResponseWriter, r *http.Request) {
	log.Println("Listening for socket on " + HTTP_PORT)
	hostname := strings.Split(r.Host, ":")[0]
	url := "ws://" + hostname + HTTP_PORT + SOCKET_DIR
	RespondWithJson(w, http.StatusOK, map[string]string{"url": url})
}
