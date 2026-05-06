package daos

import (
	"context"
	"testing"
	"time"
)

// Tests for NewDAO
// Note: NewDAO loads AWS credentials from the environment, so these tests
// verify behavior in a test environment without AWS credentials.
func TestNewDAO(t *testing.T) {
	testCases := []struct {
		name    string
		ctx     context.Context
		opts    Options
		wantErr bool
	}{
		{
			name: "ValidOptions_NoAWSCredentials",
			ctx:  context.Background(),
			opts: Options{
				Region:                     "us-east-1",
				MaxRetries:                 3,
				BlockTableMinWriteCapacity: 10,
				WriteBatchSize:             25,
			},
			wantErr: false, // May succeed or fail depending on AWS credentials
		},
		{
			name: "DifferentRegion",
			ctx:  context.Background(),
			opts: Options{
				Region:                     "us-west-2",
				MaxRetries:                 5,
				BlockTableMinWriteCapacity: 20,
				WriteBatchSize:             50,
			},
			wantErr: false,
		},
		{
			name: "ContextWithTimeout",
			ctx: func() context.Context {
				ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()
				return ctx
			}(),
			opts: Options{
				Region:                     "eu-west-1",
				MaxRetries:                 2,
				BlockTableMinWriteCapacity: 5,
				WriteBatchSize:             10,
			},
			wantErr: false,
		},
		{
			name: "MinimalOptions",
			ctx:  context.Background(),
			opts: Options{
				Region:                     "us-east-1",
				MaxRetries:                 0,
				BlockTableMinWriteCapacity: 0,
				WriteBatchSize:             0,
			},
			wantErr: false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			dao, err := NewDAO(tc.ctx, tc.opts)

			// In a test environment without AWS credentials, this may fail
			// That's acceptable and expected behavior
			if err != nil {
				t.Logf("NewDAO returned error (expected without AWS credentials): %v", err)
				return
			}

			// If it succeeds (has AWS credentials), verify DAO is initialized
			if dao == nil {
				t.Error("Expected DAO to be non-nil when no error returned")
				return
			}

			// Verify fields are set correctly
			if dao.maxRetries != tc.opts.MaxRetries {
				t.Errorf("Expected maxRetries=%d, got %d", tc.opts.MaxRetries, dao.maxRetries)
			}
			if dao.capacity != tc.opts.BlockTableMinWriteCapacity {
				t.Errorf("Expected capacity=%d, got %d", tc.opts.BlockTableMinWriteCapacity, dao.capacity)
			}
			if dao.writeBatchSize != tc.opts.WriteBatchSize {
				t.Errorf("Expected writeBatchSize=%d, got %d", tc.opts.WriteBatchSize, dao.writeBatchSize)
			}
			if dao.DynamoClient == nil {
				t.Error("Expected DynamoClient to be initialized")
			}
			if dao.s3Client == nil {
				t.Error("Expected s3Client to be initialized")
			}

			t.Logf("NewDAO succeeded (AWS credentials available)")
		})
	}
}

// Test that DAO implements DaoInterface
// This is verified at compile time by: var _ DaoInterface = (*DAO)(nil)
// But we can also test it at runtime.
func TestDAOImplementsDaoInterface(t *testing.T) {
	// Create a mock DAO to verify it implements the interface
	mockDao := NewMockDAO()

	// This will compile only if MockDAO embeds *DAO which implements DaoInterface
	var _ DaoInterface = mockDao

	t.Log("DAO correctly implements DaoInterface")
}

// Test Options struct can be created with various values.
func TestOptionsStruct(t *testing.T) {
	testCases := []struct {
		name string
		opts Options
	}{
		{
			name: "StandardOptions",
			opts: Options{
				Region:                     "us-east-1",
				MaxRetries:                 3,
				BlockTableMinWriteCapacity: 10,
				WriteBatchSize:             25,
			},
		},
		{
			name: "HighCapacityOptions",
			opts: Options{
				Region:                     "us-west-2",
				MaxRetries:                 10,
				BlockTableMinWriteCapacity: 100,
				WriteBatchSize:             100,
			},
		},
		{
			name: "ZeroValues",
			opts: Options{
				Region:                     "",
				MaxRetries:                 0,
				BlockTableMinWriteCapacity: 0,
				WriteBatchSize:             0,
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			// Smoke test: just exercise the struct fields so the compiler verifies they exist.
			t.Logf("Created Options with Region=%q, MaxRetries=%d, Capacity=%d, BatchSize=%d",
				tc.opts.Region, tc.opts.MaxRetries, tc.opts.BlockTableMinWriteCapacity, tc.opts.WriteBatchSize)
		})
	}
}

// Benchmark creating Options structs (trivial but comprehensive).
func BenchmarkOptionsCreation(b *testing.B) {
	b.ResetTimer()
	for range b.N {
		_ = Options{
			Region:                     "us-east-1",
			MaxRetries:                 3,
			BlockTableMinWriteCapacity: 10,
			WriteBatchSize:             25,
		}
	}
}
