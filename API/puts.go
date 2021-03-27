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
)

func LoginEndPoint(w http.ResponseWriter, r *http.Request) {

	/*
		  login := r.FormValue("user")
			pass := r.FormValue("pass")
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			client, err := mongo.Connect(ctx, options.Client().ApplyURI(`mongodb://"+credentials.DBHost+":`+credentials.DBPort).SetAuth(options.Credential{
				AuthSource: credentials.DBName, Username: credentials.DBUser, Password: credentials.DBPass,
			}))
			if err != nil {
				respondWithError(w, http.StatusInternalServerError, err.Error())
				return
			}
			if err = client.Ping(ctx, nil); err != nil {
				respondWithError(w, http.StatusInternalServerError, err.Error())
				return
			}
			log.Println("Connected to MongoDB!")
			defer func() {
				if err = client.Disconnect(ctx); err != nil {
					panic(err)
				}
			}()

			var result struct {
				Value float64
			}
			filter := bson.M{"login": login, "pass": pass}
			ctx, cancel = context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			collection := client.Database(credentials.DBName).Collection(USERS_COLLECTION)
			err = collection.FindOne(ctx, filter).Decode(&result)
			if err != nil {
				log.Fatal(err)
			}
			log.Println(result)
			respondWithJson(w, http.StatusOK, result)*/
}

func EditAssociationEndPoint(w http.ResponseWriter, r *http.Request) {
	sid := mux.Vars(r)[`[0-9]+`]
	if len(sid) == 0 {
		respondWithError(w, http.StatusBadRequest, "No story ID received")
		return
	}

	var assRequest struct { // heh, ass request
		AssociationIDString string             `json:"associationID"`
		AssociationID       primitive.ObjectID `bson:"_id"`
		Name                string             `json:"name"`
		Description         string             `json:"description"`
		NovelID             int                `json:"novelID"`
	}
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(&assRequest); err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}
	defer r.Body.Close()

	mgoID, err := validateBSON(assRequest.AssociationIDString)
	if err != nil {
		respondWithError(w, http.StatusBadRequest, "Missing or invalid associationID")
		return
	}
	if assRequest.Name == "" {
		respondWithError(w, http.StatusBadRequest, "Missing name")
		return
	}

	log.Println("editing association", mgoID, assRequest)

	client, ctx, err := common.MongoConnect()
	if err != nil {
		log.Println("ERROR CONNECTING: ", err)
		respondWithError(w, http.StatusInternalServerError, err.Error())
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
			respondWithError(w, http.StatusInternalServerError, err.Error())
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
			respondWithError(w, http.StatusInternalServerError, err.Error())
		}
	}
	respondWithJson(w, http.StatusOK, "success")
}
