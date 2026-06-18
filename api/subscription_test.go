package api

import (
	"testing"

	"Threadr/models"
)

func TestFilterSuspendedAssociations(t *testing.T) {
	tests := []struct {
		name string
		in   []*models.SimplifiedAssociation
		want int
	}{
		{
			name: "empty input → empty output",
			in:   nil,
			want: 0,
		},
		{
			name: "all visible → all kept",
			in: []*models.SimplifiedAssociation{
				{ID: "a"}, {ID: "b"}, {ID: "c"},
			},
			want: 3,
		},
		{
			name: "all suspended → all dropped",
			in: []*models.SimplifiedAssociation{
				{ID: "a", SuspendedAt: 100},
				{ID: "b", SuspendedAt: 200},
			},
			want: 0,
		},
		{
			name: "mixed → only visible kept",
			in: []*models.SimplifiedAssociation{
				{ID: "a"},
				{ID: "b", SuspendedAt: 100},
				{ID: "c"},
				{ID: "d", SuspendedAt: 200},
				{ID: "e"},
			},
			want: 3,
		},
		{
			name: "nil entries are skipped",
			in: []*models.SimplifiedAssociation{
				nil,
				{ID: "a"},
				nil,
			},
			want: 1,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := FilterSuspendedAssociations(tc.in)
			if len(got) != tc.want {
				t.Errorf("len(filtered) = %d, want %d", len(got), tc.want)
			}
			for _, a := range got {
				if a.SuspendedAt != 0 {
					t.Errorf("filtered entry %q has SuspendedAt=%d, expected 0", a.ID, a.SuspendedAt)
				}
			}
		})
	}
}
