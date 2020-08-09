package main

import (
  "context"
  "net/http"
  "github.com/gorilla/mux"
  "github.com/gorilla/websocket"
  "os"
  "io/ioutil"
  "time"
  "go.mongodb.org/mongo-driver/bson"
  "go.mongodb.org/mongo-driver/mongo"
  "go.mongodb.org/mongo-driver/mongo/options"
  //"go.mongodb.org/mongo-driver/mongo/readpref"

  "encoding/json"
  "log"
  "strings"
)


type Story struct {
	//ID          bson.ObjectId `bson:"_id" json:"id"`
	Title       string        `bson:"title" json:"title"`
  Body        string        `bson:"body"  json:"body"`
}

type User struct {
  //ID          bson.ObjectId `bson:"_id"   json:"id"`
  Login       string        `bson:"login" json:"login"`
  Name        string        `bson:"title"  json:"title"`
}

type SocketMessage struct {
  Command  string
	Data     Story
}

const (
  SERVICE_PATH = "/api"
  HTTP_PORT = ":85"
  SOCKET_DIR = "/ws"
  STORIES_COLLECTION = "stories"
  USERS_COLLECTION = "users"
  PING_TIMEOUT = 5000;
)

var conn *websocket.Conn

type Config struct {
  DBHost    string `json:"dbHost"`
  DBPort    string `json:"dbPort"`
  DBUser    string `json:"dbUser"`
  DBPass    string `json:"dbPass"`
  DBName    string `json:"dbName"`
}
var credentials = Config{}

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

func LoginEndPoint(w http.ResponseWriter, r *http.Request) {
  login := r.FormValue("user")
  pass := r.FormValue("pass")
  
  ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
  defer cancel()
  client, err := mongo.Connect(ctx, options.Client().ApplyURI("mongodb://" + credentials.DBHost + ":" + credentials.DBPort).SetAuth(options.Credential{
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
  filter := bson.M{"login": login, "pass":pass}
  ctx, cancel = context.WithTimeout(context.Background(), 5*time.Second)
  defer cancel()
  collection := client.Database(credentials.DBName).Collection(USERS_COLLECTION)
  err = collection.FindOne(ctx, filter).Decode(&result)
  if err != nil {
      log.Fatal(err)
  }
  log.Println(result)
  respondWithJson(w, http.StatusOK, result)
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
    switch m.Command {
      case "ping":
        go sendPong(conn)
      case "saveBody":
        go saveBody(conn, m.Data)
    }
  }
}

func sendPong(conn *websocket.Conn) {
  m := SocketMessage{}
  m.Command = "pong"
  if err := conn.WriteJSON(m); err != nil {
    log.Println("Error ponging")
    log.Println(err)
  }
}

func saveBody(conn *websocket.Conn, data Story) {
/*
  if len(data.ID) == 0 {
    log.Println("no story id passed")
    return
  }
  session, err := mgo.DialWithInfo(connection_info)
  if err != nil {
    log.Println(err.Error())
		return
	}
  defer session.Close()
  c := session.DB(DATABASE).C(STORIES_COLLECTION)
  p := bluemonday.NewPolicy()
  p.AllowStandardURLs()
  p.AllowAttrs("href").OnElements("a")
  p.AllowElements("div", "i", "b")
  p.AllowStyling()
  html := p.Sanitize(data.Body)
  err = c.Update(bson.M{"_id": data.ID}, bson.M{"$set": bson.M{"body": html}})
  if err != nil {
    log.Println(err.Error())
  }*/
}

func SetupWebsocket(w http.ResponseWriter, r *http.Request) {
	log.Println("Listening for socket on " + HTTP_PORT)
  hostname := strings.Split(r.Host, ":")[0]
  url := "ws://" + hostname + HTTP_PORT + SOCKET_DIR
  respondWithJson(w, http.StatusOK, map[string]string{"url": url})
}


  


func getConfiguration() {
	jsonFile, err := os.Open("config.json")
	if err != nil {
		log.Println(err)
	}
	defer jsonFile.Close()
	byteValue, _ := ioutil.ReadAll(jsonFile)
	json.Unmarshal(byteValue, &credentials)
 

}

func main() {
  log.Println("\n\n**********************START")
  log.Println("Listening for http on " + HTTP_PORT)
  getConfiguration();
  rtr := mux.NewRouter()
  rtr.HandleFunc(SERVICE_PATH + "/usr/login", LoginEndPoint).Methods("PUT")
  rtr.HandleFunc(SERVICE_PATH + "/stories", AllStoriesEndPoint).Methods("GET")
  rtr.HandleFunc(SERVICE_PATH + "/story/{[0-9a-zA-Z]+}", StoryEndPoint).Methods("GET")
  rtr.HandleFunc("/wsinit", SetupWebsocket).Methods("GET")
  rtr.HandleFunc(SOCKET_DIR, parseSocketData)
  rtr.PathPrefix("/").Handler(http.FileServer(http.Dir("./public/")))
  http.Handle("/", rtr)
  log.Fatal(http.ListenAndServe(HTTP_PORT, nil))
}