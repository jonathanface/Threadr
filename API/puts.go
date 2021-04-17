package API

import (
	"RichDocter/common"
	"context"
	"encoding/json"
	"github.com/gorilla/mux"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"log"
	"net/http"
	"strings"
)

func EditTitleEndPoint(w http.ResponseWriter, r *http.Request) {
	sid := mux.Vars(r)[`[0-9a-zA-Z]+`]
	log.Println("???", mux.Vars(r))
	if len(sid) == 0 {
		RespondWithError(w, http.StatusBadRequest, "No story ID received")
		return
	}
	var story Story
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(&story); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}
	var err error
	story.ID, err = validateBSON(sid)
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, "Missing or invalid storyID")
		return
	}
	story.Title = strings.TrimSpace(story.Title)
	log.Println("got", story)
	if story.Title == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing name")
		return
	}

	client, ctx, err := common.MongoConnect()
	if err != nil {
		log.Println("ERROR CONNECTING: ", err)
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer common.MongoDisconnect(client, ctx)
	storiesColl := client.Database(`Drafty`).Collection(`Stories`)
	filter := &bson.M{"_id": story.ID}
	update := &bson.M{"$set": &bson.M{"title": story.Title}}

	_, err = storiesColl.UpdateOne(context.TODO(), filter, update)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	RespondWithJson(w, http.StatusOK, "success")
}

func EditAssociationEndPoint(w http.ResponseWriter, r *http.Request) {
	sid := mux.Vars(r)[`[0-9a-zA-Z]+`]
	if len(sid) == 0 {
		RespondWithError(w, http.StatusBadRequest, "No story ID received")
		return
	}

	var assRequest struct { // heh, ass request
		AssociationIDString string             `json:"associationID"`
		AssociationID       primitive.ObjectID `bson:"_id"`
		Name                string             `json:"name"`
		Description         string             `json:"description"`
		StoryID             int                `json:"storyID"`
	}
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(&assRequest); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}
	defer r.Body.Close()

	assRequest.Name = strings.TrimSpace(assRequest.Name)
	mgoID, err := validateBSON(assRequest.AssociationIDString)
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, "Missing or invalid associationID")
		return
	}
	if assRequest.Name == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing name")
		return
	}

	log.Println("editing association", mgoID, assRequest)

	client, ctx, err := common.MongoConnect()
	if err != nil {
		log.Println("ERROR CONNECTING: ", err)
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer common.MongoDisconnect(client, ctx)
	var result struct {
		ID            primitive.ObjectID `json:"id" bson:"_id"`
		AssociationID primitive.ObjectID `json:"assID" bson:"assID"`
	}
	descrips := client.Database(`Drafty`).Collection(`AssociationDetails`)
	filter := &bson.M{"ID": mgoID}
	err = descrips.FindOne(context.TODO(), filter).Decode(&result)
	if err != nil {
		log.Println(err)
		assoc := AssociationDetails{mgoID, assRequest.Description}
		insertResult, err := descrips.InsertOne(context.TODO(), assoc)
		if err != nil {
			log.Println("Error creating new association description")
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
		log.Println("Inserted an association description: ", insertResult.InsertedID)
	} else {
		//update description here
		_, err := descrips.UpdateOne(
			context.TODO(),
			&bson.M{"ID": mgoID},
			bson.D{
				{"$set", bson.D{{"text", assRequest.Description}}},
			},
		)
		if err != nil {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
		}
	}
	RespondWithJson(w, http.StatusOK, "success")
}
