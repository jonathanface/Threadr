package common

import (
	"context"
	"encoding/json"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"log"
	"sync"
)

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

func DeleteAllBlocks(client *mongo.Client, storyID primitive.ObjectID) error {
	blocks := client.Database("Drafty").Collection(storyID.Hex() + "_blocks")
	return blocks.Drop(context.Background())
}

func SaveBlock(client *mongo.Client, key string, body []byte, entities []byte, storyID primitive.ObjectID, order int) error {
	log.Println("save block", key, storyID)
	blocks := client.Database("Drafty").Collection(storyID.Hex() + "_blocks")
	filter := &bson.M{"storyID": storyID, "key": key}
	opts := options.Update().SetUpsert(true)
	update := &bson.M{"$set": &bson.M{"key": key, "storyID": storyID, "body": body, "entities": entities, "order": order}}
	_, err := blocks.UpdateOne(context.Background(), filter, update, opts)
	return err
}

func PrepBlockForSave(client *mongo.Client, jsonData MessageData, blockPipe chan SocketMessage) {
	block := Block{}
	json.Unmarshal([]byte(jsonData.Block), &block)
	log.Println("prepping", block.Key)
	response := SocketMessage{}
	response.Command = "singleSaveFailed"
	err := SaveBlock(client, block.Key, block.Body, block.Entities, block.StoryID, block.Order)
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
	for v, ent := range contentBlock.EntityRanges {
		log.Println("map index", v, ent)
		toJSON, err := json.Marshal(entityMap)
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
