package api

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"net/url"

	ctxkey "Threadr/ctxkeys"
	"Threadr/daos"
	"Threadr/logger"

	"github.com/aws/smithy-go"
	"github.com/gorilla/mux"
)

// loadOwnedShareLink runs the auth + token-parse + ownership-check preamble
// shared by every per-token share-link endpoint. On any failure it sends an
// appropriate HTTP error and returns ok=false; callers should just return.
// On success it returns the DAO, the SHA-256 hash of the URL token, and a
// nil-checked indication that the authenticated user owns the link.
//
// The action label ("revoke", "restore", "delete") is interpolated into the
// 403 message when ownership doesn't match.
func loadOwnedShareLink(
	w http.ResponseWriter,
	r *http.Request,
	action string,
) (dao daos.DaoInterface, tokenHash string, ok bool) {
	email, err := getUserEmail(r)
	if err != nil {
		logger.Error("Authentication failed", "error", err)
		RespondWithError(w, http.StatusUnauthorized, "Authentication failed")
		return nil, "", false
	}
	rawToken, err := url.PathUnescape(mux.Vars(r)["token"])
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing token")
		return nil, "", false
	}
	if rawToken == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing token")
		return nil, "", false
	}
	tokenHash = HashShareToken(rawToken)
	dao, daoOK := r.Context().Value(ctxkey.DAO).(daos.DaoInterface)
	if !daoOK {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return nil, "", false
	}

	link, err := dao.GetShareLink(r.Context(), tokenHash)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			RespondWithError(w, http.StatusNotFound, "share link not found")
			return nil, "", false
		}
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return nil, "", false
	}
	if link.AuthorEmail != email {
		RespondWithError(w, http.StatusForbidden, "You do not have permission to "+action+" this share link")
		return nil, "", false
	}
	return dao, tokenHash, true
}

// loadOwnedComment runs the auth + commentID-parse + ownership-check preamble
// shared by every per-comment endpoint. On any failure it sends an appropriate
// HTTP error and returns ok=false; callers should just return.
//
// The action label ("resolve", "delete") is interpolated into the 403 message
// when ownership doesn't match.
func loadOwnedComment(
	w http.ResponseWriter,
	r *http.Request,
	action string,
) (dao daos.DaoInterface, commentID string, ok bool) {
	email, err := getUserEmail(r)
	if err != nil {
		logger.Error("Authentication failed", "error", err)
		RespondWithError(w, http.StatusUnauthorized, "Authentication failed")
		return nil, "", false
	}
	commentID, err = url.PathUnescape(mux.Vars(r)["commentID"])
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Error parsing comment ID")
		return nil, "", false
	}
	if commentID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing comment ID")
		return nil, "", false
	}
	dao, daoOK := r.Context().Value(ctxkey.DAO).(daos.DaoInterface)
	if !daoOK {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return nil, "", false
	}

	comment, err := dao.GetComment(r.Context(), commentID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			RespondWithError(w, http.StatusNotFound, "comment not found")
			return nil, "", false
		}
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return nil, "", false
	}
	if _, err = dao.GetStoryByID(r.Context(), email, comment.StoryID); err != nil {
		RespondWithError(w, http.StatusForbidden, "You do not have permission to "+action+" this comment")
		return nil, "", false
	}
	return dao, commentID, true
}

// listResource is the shared "list everything for the authenticated user" flow:
// auth + DAO context + user-existence check + DAO list call + AWS-error-aware
// response. It runs the supplied fetch closure and writes the result as JSON.
func listResource[T any](
	w http.ResponseWriter,
	r *http.Request,
	fetch func(ctx context.Context, dao daos.DaoInterface, email string) ([]T, error),
) {
	email, err := getUserEmail(r)
	if err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}
	dao, ok := r.Context().Value(ctxkey.DAO).(daos.DaoInterface)
	if !ok {
		RespondWithError(w, http.StatusInternalServerError, "unable to parse or retrieve dao from context")
		return
	}
	if _, err = dao.GetUserDetails(r.Context(), email); err != nil {
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}

	result, err := fetch(r.Context(), dao, email)
	if err != nil {
		opErr := &smithy.OperationError{}
		if errors.As(err, &opErr) {
			awsResponse := processAWSError(opErr)
			if awsResponse.Code == 0 {
				logger.Error("Internal error", "error", err)
				RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
				return
			}
			RespondWithError(w, awsResponse.Code, awsResponse.Message)
			return
		}
		logger.Error("Internal error", "error", err)
		RespondWithError(w, http.StatusInternalServerError, "An internal error occurred")
		return
	}

	RespondWithJSON(w, http.StatusOK, result)
}
