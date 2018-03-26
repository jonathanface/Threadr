package main

import (
  "net/http"
  "github.com/gorilla/mux"
  "github.com/gorilla/context"
  "time"
  mgo "gopkg.in/mgo.v2"
  "gopkg.in/mgo.v2/bson"
  "encoding/json"
  "log"
)


type Story struct {
	ID          bson.ObjectId `bson:"_id" json:"id"`
	Title       string        `bson:"title" json:"title"`
}

type User struct {
  ID          bson.ObjectId `bson:"_id"   json:"id"`
  Login       string        `bson:"login" json:"login"`
  Name        string        `bson:"name"  json:"name"`
}

const (
  SERVICE_PATH = "/api"
  PORT = ":85"
  USERNAME   = "drafter"
  PASSWORD   = "r00tm4st3r"
  DATABASE   = "drafty"
  STORIES_COLLECTION = "stories"
  USERS_COLLECTION = "users"
  
)

var host = []string{"127.0.0.1:27017"}
var connection_info = &mgo.DialInfo{
  Addrs:    host,
  Timeout:  60 * time.Second,
  Database: DATABASE,
  Username: USERNAME,
  Password: PASSWORD,
}
/*
func setSession(w http.ResponseWriter, r *http.Request, userID int, username string, timestamp int) {
  session, err := sessionStore.Get(r, BUMQUEST_SESSION_ID)
  if err != nil {
    serverError(w, err.Error())
    return
  }
  session.Values["id"] = userID
  session.Values["name"] = username
  session.Values["timestamp"] = timestamp
  session.Values["ip"] = r.RemoteAddr
  session.Save(r, w)
}*/

func AllStoriesEndPoint(w http.ResponseWriter, r *http.Request) {
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
  }
	respondWithJson(w, http.StatusOK, stories)
}

func LoginEndPoint(w http.ResponseWriter, r *http.Request) {
  login := r.FormValue("user")
  pass := r.FormValue("pass")
  session, err := mgo.DialWithInfo(connection_info)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
  defer session.Close()
  c := session.DB(DATABASE).C(USERS_COLLECTION)
  var users []User
	count, err := c.Find(bson.M{"login": login, "pass": pass}).Count()
  if err != nil {
    respondWithError(w, http.StatusInternalServerError, err.Error())
    return
  }
  if count == 0 {
    log.Print("not found")
    respondWithError(w, http.StatusNotFound, "No such user")
    return
  }
  respondWithJson(w, http.StatusOK, users)
  //setSession(w, r, 1, "player_1", 546546)
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
  rtr.HandleFunc(SERVICE_PATH + "/usr/login", LoginEndPoint).Methods("PUT")
  rtr.HandleFunc(SERVICE_PATH + "/stories", AllStoriesEndPoint).Methods("GET")
  rtr.PathPrefix("/").Handler(http.FileServer(http.Dir("./static/")))
  http.Handle("/", rtr)
  http.ListenAndServe(PORT, context.ClearHandler(http.DefaultServeMux))
}
//root
//L9ll0V9hASrbu1Rs