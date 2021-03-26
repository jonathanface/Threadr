package API

import (
	"RichDocter/common"
	"context"
	"github.com/gorilla/mux"
	"go.mongodb.org/mongo-driver/bson"
	"log"
	"net/http"
	"strconv"
	"strings"
)

func AllStoriesEndPoint(w http.ResponseWriter, r *http.Request) {
	/*
		  session, err := mgo.DialWithInfo(connection_info)
			if err != nil {
				respondWithError(w, http.StatusInternalServerError, err.Error())
				return
			}
		  defer session.Close()

			c := session.DB(DATABASE).C(STORIES_COLLECTION)
		  var stories []Story
			err = c.Find(nil).All(&stories)
		  if (err != nil) {
		    respondWithError(w, http.StatusInternalServerError, err.Error())
		    return
		  }
			respondWithJson(w, http.StatusOK, stories)*/
}

func StoryEndPoint(w http.ResponseWriter, r *http.Request) {
	/*
	     sid := mux.Vars(r)["[0-9a-zA-Z]+"]
	     if len(sid) == 0 {
	       respondWithError(w, http.StatusBadRequest, "No story ID received")
	       return
	     }
	     session, err := mgo.DialWithInfo(connection_info)
	     if err != nil {
	   		respondWithError(w, http.StatusInternalServerError, err.Error())
	   		return
	   	}
	     defer session.Close()
	     c := session.DB(DATABASE).C(STORIES_COLLECTION)
	     var story Story
	     if !bson.IsObjectIdHex(sid) {
	       respondWithError(w, http.StatusBadRequest, "invalid story id")
	       return
	     }
	     err = c.Find(bson.M{"_id":bson.ObjectIdHex(sid)}).One(&story)
	     if (err != nil) {
	       respondWithError(w, http.StatusInternalServerError, err.Error())
	       return
	     }
	   	respondWithJson(w, http.StatusOK, story)*/
}

func AllAssociationsEndPoint(w http.ResponseWriter, r *http.Request) {
	sid := mux.Vars(r)[`[0-9]+`]
	if len(sid) == 0 {
		respondWithError(w, http.StatusBadRequest, "No story ID received")
		return
	}
	novelID, err := strconv.Atoi(sid)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	client, ctx, err := common.MongoConnect()
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	assocs := client.Database("Drafty").Collection("Associations")
	filter := &bson.M{"novelID": novelID}
	cur, err := assocs.Find(context.TODO(), filter)
	if err != nil {
		respondWithError(w, http.StatusNotFound, err.Error())
		return
	}
	defer cur.Close(ctx)
	var results []ReadAssociation
	for cur.Next(context.TODO()) {
		var a ReadAssociation
		err := cur.Decode(&a)
		if err != nil {
			respondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
		results = append(results, a)
	}
	if len(results) == 0 {
		respondWithError(w, http.StatusNotFound, "No pages")
		return
	}
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondWithJson(w, http.StatusOK, results)
}

func AllPagesEndPoint(w http.ResponseWriter, r *http.Request) {
	sid := mux.Vars(r)[`[0-9]+`]
	if len(sid) == 0 {
		respondWithError(w, http.StatusBadRequest, "No story ID received")
		return
	}
	novelID, err := strconv.Atoi(sid)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	client, ctx, err := common.MongoConnect()
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer common.MongoDisconnect(client, ctx)
	pages := client.Database("Drafty").Collection("Pages")
	filter := &bson.M{"novelID": novelID}
	cur, err := pages.Find(context.TODO(), filter)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer cur.Close(ctx)
	log.Println("cur", cur)
	var results []Page
	for cur.Next(context.TODO()) {
		//Create a value into which the single document can be decoded
		var p Page
		err := cur.Decode(&p)
		if err != nil {
			respondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
		results = append(results, p)
	}
	if len(results) == 0 {
		respondWithError(w, http.StatusNotFound, "No pages")
		return
	}
	respondWithJson(w, http.StatusOK, results)
}

func SetupWebsocket(w http.ResponseWriter, r *http.Request) {
	log.Println("Listening for socket on " + HTTP_PORT)
	hostname := strings.Split(r.Host, ":")[0]
	url := "ws://" + hostname + HTTP_PORT + SOCKET_DIR
	respondWithJson(w, http.StatusOK, map[string]string{"url": url})
}
