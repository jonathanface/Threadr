package daos

import (
	"context"
	"errors"
	"testing"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// scanOutputForStory returns a single-row Scan output representing a stories
// table row for id, optionally with originalID set (empty = root row).
func scanOutputForStory(id, originalID string) *dynamodb.ScanOutput {
	item := map[string]types.AttributeValue{
		"story_id": &types.AttributeValueMemberS{Value: id},
		"author":   &types.AttributeValueMemberS{Value: "user@example.com"},
	}
	if originalID != "" {
		item["original_story_id"] = &types.AttributeValueMemberS{Value: originalID}
	}
	return &dynamodb.ScanOutput{
		Items: []map[string]types.AttributeValue{item},
	}
}

func TestRootStoryID_RootResolvesToSelf(t *testing.T) {
	mockDao := NewMockDAO()
	mockClient := mockDao.DynamoClient.(*MockDynamoClient)
	mockClient.MockScan = func(_ context.Context, _ *dynamodb.ScanInput, _ ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
		return scanOutputForStory("root-abc", ""), nil
	}

	got, err := mockDao.RootStoryID(context.Background(), "root-abc")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "root-abc" {
		t.Errorf("root should resolve to self, got %q want %q", got, "root-abc")
	}
}

func TestRootStoryID_ChildResolvesToParent(t *testing.T) {
	mockDao := NewMockDAO()
	mockClient := mockDao.DynamoClient.(*MockDynamoClient)
	mockClient.MockScan = func(_ context.Context, _ *dynamodb.ScanInput, _ ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
		return scanOutputForStory("child-xyz", "root-abc"), nil
	}

	got, err := mockDao.RootStoryID(context.Background(), "child-xyz")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "root-abc" {
		t.Errorf("child should resolve to parent, got %q want %q", got, "root-abc")
	}
}

func TestRootStoryID_UnknownStoryReturnsNotFound(t *testing.T) {
	mockDao := NewMockDAO()
	mockClient := mockDao.DynamoClient.(*MockDynamoClient)
	mockClient.MockScan = func(_ context.Context, _ *dynamodb.ScanInput, _ ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
		return &dynamodb.ScanOutput{Items: nil}, nil
	}

	_, err := mockDao.RootStoryID(context.Background(), "nope")
	if !errors.Is(err, ErrStoryNotFound) {
		t.Errorf("expected ErrStoryNotFound, got %v", err)
	}
}

func TestRootStoryID_PropagatesScanError(t *testing.T) {
	wantErr := errors.New("dynamo exploded")
	mockDao := NewMockDAO()
	mockClient := mockDao.DynamoClient.(*MockDynamoClient)
	mockClient.MockScan = func(_ context.Context, _ *dynamodb.ScanInput, _ ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
		return nil, wantErr
	}

	_, err := mockDao.RootStoryID(context.Background(), "any")
	if !errors.Is(err, wantErr) {
		t.Errorf("expected scan error to propagate, got %v", err)
	}
}
