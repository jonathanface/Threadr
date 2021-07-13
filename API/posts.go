package API

import (
	"context"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"log"
	"net/http"
	"time"
)

func CreateStoryEndPoint(w http.ResponseWriter, r *http.Request) {
	var story Story
	story.Title = "New Story"
	story.LastAccessed = time.Now()
	claims := r.Context().Value("props").(GoogleClaims)
	story.User = claims.ID
	storiesColl := dbClient.Database(`Drafty`).Collection(`Stories`)

	result, err := storiesColl.InsertOne(context.TODO(), story)
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
