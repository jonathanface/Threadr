package api

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"

	ctxkey "Threadr/ctxkeys"
	"Threadr/daos"
	"Threadr/logger"
	"Threadr/models"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/gorilla/mux"
)

//nolint:funlen // OpenAI request orchestration: param parsing, block fetch, prompt build, request, parsing.
func AnalyzeChapterEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		err            error
		storyID        string
		chapterID      string
		dao            daos.DaoInterface
		ok             bool
		typeOfAnalysis string
	)
	if storyID, err = url.PathUnescape(mux.Vars(r)["storyID"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing story ID")
		return
	}
	if storyID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing story ID")
		return
	}
	if chapterID, err = url.PathUnescape(mux.Vars(r)["chapterID"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing chapter ID")
		return
	}
	if chapterID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing chapter ID")
		return
	}
	if typeOfAnalysis, err = url.PathUnescape(mux.Vars(r)["type"]); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing analysis type")
		return
	}
	if typeOfAnalysis == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing analysis type")
		return
	}
	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	blocks, err := staggeredStoryBlockRetrieval(r.Context(), dao, storyID, chapterID, nil, nil)
	if err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}

	chapterText := ""
	var chapterTextSb65 strings.Builder
	for _, block := range blocks.Items {
		chunkAttributeValue, ok := block["chunk"].(*types.AttributeValueMemberS) //nolint:govet
		if !ok {
			continue // Skip this item or handle the error as appropriate
		}
		chk := models.Chunk{}
		err := json.Unmarshal([]byte(chunkAttributeValue.Value), &chk) //nolint:govet
		if err != nil {
			logger.Error("Internal error", "error", err)
			RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
			return
		}
		chapterTextSb65.WriteString(chk.Text)
	}
	chapterText += chapterTextSb65.String()
	if chapterText == "" {
		RespondWithError(w, http.StatusUnprocessableEntity, "Cannot process chapter")
		return
	}
	openAIKey := os.Getenv("OPENAI_API_KEY")
	url := "https://api.openai.com/v1/chat/completions"

	// A helpful rule of thumb is that one token generally corresponds to ~4 characters of text for common English text. This translates to roughly ¾ of a word (so 100 tokens ~= 75 words).

	var instructions, content string
	switch typeOfAnalysis {
	case "analyze":
		{
			instructions = "You are a story editor, skilled in explaining complex narrative formulas and detecting story flaws."
			content = "Evaluate the following story chapter in less than 300 words, considering that it may be an unfinished sample or a work in progress: " + chapterText
		}
	case "propose":
		{
			instructions = "You are a story outliner, skilled in crafting compelling plots with interesting characters and twists."
			content = "Provide some options of what should happen next in the following unfinished story chapter in less than 300 words: " + chapterText
		}
	}
	// Data structure that matches the JSON payload structure of the request
	payload := map[string]any{
		"model": "gpt-3.5-turbo",
		"messages": []map[string]string{
			{
				"role":    "system",
				"content": instructions,
			},
			{
				"role":    "user",
				"content": content,
			},
		},
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}

	// Create a new HTTP request with the appropriate method, URL, and payload
	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, url, bytes.NewBuffer(jsonData))
	if err != nil {
		logger.Error("External service error", "error", err)
		RespondWithError(w, http.StatusBadGateway, "External service error")
		return
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+openAIKey)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		logger.Error("External service error", "error", err)
		RespondWithError(w, http.StatusBadGateway, "External service error")
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		logger.Error("External service error", "error", err)
		RespondWithError(w, http.StatusBadGateway, "External service error")
		return
	}
	var response models.OpenAIResponse
	err = json.Unmarshal(body, &response)
	if err != nil {
		// Handle error
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	if len(response.Choices) > 0 && response.Choices[0].Message.Content != "" {
		RespondWithJSON(w, http.StatusOK, response.Choices[0].Message)
	} else {
		RespondWithError(w, http.StatusNoContent, "invalid response from gpt")
	}
}
