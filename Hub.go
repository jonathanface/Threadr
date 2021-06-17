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

func generateSocketError(message string, id string) json.RawMessage {
	var se common.SocketError
	se.Text = message
	se.ID = id
	j, _ := json.Marshal(se)
	return json.RawMessage(j)
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
				json.Unmarshal([]byte(m.Data), &block)
				response := common.SocketMessage{}
				response.Command = "saveFailed"
				err := saveBlock(block.Key, block.Body, block.Entities, block.StoryID)
				if err == nil {
					response.Command = "saveSuccessful"
					response.Data = generateSocketError("", block.Key)
				} else {
					log.Println(err)
					response.Data = generateSocketError(err.Error(), block.Key)
				}
				clientMessage.Client.conn.WriteJSON(response)
				break
			case `saveAllBlocks`:
				allBlocks := API.AllBlocks{}
				json.Unmarshal([]byte(m.Data), &allBlocks)
				response := common.SocketMessage{}
				response.Command = "saveAllFailed"
				err := saveAllBlocks(allBlocks.Blocks, allBlocks.StoryID)
				if err == nil {
					response.Command = "saveAllSuccessful"
				} else {
					log.Println(err)
					response.Data = generateSocketError(err.Error(), "")
				}
				clientMessage.Client.conn.WriteJSON(response)
				break
			case `updateBlockOrder`:
				blockOrder := API.BlockOrder{}
				json.Unmarshal([]byte(m.Data), &blockOrder)
				response := common.SocketMessage{}
				response.Command = "saveOrderFailed"
				err := updateBlockOrder(blockOrder.Order, blockOrder.StoryID)
				if err == nil {
					response.Command = "saveOrderSuccessful"
				} else {
					log.Println(err)
					response.Data = generateSocketError(err.Error(), "")
				}
				clientMessage.Client.conn.WriteJSON(response)
				break
			case `deleteBlock`:
				deets := API.Block{}
				json.Unmarshal([]byte(m.Data), &deets)
				response := common.SocketMessage{}
				response.Command = "deletionFailed"
				err := deleteBlock(deets.Key, deets.StoryID)
				if err == nil {
					response.Command = "deletionSuccessful"
					response.Data = generateSocketError("", deets.Key)
				} else {
					log.Println(err)
					response.Data = generateSocketError(err.Error(), deets.Key)
				}
				clientMessage.Client.conn.WriteJSON(response)
				break
			case `fetchAssociations`:
				deets := API.Association{}
				json.Unmarshal([]byte(m.Data), &deets)
				response := common.SocketMessage{}
				response.Command = "fetchAssociationsFailed"
				assocs, err := fetchAssociations(deets.StoryID)
				if err == nil {
					response.Command = "pushAssociations"
					j, _ := json.Marshal(assocs)
					response.Data = json.RawMessage(j)
				} else {
					response.Data = generateSocketError(err.Error(), "")
				}
				clientMessage.Client.conn.WriteJSON(response)
				break
			case `newAssociation`:
				deets := API.Association{}
				json.Unmarshal([]byte(m.Data), &deets)
				response := common.SocketMessage{}
				response.Command = "newAssociationFailed"
				err := createAssociation(deets.Name, deets.Type, deets.StoryID)
				if err == nil {
					response.Command = "pushAssociations"
					assocs, err := fetchAssociations(deets.StoryID)
					if err == nil {
						j, _ := json.Marshal(assocs)
						response.Data = json.RawMessage(j)
					} else {
						response.Data = generateSocketError(err.Error(), "")
					}
				} else {
					log.Println(err)
					response.Data = generateSocketError(err.Error(), "")
				}
				clientMessage.Client.conn.WriteJSON(response)
				break
			case `removeAssociation`:
				deets := API.Association{}
				json.Unmarshal([]byte(m.Data), &deets)
				response := common.SocketMessage{}
				response.Command = "removeAssociationFailed"
				err := deleteAssociation(deets.ID)
				if err == nil {
					response.Command = "pushAssociations"
					assocs, err := fetchAssociations(deets.StoryID)
					if err == nil {
						j, _ := json.Marshal(assocs)
						response.Data = json.RawMessage(j)
					} else {
						response.Data = generateSocketError(err.Error(), deets.ID.Hex())
					}
				} else {
					log.Println(err)
					response.Data = generateSocketError(err.Error(), deets.ID.Hex())
				}
				clientMessage.Client.conn.WriteJSON(response)
				break
			}
			break
		}
	}
}
