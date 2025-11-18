package converters

import (
	"strings"
	"testing"
)

// Tests for sanitizeFilename - CRITICAL SECURITY FUNCTION
func TestSanitizeFilename(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "simple valid filename",
			input:    "MyDocument",
			expected: "MyDocument",
		},
		{
			name:     "filename with spaces replaced",
			input:    "My Document Name",
			expected: "My_Document_Name",
		},
		{
			name:     "filename with underscores preserved",
			input:    "my_document_name",
			expected: "my_document_name",
		},
		{
			name:     "filename with hyphens preserved",
			input:    "my-document-name",
			expected: "my-document-name",
		},
		{
			name:     "path traversal with forward slash",
			input:    "../../../etc/passwd",
			expected: "______etc_passwd",
		},
		{
			name:     "path traversal with backslash",
			input:    "..\\..\\..\\windows\\system32",
			expected: "______windows_system32",
		},
		{
			name:     "mixed path separators",
			input:    "../folder\\file",
			expected: "__folder_file", // ../ becomes __, \\ becomes _
		},
		{
			name:     "dot dot sequences",
			input:    "file..name",
			expected: "file_name", // .. becomes _
		},
		{
			name:     "special characters removed",
			input:    "file@#$%^&*()name",
			expected: "file_________name", // @#$%^&*() = 9 chars
		},
		{
			name:     "unicode characters replaced",
			input:    "файл名前",
			expected: "______", // unicode chars get replaced
		},
		{
			name:     "filename with extension-like dots",
			input:    "document.txt",
			expected: "document_txt",
		},
		{
			name:     "very long filename truncated to 64 chars",
			input:    strings.Repeat("a", 100),
			expected: strings.Repeat("a", 64),
		},
		{
			name:     "exactly 64 characters",
			input:    strings.Repeat("b", 64),
			expected: strings.Repeat("b", 64),
		},
		{
			name:     "65 characters truncated to 64",
			input:    strings.Repeat("c", 65),
			expected: strings.Repeat("c", 64),
		},
		{
			name:     "empty string",
			input:    "",
			expected: "",
		},
		{
			name:     "only special characters",
			input:    "@#$%^&*()",
			expected: "_________",
		},
		{
			name:     "SQL injection attempt",
			input:    "'; DROP TABLE users; --",
			expected: "___DROP_TABLE_users__--", // -- stays as is (hyphen allowed)
		},
		{
			name:     "XSS attempt",
			input:    "<script>alert('xss')</script>",
			expected: "_script_alert__xss____script_",
		},
		{
			name:     "null byte attempt",
			input:    "file\x00name",
			expected: "file_name",
		},
		{
			name:     "newline and tab",
			input:    "file\nwith\ttabs",
			expected: "file_with_tabs",
		},
		{
			name:     "leading dots",
			input:    "...hidden",
			expected: "__hidden", // first .. becomes _, third . becomes _
		},
		{
			name:     "trailing dots",
			input:    "file...",
			expected: "file__", // .. becomes _, then one more . becomes _
		},
		{
			name:     "colon (drive separator on Windows)",
			input:    "C:file",
			expected: "C_file",
		},
		{
			name:     "pipe character",
			input:    "file|name",
			expected: "file_name",
		},
		{
			name:     "angle brackets",
			input:    "file<>name",
			expected: "file__name",
		},
		{
			name:     "quotes",
			input:    "file\"name'here",
			expected: "file_name_here",
		},
		{
			name:     "question and asterisk",
			input:    "file?name*here",
			expected: "file_name_here",
		},
		{
			name:     "multiple consecutive special chars",
			input:    "file@@@name",
			expected: "file___name",
		},
		{
			name:     "numbers are preserved",
			input:    "file123name456",
			expected: "file123name456",
		},
		{
			name:     "mixed case preserved",
			input:    "MyFileNameHere",
			expected: "MyFileNameHere",
		},
		{
			name:     "semicolon",
			input:    "file;name",
			expected: "file_name",
		},
		{
			name:     "ampersand",
			input:    "file&name",
			expected: "file_name",
		},
		{
			name:     "equals sign",
			input:    "file=name",
			expected: "file_name",
		},
		{
			name:     "plus sign",
			input:    "file+name",
			expected: "file_name",
		},
		{
			name:     "percent sign",
			input:    "file%20name",
			expected: "file_20name",
		},
		{
			name:     "realistic malicious path",
			input:    "../../tmp/malicious.sh",
			expected: "____tmp_malicious_sh", // each ../ becomes __
		},
		{
			name:     "Windows UNC path",
			input:    "\\\\server\\share\\file",
			expected: "__server_share_file", // each \\ becomes _
		},
		{
			name:     "URL-like input",
			input:    "http://evil.com/file",
			expected: "http___evil_com_file",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := sanitizeFilename(tt.input)
			if got != tt.expected {
				t.Errorf("sanitizeFilename(%q) = %q, want %q", tt.input, got, tt.expected)
			}

			// Additional security checks
			if strings.Contains(got, "..") {
				t.Errorf("sanitized filename still contains '..': %q", got)
			}
			if strings.Contains(got, "/") {
				t.Errorf("sanitized filename still contains '/': %q", got)
			}
			if strings.Contains(got, "\\") {
				t.Errorf("sanitized filename still contains '\\': %q", got)
			}
			if len(got) > 64 {
				t.Errorf("sanitized filename exceeds 64 chars: len=%d", len(got))
			}
		})
	}
}

// Test that sanitizeFilename is deterministic
func TestSanitizeFilename_Deterministic(t *testing.T) {
	inputs := []string{
		"test file.txt",
		"../path/traversal",
		"special@#$chars",
		"very" + strings.Repeat("long", 20),
	}

	for _, input := range inputs {
		first := sanitizeFilename(input)
		for i := 0; i < 10; i++ {
			result := sanitizeFilename(input)
			if result != first {
				t.Errorf("sanitizeFilename(%q) not deterministic: first=%q, iteration %d=%q",
					input, first, i, result)
			}
		}
	}
}

// Fuzz-like test with random-ish inputs
func TestSanitizeFilename_EdgeCases(t *testing.T) {
	edgeCases := []string{
		"\x00\x01\x02\x03",                    // control characters
		string([]byte{0xFF, 0xFE}),           // invalid UTF-8
		"a\u0000b",                            // null in middle
		strings.Repeat("/../", 50),           // many traversals
		"\r\n\r\n",                            // CRLF
		"\u202E",                              // right-to-left override
		"CON",                                 // Windows reserved name
		"LPT1",                                // Windows reserved
		"file\x00.exe",                        // null byte hiding extension
	}

	for _, input := range edgeCases {
		result := sanitizeFilename(input)
		// Should not panic and should return safe string
		if strings.Contains(result, "/") || strings.Contains(result, "\\") ||
			strings.Contains(result, "..") || len(result) > 64 {
			t.Errorf("sanitizeFilename(%q) returned unsafe result: %q", input, result)
		}
	}
}

// Benchmark sanitizeFilename
func BenchmarkSanitizeFilename(b *testing.B) {
	inputs := []string{
		"simple",
		"with spaces",
		"../../path/traversal/attack",
		strings.Repeat("long", 50),
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		for _, input := range inputs {
			_ = sanitizeFilename(input)
		}
	}
}
