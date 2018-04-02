package main

import (
  "net/http"
  "github.com/gorilla/mux"
  "github.com/gorilla/websocket"
  "time"
  mgo "gopkg.in/mgo.v2"
  "gopkg.in/mgo.v2/bson"
  "encoding/json"
  "log"
  "strings"
)


type Story struct {
	ID          bson.ObjectId `bson:"_id" json:"id"`
	Title       string        `bson:"title" json:"title"`
  Body        string        `bson:"body"  json:"body"`
}

type User struct {
  ID          bson.ObjectId `bson:"_id"   json:"id"`
  Login       string        `bson:"login" json:"login"`
  Name        string        `bson:"title"  json:"title"`
}

type SocketMessage struct {
	Data     string
}

const (
  SERVICE_PATH = "/api"
  HTTP_PORT = ":85"
  SOCKET_DIR = "/ws"
  DB_PORT = ":27017"
  DB_IP = "52.4.79.128"
  USERNAME   = "admin"
  PASSWORD   = "melchior"
  DATABASE   = "drafty"
  STORIES_COLLECTION = "stories"
  USERS_COLLECTION = "users"
  PING_TIMEOUT = 5000;
)

var host = []string{DB_IP + DB_PORT}
var connection_info = &mgo.DialInfo{
  Addrs:    host,
  Timeout:  60 * time.Second,
  Database: DATABASE,
  Username: USERNAME,
  Password: PASSWORD,
}

var conn *websocket.Conn

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
    return
  }
	respondWithJson(w, http.StatusOK, stories)
}

func StoryEndPoint(w http.ResponseWriter, r *http.Request) {
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
	respondWithJson(w, http.StatusOK, story)
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

func parseSocketData(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Upgrade(w, r, w.Header(), 1024, 1024)
  if err != nil {
		respondWithError(w, http.StatusBadRequest, err.Error())
	}
  for {
    err = conn.SetReadDeadline(time.Now().Add(5 * time.Second))
    m := SocketMessage{}
    err = conn.ReadJSON(&m)
    if err != nil {
      log.Println(err)
      conn.Close()
      return
    }
    log.Printf("Got message: %#v\n", m)
    if m.Data == "ping" {
      
      go sendPong(conn)
    }
  }
}

func sendPong(conn *websocket.Conn) {
  m := SocketMessage{}
  m.Data = "pong"
  if err := conn.WriteJSON(m); err != nil {
    log.Println("Error ponging")
    log.Println(err)
  }
}

func SetupWebsocket(w http.ResponseWriter, r *http.Request) {
	log.Println("Listening for socket on " + HTTP_PORT)
  hostname := strings.Split(r.Host, ":")[0]
  url := "ws://" + hostname + HTTP_PORT + SOCKET_DIR
  respondWithJson(w, http.StatusOK, map[string]string{"url": url})
}

func main() {
  log.Println("\n\n**********************START")
  log.Println("Listening for http on " + HTTP_PORT)
  rtr := mux.NewRouter()
  rtr.HandleFunc(SERVICE_PATH + "/usr/login", LoginEndPoint).Methods("PUT")
  rtr.HandleFunc(SERVICE_PATH + "/stories", AllStoriesEndPoint).Methods("GET")
  rtr.HandleFunc(SERVICE_PATH + "/story/{[0-9a-zA-Z]+}", StoryEndPoint).Methods("GET")
  rtr.HandleFunc("/wsinit", SetupWebsocket).Methods("GET")
  rtr.HandleFunc(SOCKET_DIR, parseSocketData)
  rtr.PathPrefix("/").Handler(http.FileServer(http.Dir("./static/")))
  http.Handle("/", rtr)
  log.Fatal(http.ListenAndServe(HTTP_PORT, nil))
}