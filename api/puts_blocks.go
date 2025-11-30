package api

import (
	ctxkey "RichDocter/ctxkeys"
	"RichDocter/daos"
	"RichDocter/logger"
	"RichDocter/models"
	"encoding/json"
	"net/http"
	"net/url"

	"github.com/aws/smithy-go"
	"github.com/gorilla/mux"
)

func RewriteBlockOrderEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		err     error
		storyID string
		dao     daos.DaoInterface
		ok      bool
	)
	if storyID, err = url.PathUnescape(mux.Vars(r)["story"]); err != nil {
		logger.Error("Failed to parse story ID", "error", err, "remoteAddr", r.RemoteAddr)
		RespondWithError(w, http.StatusInternalServerError, "Error parsing story name")
		return
	}
	if storyID == "" {
		logger.Warn("Missing story ID in request", "remoteAddr", r.RemoteAddr)
		RespondWithError(w, http.StatusBadRequest, "Missing story ID")
		return
	}

	decoder := json.NewDecoder(r.Body)
	blocksOrder := models.BlocksOrder{}
	if err := decoder.Decode(&blocksOrder); err != nil {
		logger.Error("Failed to decode blocks order", "error", err, "storyId", storyID, "remoteAddr", r.RemoteAddr)
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}

	logger.Info("RewriteBlockOrder request received",
		"storyId", storyID,
		"chapterId", blocksOrder.ChapterID,
		"blockCount", len(blocksOrder.Blocks),
		"remoteAddr", r.RemoteAddr)

	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		logger.Error("Failed to get DAO from context", "storyId", storyID, "remoteAddr", r.RemoteAddr)
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	if err = dao.ResetBlockOrder(r.Context(), storyID, &blocksOrder); err != nil {
		if opErr, ok := err.(*smithy.OperationError); ok {
			awsResponse := processAWSError(opErr)
			if awsResponse.Code == 0 {
				logger.Error("ResetBlockOrder AWS error",
					"error", err,
					"storyId", storyID,
					"chapterId", blocksOrder.ChapterID,
					"blockCount", len(blocksOrder.Blocks))
				RespondWithError(w, http.StatusInternalServerError, err.Error())
				return
			}
			logger.Error("ResetBlockOrder AWS validation error",
				"awsCode", awsResponse.Code,
				"awsMessage", awsResponse.Message,
				"storyId", storyID,
				"chapterId", blocksOrder.ChapterID)
			RespondWithError(w, awsResponse.Code, awsResponse.Message)
			return
		}
		logger.Error("ResetBlockOrder failed",
			"error", err,
			"storyId", storyID,
			"chapterId", blocksOrder.ChapterID,
			"blockCount", len(blocksOrder.Blocks))
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	logger.Info("RewriteBlockOrder completed successfully",
		"storyId", storyID,
		"chapterId", blocksOrder.ChapterID,
		"blockCount", len(blocksOrder.Blocks))
	RespondWithJson(w, http.StatusOK, nil)
}

func WriteBlocksToStoryEndpoint(w http.ResponseWriter, r *http.Request) {
	var (
		err     error
		storyID string
		dao     daos.DaoInterface
		ok      bool
		//subscriberID string
	)
	if storyID, err = url.PathUnescape(mux.Vars(r)["story"]); err != nil {
		logger.Error("Failed to parse story ID", "error", err, "remoteAddr", r.RemoteAddr)
		RespondWithError(w, http.StatusInternalServerError, "Error parsing story name")
		return
	}
	if storyID == "" {
		logger.Warn("Missing story ID in WriteBlocks request", "remoteAddr", r.RemoteAddr)
		RespondWithError(w, http.StatusBadRequest, "Missing story ID")
		return
	}
	decoder := json.NewDecoder(r.Body)
	storyBlocks := models.StoryBlocks{}
	if err = decoder.Decode(&storyBlocks); err != nil {
		logger.Error("Failed to decode story blocks", "error", err, "storyId", storyID, "remoteAddr", r.RemoteAddr)
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Count empty chunks to track potential blank paragraph issues
	emptyChunkCount := 0
	for _, block := range storyBlocks.Blocks {
		if len(block.Chunk) == 0 {
			emptyChunkCount++
		}
	}

	logger.Info("WriteBlocks request received",
		"storyId", storyID,
		"chapterId", storyBlocks.ChapterID,
		"blockCount", len(storyBlocks.Blocks),
		"emptyChunkCount", emptyChunkCount,
		"remoteAddr", r.RemoteAddr)

	if emptyChunkCount > 0 {
		logger.Warn("WriteBlocks request contains empty chunks",
			"storyId", storyID,
			"chapterId", storyBlocks.ChapterID,
			"emptyChunkCount", emptyChunkCount,
			"totalBlocks", len(storyBlocks.Blocks),
			"remoteAddr", r.RemoteAddr)
	}

	if dao, ok = r.Context().Value(ctxkey.DAO).(daos.DaoInterface); !ok {
		logger.Error("Failed to get DAO from context", "storyId", storyID, "remoteAddr", r.RemoteAddr)
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}

	if err = dao.WriteBlocks(r.Context(), storyID, &storyBlocks); err != nil {
		if opErr, ok := err.(*smithy.OperationError); ok {
			awsResponse := processAWSError(opErr)
			if awsResponse.Code == 0 {
				logger.Error("WriteBlocks AWS error",
					"error", err,
					"storyId", storyID,
					"chapterId", storyBlocks.ChapterID,
					"blockCount", len(storyBlocks.Blocks))
				RespondWithError(w, http.StatusInternalServerError, err.Error())
				return
			}
			logger.Error("WriteBlocks AWS validation error",
				"awsCode", awsResponse.Code,
				"awsMessage", awsResponse.Message,
				"storyId", storyID,
				"chapterId", storyBlocks.ChapterID)
			RespondWithError(w, awsResponse.Code, awsResponse.Message)
			return
		}
		logger.Error("WriteBlocks failed",
			"error", err,
			"storyId", storyID,
			"chapterId", storyBlocks.ChapterID,
			"blockCount", len(storyBlocks.Blocks))
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	logger.Info("WriteBlocks completed successfully",
		"storyId", storyID,
		"chapterId", storyBlocks.ChapterID,
		"blockCount", len(storyBlocks.Blocks))
	RespondWithJson(w, http.StatusOK, nil)
}
