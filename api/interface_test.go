package api

import (
	ctxkey "Threadr/ctxkeys"
	"Threadr/daos"
	"context"
	"fmt"
	"net/http/httptest"
	"testing"
)

func TestDAOInterfaceAssertion(t *testing.T) {
	mockDAO := daos.NewMockDAO()

	// Create request with DAO in context
	req := httptest.NewRequest("POST", "/test", nil)
	req = req.WithContext(context.WithValue(req.Context(), ctxkey.DAO, mockDAO))

	// Try the same type assertion the endpoint uses
	dao, ok := req.Context().Value(ctxkey.DAO).(daos.DaoInterface)
	fmt.Printf("Type assertion result: ok=%v, dao=%v\n", ok, dao != nil)

	if !ok {
		t.Errorf("Failed to assert daos.MockDAO as daos.DaoInterface")
	}
}