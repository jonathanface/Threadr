package API

import (
	"RichDocter/common"
	"context"
	"encoding/json"
	"github.com/gorilla/mux"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
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
		AssociationID       primitive.ObjectID `bson:"_id,omitempty"`
		Name                string             `json:"name"`
		Description         string             `json:"description"`
		Aliases             string             `json:"aliases"`
		CaseSensitive       bool               `json:"caseSensitive"`
		StoryID             primitive.ObjectID `json:"storyID,omitempty"`
	}
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(&assRequest); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}
	defer r.Body.Close()
	
	mgoID, err := validateBSON(assRequest.AssociationIDString)
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, "Missing or invalid associationID")
		return
	}
  assRequest.Name = strings.TrimSpace(assRequest.Name)
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
  assoc := client.Database(`Drafty`).Collection(`Association`)
  filter := &bson.M{"_id": mgoID}
  update := &bson.M{"$set": &bson.M{"name": assRequest.Name}}
  _, err = assoc.UpdateOne(context.Background(), filter, update)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	descrips := client.Database(`Drafty`).Collection(`AssociationDetails`)
	filter = &bson.M{"_id": mgoID}
	opts := options.Update().SetUpsert(true)
	update = &bson.M{"$set": &bson.M{"aliases": assRequest.Aliases, "caseSensitive": assRequest.CaseSensitive, "description": assRequest.Description}}
	result, err := descrips.UpdateOne(context.Background(), filter, update, opts)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	var upsertResult struct {
		ID primitive.ObjectID `json:"id" bson:"_id"`
	}
	if assRequest.AssociationID == primitive.NilObjectID {
		err = descrips.FindOne(context.Background(), filter).Decode(&upsertResult)
		if err != nil {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
	} else {
		upsertResult.ID, err = primitive.ObjectIDFromHex(result.UpsertedID.(string))
		if err != nil {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	RespondWithJson(w, http.StatusOK, upsertResult)
}
