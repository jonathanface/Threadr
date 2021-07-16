package API

import (
	"encoding/json"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"log"
	"net/http"
	"strings"
	"time"
)

func CreateStoryEndPoint(w http.ResponseWriter, r *http.Request) {
	claims := r.Context().Value("props").(GoogleClaims)

	var story Story
	story.LastAccessed = time.Now()
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(&story); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	story.Title = strings.TrimSpace(story.Title)
	log.Println("creating", story.Title)
	if story.Title == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing name")
		return
	}
	story.User = claims.ID
	storiesColl := dbClient.Database(`Drafty`).Collection(`Stories`)
	ctx := r.Context()
	result, err := storiesColl.InsertOne(ctx, story)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	story.ID = result.InsertedID.(primitive.ObjectID)
	log.Println("id", story.ID)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	var returnObj []Story
	returnObj = append(returnObj, story)
	RespondWithJson(w, http.StatusOK, returnObj)
}
