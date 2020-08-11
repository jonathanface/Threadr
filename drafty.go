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
  "strconv"
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

type Page struct {
  Page int    `json:"page" bson:"page"`
  Body json.RawMessage `json:"body" bson:"body"`
  NovelID int `json:"novelID" bson:"novelID"`
}
type SocketMessage struct {
  Command  string `json:"command"`
	Data     json.RawMessage `json:"data"`
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

func mongoConnect() (*mongo.Client, context.Context, error) {
  ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
  defer cancel()
  uri := "mongodb+srv://" + credentials.DBUser + ":" + credentials.DBPass + "@" + credentials.DBHost + "/" + credentials.DBName + "?w=majority"
  client, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
  if err != nil {
		return nil, nil, err
	}
  if err = client.Ping(ctx, nil); err != nil {
    return nil, nil, err
  }
  log.Println("Connected to MongoDB!")
  return client, ctx, nil
}
func mongoDisconnect(client *mongo.Client, ctx context.Context) error {
  if err := client.Disconnect(ctx); err != nil {
    return err
  }
  return nil
}

func AllPagesEndPoint(w http.ResponseWriter, r *http.Request) {
  sid := mux.Vars(r)["[0-9]+"]
  if len(sid) == 0 {
    respondWithError(w, http.StatusBadRequest, "No story ID received")
    return
  }
  novelID, err := strconv.Atoi(sid)
  if err != nil {
		respondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
  
  client, ctx, err := mongoConnect()
  if err != nil {
    respondWithError(w, http.StatusInternalServerError, err.Error())
		return
  }
  defer mongoDisconnect(client, ctx)
  pages := client.Database("Drafty").Collection("Pages")
  filter := &bson.M{"novelID": novelID}
  cur, err := pages.Find(context.TODO(), filter)
  if err != nil {
    respondWithError(w, http.StatusInternalServerError, err.Error())
		return
  }
  defer cur.Close(ctx)
  log.Println("cur", cur)
  var results []Page
  for cur.Next(context.TODO()) {
    //Create a value into which the single document can be decoded
    var p Page
    err := cur.Decode(&p)
    if err != nil {
      respondWithError(w, http.StatusInternalServerError, err.Error())
      return
    }
    results = append(results, p)
  }
  if len(results) == 0 {
    respondWithError(w, http.StatusNotFound, "No pages")
    return
  }
  respondWithJson(w, http.StatusOK, results)
}
  
func deletePage(pageNum int, novelID int) error {
  log.Println("delete page", pageNum, novelID)
  client, ctx, err := mongoConnect()
  if err != nil {
    log.Println("ERROR CONNECTING: ", err)
    return err
  }
  defer mongoDisconnect(client, ctx)
  pages := client.Database("Drafty").Collection("Pages")
  filter := &bson.M{"novelID": novelID, "page": pageNum}
  ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
  defer cancel()
  _, err = pages.DeleteOne(ctx, filter)
  return err
}  

func savePage(pageNum int, body []byte, novelID int) error {
  log.Println("save page", pageNum, body, novelID)
  client, ctx, err := mongoConnect()
  if err != nil {
    log.Println("ERROR CONNECTING: ", err)
    return err
  }
  defer mongoDisconnect(client, ctx)
  pages := client.Database("Drafty").Collection("Pages")
  filter := &bson.M{"novelID": novelID, "page": pageNum}
  ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
  defer cancel()
  result := Page{}
  err = pages.FindOne(ctx, filter).Decode(&result)
  if (err != nil) {
    log.Println("no page found")
    page := Page{pageNum, body, novelID}

    insertResult, err := pages.InsertOne(context.TODO(), page)
    if err != nil {
      log.Println("Error creating new page")
      return err
    }
    log.Println("Inserted a Single Document: ", insertResult.InsertedID)
    return nil
  }
  log.Println("found page", string(result.Body))
  update := bson.D{
    {"$set", bson.D{{"body", body}}},
  }
  _, err = pages.UpdateOne(context.TODO(), filter, update)
  return err
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
  
  hub := newHub()
	go hub.run()
  
  rtr := mux.NewRouter()
  rtr.HandleFunc(SERVICE_PATH + "/usr/login", LoginEndPoint).Methods("PUT")
  rtr.HandleFunc(SERVICE_PATH + "/stories", AllStoriesEndPoint).Methods("GET")
  rtr.HandleFunc(SERVICE_PATH + "/story/{[0-9]+}", StoryEndPoint).Methods("GET")
  rtr.HandleFunc(SERVICE_PATH + "/story/{[0-9]+}/pages", AllPagesEndPoint).Methods("GET")
  rtr.HandleFunc("/wsinit", SetupWebsocket).Methods("GET")
  http.HandleFunc(SOCKET_DIR, func(w http.ResponseWriter, r *http.Request) {
		serveWs(hub, w, r)
	})
  rtr.PathPrefix("/").Handler(http.FileServer(http.Dir("./public/")))
  http.Handle("/", rtr)
  log.Fatal(http.ListenAndServe(HTTP_PORT, nil))
}