package API

import (
	"github.com/gorilla/mux"
	"go.mongodb.org/mongo-driver/bson"
	"log"
	"net/http"
)

func DeleteStoryEndPoint(w http.ResponseWriter, r *http.Request) {
	sid := mux.Vars(r)[`[0-9a-zA-Z]+`]
	if len(sid) == 0 {
		RespondWithError(w, http.StatusBadRequest, "No story ID received")
		return
	}
	storyID, err := validateBSON(sid)
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, "Missing or invalid storyID")
		return
	}

	claims := r.Context().Value("props").(GoogleClaims)
	log.Println("decoded", claims)
	ctx := r.Context()
	storiesColl := dbClient.Database("Drafty").Collection("Stories")
	filter := &bson.M{"user": claims.ID, "_id": storyID}
	_, err = storiesColl.DeleteMany(ctx, filter)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	pagesColl := dbClient.Database("Drafty").Collection(sid + "_blocks")
	filter = &bson.M{"storyID": storyID}
	_, err = pagesColl.DeleteOne(ctx, filter)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	assocsColl := dbClient.Database("Drafty").Collection("Associations")
	filter = &bson.M{"storyID": storyID}

	find, err := assocsColl.Find(ctx, filter)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	for find.Next(r.Context()) {
		var a Association
		err := find.Decode(&a)
		if err != nil {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
		_, err = assocsColl.DeleteMany(ctx, filter)
		if err != nil {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}

		assocDeets := dbClient.Database("Drafty").Collection("AssociationDetails")
		deetsFilter := &bson.M{"_id": a.ID}
		_, err = assocDeets.DeleteOne(ctx, deetsFilter)
		if err != nil {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	RespondWithJson(w, http.StatusOK, "success")
}
