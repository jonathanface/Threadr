package api

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	ctxkey "Threadr/ctxkeys"
	"Threadr/daos"

	"github.com/gorilla/mux"
)

func TestContextPreservation(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	// Create request
	req := httptest.NewRequest(http.MethodPost, "/test", nil)
	fmt.Printf("1. Initial context DAO: %v\n", req.Context().Value(ctxkey.DAO))

	// Set URL vars
	req = mux.SetURLVars(req, map[string]string{"id": "123"})
	fmt.Printf("2. After SetURLVars DAO: %v\n", req.Context().Value(ctxkey.DAO))
	fmt.Printf("2. After SetURLVars vars: %v\n", mux.Vars(req))

	// Add DAO to context
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))
	fmt.Printf("3. After WithContext DAO: %v\n", req.Context().Value(ctxkey.DAO))
	fmt.Printf("3. After WithContext vars: %v\n", mux.Vars(req))

	// Add session cookie
	req = AddSessionCookieToRequest(req, "test@example.com")
	fmt.Printf("4. After AddSession DAO: %v\n", req.Context().Value(ctxkey.DAO))
	fmt.Printf("4. After AddSession vars: %v\n", mux.Vars(req))

	// Verify
	dao, ok := req.Context().Value(ctxkey.DAO).(*daos.MockDAO)
	if !ok || dao == nil {
		t.Errorf("DAO not found in context after all operations")
	}
}
