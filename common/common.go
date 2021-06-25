package common

import (
	"context"
	"encoding/json"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"io/ioutil"
	"log"
	"os"
	"sync"
	"time"
)

type Config struct {
	DBHost   string `json:"dbHost"`
	DBPort   string `json:"dbPort"`
	DBUser   string `json:"dbUser"`
	DBPass   string `json:"dbPass"`
	DBName   string `json:"dbName"`
	HttpPort string `json:"httpPort"`
}

// Potential data to be passed with socket messages
// Block - any DraftContentBlock
// Error - an error message
// ID - any relevant uuid
// Other - any other json data to pass along
type MessageData struct {
	Block       json.RawMessage `json:"block"`
	Association json.RawMessage `json:"association"`
	Error       json.RawMessage `json:"error"`
	ID          string          `json:"id"`
	Other       json.RawMessage `json:"other"`
}

type SocketMessage struct {
	Command string      `json:"command"`
	Data    MessageData `json:"data"`
}

type SocketError struct {
	Text string `json:"text"`
	ID   string `json:"id"`
}

type AllBlocks struct {
	StoryID primitive.ObjectID `json:"storyID" bson:"storyID,omitempty"`
	Body    DraftRawContent    `json:"body" bson:"body"`
}

type Block struct {
	Key      string             `json:"key" bson:"key"`
	Body     json.RawMessage    `json:"body" bson:"body"`
	Entities json.RawMessage    `json:"entities" bson:"entities"`
	StoryID  primitive.ObjectID `json:"storyID" bson:"storyID,omitempty"`
	Order    int                `json:"order" bson:"order,omitempty"`
}

type DraftEntityRange struct {
	Offset int `json:"offset"`
	Length int `json:"length"`
	Key    int `json:"key"`
}

type DraftInlineStyleRange struct {
	Offset int    `json:"offset"`
	Length int    `json:"length"`
	Style  string `json:"style"`
}

type DraftCharacterListItem struct {
	Style  []string `json:"style"`
	Entity string   `json:"entity"`
}

type DraftContentBlock struct {
	CharacterList     []DraftCharacterListItem `json:"characterList"`
	Data              map[string]string        `json:"data"`
	Depth             int                      `json:"depth"`
	EntityRanges      []DraftEntityRange       `json:"entityRanges"`
	InlineStyleRanges []DraftInlineStyleRange  `json:"inlineStyleRanges"`
	Key               string                   `json:"key"`
	Text              json.RawMessage          `json:"text"`
	Type              string                   `json:"type"`
}

type DraftEntity struct {
	Type       string            `json:"type"`
	Mutability string            `json:"mutability"`
	Data       map[string]string `json:"data"`
}

type DraftRawContent struct {
	Blocks    []DraftContentBlock `json:"blocks"`
	EntityMap map[int]DraftEntity `json:"entityMap"`
}

var credentials = Config{}

func SaveBlock(key string, body []byte, entities []byte, storyID primitive.ObjectID, order int) error {
	log.Println("save block", key, storyID)
	client, ctx, err := MongoConnect()
	if err != nil {
		log.Println("ERROR CONNECTING: ", err)
		return err
	}
	defer MongoDisconnect(client, ctx)
	blocks := client.Database("Drafty").Collection(storyID.Hex() + "_blocks")
	filter := &bson.M{"storyID": storyID, "key": key}
	opts := options.Update().SetUpsert(true)
	update := &bson.M{"$set": &bson.M{"key": key, "storyID": storyID, "body": body, "entities": entities, "order": order}}
	_, err = blocks.UpdateOne(context.Background(), filter, update, opts)
	if err != nil {
		return err
	}
	return nil
}

func PrepBlockForSave(jsonData MessageData, blockPipe chan SocketMessage) {
	block := Block{}
	json.Unmarshal([]byte(jsonData.Block), &block)
	log.Println("prepping", block.Key)
	response := SocketMessage{}
	response.Command = "singleSaveFailed"
	err := SaveBlock(block.Key, block.Body, block.Entities, block.StoryID, block.Order)
	if err == nil {
		response.Command = "singleSaveSuccessful"
		blockToJSON, err := json.Marshal(block)
		if err != nil {
			log.Println(err)
			response.Command = "singleSaveFailed"
			response.Data.Error = GenerateSocketError(err.Error(), block.Key)
		} else {
			response.Data.ID = block.Key
			response.Data.Block = blockToJSON
		}
	} else {
		log.Println(err)
		response.Data.Error = GenerateSocketError(err.Error(), block.Key)
	}
	blockPipe <- response
}

func ProcessMegaPaste(contentBlock DraftContentBlock,
	entityMap map[int]DraftEntity,
	wg *sync.WaitGroup,
	counter int,
	storyID primitive.ObjectID,
	blockPipe chan Block) {
	newBlock := Block{}
	newBlock.Key = contentBlock.Key
	newBlock.StoryID = storyID
	//-2 to account for start- and endline quotes
	for i := 0; i < len(contentBlock.Text)-2; i++ {
		listItem := DraftCharacterListItem{}
		for _, style := range contentBlock.InlineStyleRanges {
			if style.Offset+style.Length >= i {
				listItem.Style = append(listItem.Style, style.Style)
			}
		}
		contentBlock.CharacterList = append(contentBlock.CharacterList, listItem)
	}
	blockToJson, err := json.Marshal(contentBlock)
	if err != nil {
		log.Println("error marshalling")
	}
	newBlock.Body = blockToJson
	for _, ent := range contentBlock.EntityRanges {
		toJSON, err := json.Marshal(entityMap[ent.Key])
		if err != nil {
			log.Println(err)
			continue
		}
		newBlock.Entities = []byte(toJSON)
	}
	log.Println("processed", newBlock.Key)
	newBlock.Order = counter
	blockPipe <- newBlock
	wg.Done()
}

func GenerateSocketError(message string, id string) json.RawMessage {
	var se SocketError
	se.Text = message
	se.ID = id
	j, _ := json.Marshal(se)
	return json.RawMessage(j)
}

func LoadConfiguration() {
	jsonFile, err := os.Open("config.json")
	if err != nil {
		panic(err)
	}
	byteValue, _ := ioutil.ReadAll(jsonFile)
	json.Unmarshal(byteValue, &credentials)
	jsonFile.Close()
}

func GetHTTPPort() string {
	return credentials.HttpPort
}

func MongoConnect() (*mongo.Client, context.Context, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	uri := "mongodb+srv://" + credentials.DBUser + ":" + credentials.DBPass + "@" + credentials.DBHost + "/" + credentials.DBName + "?w=majority"
	log.Println(uri)
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
func MongoDisconnect(client *mongo.Client, ctx context.Context) error {
	if err := client.Disconnect(ctx); err != nil {
		return err
	}
	return nil
}
