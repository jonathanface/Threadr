package main

import (
  "net/http"
  "github.com/gorilla/mux"
  "github.com/gorilla/context"
  "time"
  mgo "gopkg.in/mgo.v2"
  "gopkg.in/mgo.v2/bson"
  "encoding/json"
)


type Story struct {
	ID          bson.ObjectId `bson:"_id" json:"id"`
	Title       string        `bson:"title" json:"title"`
}


const (
  SERVICE_PATH = "/api"
  PORT = ":85"
)


const (
  Username   = "drafter"
  Password   = "r00tm4st3r"
  Database   = "drafty"
  Collection = "stories"
)


func AllStoriesEndPoint(w http.ResponseWriter, r *http.Request) {
Host := []string{
  "127.0.0.1:27017",
  // replica set addrs...
}
	info := &mgo.DialInfo{
    Addrs:    Host,
    Timeout:  60 * time.Second,
    Database: Database,
    Username: Username,
    Password: Password,
  }
  session, err := mgo.DialWithInfo(info)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
  defer session.Close()

	c := session.DB(Database).C(Collection)
  var stories []Story
	err = c.Find(nil).All(&stories)
  
  if (err != nil) {
    respondWithError(w, http.StatusInternalServerError, err.Error())
  }

	respondWithJson(w, http.StatusOK, stories)
}

func respondWithError(w http.ResponseWriter, code int, msg string) {
	respondWithJson(w, code, map[string]string{"error": msg})
}

func respondWithJson(w http.ResponseWriter, code int, payload interface{}) {
	response, _ := json.Marshal(payload)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	w.Write(response)
}

func main() {
  rtr := mux.NewRouter()
  rtr.HandleFunc(SERVICE_PATH + "/stories", AllStoriesEndPoint).Methods("GET")
  rtr.PathPrefix("/").Handler(http.FileServer(http.Dir("./static/")))
  http.Handle("/", rtr)
  http.ListenAndServe(PORT, context.ClearHandler(http.DefaultServeMux))
}
//drafter
//L9ll0V9hASrbu1Rs