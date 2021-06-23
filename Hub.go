package main

import "log"
import "encoding/json"
import "RichDocter/API"
import "RichDocter/common"

// Hub maintains the set of active clients and broadcasts messages to the
// clients.
type Hub struct {
	// Registered clients.
	clients map[*Client]bool

	// Inbound messages from the clients.
	broadcast chan *ClientMessage

	// Register requests from the clients.
	register chan *Client

	// Unregister requests from clients.
	unregister chan *Client
}

func newHub() *Hub {
	return &Hub{
		broadcast:  make(chan *ClientMessage),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		clients:    make(map[*Client]bool),
	}
}

func (h *Hub) run() {
	for {
		select {
		case client := <-h.register:
			log.Println("register client")
			h.clients[client] = true
			break
		case client := <-h.unregister:
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			break
		case clientMessage := <-h.broadcast:
			m := common.SocketMessage{}
			json.Unmarshal(clientMessage.Message, &m)
			switch m.Command {
			case `saveBlock`:
				block := API.Block{}
				json.Unmarshal([]byte(m.Data.Block), &block)
				response := common.SocketMessage{}
				response.Command = "singleSaveFailed"
				err := saveBlock(block.Key, block.Body, block.Entities, block.StoryID, block.Order)
				if err == nil {
					response.Command = "singleSaveSuccessful"
					blockToJSON, err := json.Marshal(block)
					if err != nil {
						log.Println(err)
						response.Command = "singleSaveFailed"
						response.Data.Error = common.GenerateSocketError(err.Error(), block.Key)
					} else {
						response.Data.ID = block.Key
						response.Data.Block = blockToJSON
					}
				} else {
					log.Println(err)
					response.Data.Error = common.GenerateSocketError(err.Error(), block.Key)
				}
				clientMessage.Client.conn.WriteJSON(response)
				break
			case `saveAllBlocks`:
				blockPipe := make(chan common.Block)
				go common.ProcessMegaPaste(blockPipe, []byte(m.Data.Other))
				response := common.SocketMessage{}
				counter := 0
				for {
					newBlock := <-blockPipe
					response.Command = "blockSaveFailed"
					errors := false
					err := saveBlock(newBlock.Key, []byte(newBlock.Body), newBlock.Entities, newBlock.StoryID, counter)
					counter++
					if err != nil {
						log.Println("error", err.Error())
						errors = true
						response.Data.Error = common.GenerateSocketError(err.Error(), newBlock.Key)
					}
					blockToJSON, err := json.Marshal(newBlock)
					if err != nil {
						log.Println("error", err.Error())
						errors = true
						response.Data.Error = common.GenerateSocketError(err.Error(), newBlock.Key)
					}
					if errors == false {
						response.Command = "blockSaved"
						response.Data.ID = newBlock.Key
						response.Data.Block = blockToJSON
					}
					clientMessage.Client.conn.WriteJSON(response)
					// An order param of -1 indicates all blocks have been processed
					// and the loop should terminate.
					if newBlock.Order == -1 {
						log.Println("close block pipe")
						close(blockPipe)
						break
					}
				}
				break
			case `updateBlockOrder`:
				blockOrder := API.BlockOrder{}
				json.Unmarshal([]byte(m.Data.Other), &blockOrder)
				response := common.SocketMessage{}
				response.Command = "saveOrderFailed"
				err := updateBlockOrder(blockOrder.Order, blockOrder.StoryID)
				if err == nil {
					response.Command = "saveOrderSuccessful"
				} else {
					log.Println(err)
					response.Data.Error = common.GenerateSocketError(err.Error(), "")
				}
				clientMessage.Client.conn.WriteJSON(response)
				break
			case `deleteBlock`:
				deets := API.Block{}
				json.Unmarshal([]byte(m.Data.Block), &deets)
				response := common.SocketMessage{}
				response.Command = "singleDeletionFailed"
				err := deleteBlock(deets.Key, deets.StoryID)
				if err == nil {
					response.Command = "singleDeletionSuccessful"
					response.Data.ID = deets.Key
				} else {
					log.Println(err)
					response.Data.Error = common.GenerateSocketError(err.Error(), deets.Key)
				}
				clientMessage.Client.conn.WriteJSON(response)
				break
			case `fetchAssociations`:
				deets := API.Association{}
				json.Unmarshal([]byte(m.Data.Other), &deets)
				response := common.SocketMessage{}
				response.Command = "fetchAssociationsFailed"
				assocs, err := fetchAssociations(deets.StoryID)
				if err == nil {
					response.Command = "pushAssociations"
					j, _ := json.Marshal(assocs)
					response.Data.Other = json.RawMessage(j)
				} else {
					response.Data.Error = common.GenerateSocketError(err.Error(), "")
				}
				clientMessage.Client.conn.WriteJSON(response)
				break
			case `newAssociation`:
				deets := API.Association{}
				json.Unmarshal([]byte(m.Data.Other), &deets)
				response := common.SocketMessage{}
				response.Command = "newAssociationFailed"
				err := createAssociation(deets.Name, deets.Type, deets.StoryID)
				if err == nil {
					response.Command = "pushAssociations"
					assocs, err := fetchAssociations(deets.StoryID)
					if err == nil {
						j, _ := json.Marshal(assocs)
						response.Data.Other = json.RawMessage(j)
					} else {
						response.Data.Error = common.GenerateSocketError(err.Error(), "")
					}
				} else {
					log.Println(err)
					response.Data.Error = common.GenerateSocketError(err.Error(), "")
				}
				clientMessage.Client.conn.WriteJSON(response)
				break
			case `removeAssociation`:
				deets := API.Association{}
				json.Unmarshal([]byte(m.Data.Other), &deets)
				response := common.SocketMessage{}
				response.Command = "removeAssociationFailed"
				response.Data.ID = deets.ID.Hex()
				err := deleteAssociation(deets.ID)
				if err == nil {
					response.Command = "pushAssociations"
					assocs, err := fetchAssociations(deets.StoryID)
					if err == nil {
						j, _ := json.Marshal(assocs)
						response.Data.Other = json.RawMessage(j)
					} else {
						response.Data.Error = common.GenerateSocketError(err.Error(), deets.ID.Hex())
					}
				} else {
					log.Println(err)
					response.Data.Error = common.GenerateSocketError(err.Error(), deets.ID.Hex())
				}
				clientMessage.Client.conn.WriteJSON(response)
				break
			}
			break
		}
	}
}
