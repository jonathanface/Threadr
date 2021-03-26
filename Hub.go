package main

import "log"
import "encoding/json"
import "RichDocter/API"

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
			m := SocketMessage{}
			json.Unmarshal(clientMessage.Message, &m)
			switch m.Command {
			case `savePage`:
				deets := API.Page{}
				json.Unmarshal([]byte(m.Data), &deets)
				response := SocketMessage{}
				response.Command = "saveFailed"
				err := savePage(deets.Page, deets.Body, deets.NovelID)
				if err == nil {
					response.Command = "saveSuccessful"
				} else {
					log.Println(err)
					response.Data = json.RawMessage(err.Error())
				}
				clientMessage.Client.conn.WriteJSON(response)
				break
			case `deletePage`:
				deets := API.Page{}
				json.Unmarshal([]byte(m.Data), &deets)
				response := SocketMessage{}
				response.Command = "deletionFailed"
				err := deletePage(deets.Page, deets.NovelID)
				if err == nil {
					response.Command = "deletionSuccessful"
				} else {
					log.Println(err)
					response.Data = json.RawMessage(err.Error())
				}
				clientMessage.Client.conn.WriteJSON(response)
				break
			case `fetchAssociations`:
				deets := API.ReadAssociation{}
				json.Unmarshal([]byte(m.Data), &deets)
				response := SocketMessage{}
				response.Command = "pushAssociations"
				assocs, err := fetchAssociations(deets.NovelID)
				if err == nil {
					j, _ := json.Marshal(assocs)
					response.Data = json.RawMessage(j)
				} else {
					log.Println(err)
				}
				clientMessage.Client.conn.WriteJSON(response)
				break
			case `newAssociation`:
				deets := API.WriteAssociation{}
				json.Unmarshal([]byte(m.Data), &deets)
				response := SocketMessage{}
				response.Command = "newAssociationFailed"
				err := createAssociation(deets.Text, deets.Type, deets.NovelID)
				if err == nil {
					response.Command = "pushAssociations"
					assocs, err := fetchAssociationsByType(deets.Type, deets.NovelID)
					if err == nil {
						j, _ := json.Marshal(assocs)
						response.Data = json.RawMessage(j)
					} else {
						log.Println(err)
					}
				} else {
					log.Println(err)
					response.Data = json.RawMessage(err.Error())
				}
				clientMessage.Client.conn.WriteJSON(response)
				break
			}
			break
		}
	}
}
