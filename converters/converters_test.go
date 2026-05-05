package converters

import (
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"testing"
	"time"

	"Threadr/models"
)

// --- Test helpers ------------------------------------------------------------

func writeFakePandoc(t *testing.T, dir string) {
	t.Helper()
	var name, contents string
	if runtime.GOOS == "windows" {
		name = "pandoc.bat"
		// Write to the output path passed after "-o" and exit 0.
		contents = `@echo off
setlocal enabledelayedexpansion
set OUT=
:loop
if "%~1"=="" goto done
if "%~1"=="-o" (
  set OUT=%~2
)
shift
goto loop
:done
if not "%OUT%"=="" (
  echo FAKE_PANDOC> "%OUT%"
)
exit /b 0
`
	} else {
		name = "pandoc"
		contents = `#!/usr/bin/env bash
set -euo pipefail
OUT=""
while (( "$#" )); do
  if [[ "$1" == "-o" ]]; then
    OUT="$2"; shift 2; continue
  fi
  shift
done
if [[ -n "${OUT}" ]]; then
  mkdir -p "$(dirname "${OUT}")"
  echo "FAKE_PANDOC" > "${OUT}"
fi
`
	}
	full := filepath.Join(dir, name)
	if err := os.WriteFile(full, []byte(contents), 0o755); err != nil {
		t.Fatalf("write fake pandoc: %v", err)
	}
}

func withPathPrepended(t *testing.T, dir string) (restore func()) {
	t.Helper()
	old := os.Getenv("PATH")
	sep := string(os.PathListSeparator)
	t.Setenv("PATH", dir+sep+old)
	return func() {}
}

func mustTempDir(t *testing.T) string {
	t.Helper()
	d := t.TempDir()
	return d
}

// --- Minimal test struct for models.DocumentExportRequest --------------------
// Ensure this matches your actual type in Threadr/models.

type testChapter struct {
	Chapter string
	HTML    string
}

type testExport struct {
	Title         string
	HTMLByChapter []testChapter
	CoverImage    *string
	Author        *string
}

// adapter: convert our test type to your real models.DocumentExportRequest
// If your real struct matches, you can replace this with the real type directly.
func toRealExport(te testExport) models.DocumentExportRequest {
	var chapters []models.HTMLData // adjust to your actual field type if needed
	// If your actual model is []struct{ Chapter, HTML string }, you can convert directly:
	// (This adapter assumes the same field names.)
	for _, c := range te.HTMLByChapter {
		chapters = append(chapters, models.HTMLData{Chapter: c.Chapter, HTML: c.HTML})
	}
	return models.DocumentExportRequest{
		Title:         te.Title,
		HTMLByChapter: chapters,
		CoverImage:    te.CoverImage,
		Author:        te.Author,
	}
}

// --- Tests -------------------------------------------------------------------

func TestDetab_TableDriven(t *testing.T) {
	tests := []struct {
		name     string
		in       string
		tabWidth int
		want     string
	}{
		{
			name:     "no_tabs",
			in:       "hello",
			tabWidth: 4,
			want:     "hello",
		},
		{
			name:     "single_tab_at_start",
			in:       "\tA",
			tabWidth: 4,
			want:     "    A",
		},
		{
			name:     "tab_middle_aligns_to_next_stop",
			in:       "ab\tc",
			tabWidth: 4,
			// "ab" is 2 cols, next stop at 4 -> 2 spaces
			want: "ab  c",
		},
		{
			name:     "multiple_tabs",
			in:       "a\tb\tc",
			tabWidth: 4,
			// a: col1; after tab -> pad to 4 -> 3 spaces; then 'b' at col4,
			// next tab -> pad to 8 -> 3 spaces; then 'c'
			want: "a   b   c",
		},
		{
			name:     "newline_resets_column",
			in:       "12\t34\nX\tY",
			tabWidth: 4,
			// "12" col2 -> pad to 4 -> 2 spaces: "12  34"
			// newline: reset col -> "X" col1, pad to 4 -> 3 spaces: "X   Y"
			want: "12  34\nX   Y",
		},
		{
			name:     "custom_width_8",
			in:       "1234\tZ",
			tabWidth: 8,
			// at col4 -> pad to 8 -> 4 spaces
			want: "1234    Z",
		},
		{
			name:     "non_positive_width_defaults_to_5",
			in:       "12\tZ",
			tabWidth: 0,
			// at col2 -> default 5 -> pad 3
			want: "12   Z",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := detab(tc.in, tc.tabWidth)
			if got != tc.want {
				t.Fatalf("detab(%q, %d) = %q; want %q", tc.in, tc.tabWidth, got, tc.want)
			}
		})
	}
}

func TestSafeTimestampFormat(t *testing.T) {
	re := regexp.MustCompile(`^\d{8}T\d{6}Z$`)
	for range 3 {
		ts := safeTimestamp()
		if !re.MatchString(ts) {
			t.Fatalf("safeTimestamp() = %q; want format YYYYMMDDThhmmssZ", ts)
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func TestHTMLToDOCX_UsesPandocStub_WritesFile(t *testing.T) {
	// Arrange: fake pandoc
	fakeDir := mustTempDir(t)
	writeFakePandoc(t, fakeDir)
	restore := withPathPrepended(t, fakeDir)
	defer restore()

	// Use a minimal export
	exp := toRealExport(testExport{
		Title: "DocxTitle",
		HTMLByChapter: []testChapter{
			{Chapter: "One", HTML: "<div>Hello</div>"},
		},
	})

	// Act
	name, err := HTMLToDOCX(exp)
	if err != nil {
		t.Fatalf("HTMLToDOCX error: %v", err)
	}
	if !strings.HasSuffix(name, ".docx") {
		t.Fatalf("expected .docx suffix, got %q", name)
	}
	// Output lives in ./tmp/<name>
	outPath := filepath.Join(".", "tmp", name)
	b, err := os.ReadFile(outPath)
	if err != nil {
		t.Fatalf("reading output: %v", err)
	}
	if len(b) == 0 {
		t.Fatalf("expected non-empty file; got 0 bytes")
	}
	_ = os.Remove(outPath) // clean
}

func TestHTMLToEPUB_UsesPandocStub_WritesFile(t *testing.T) {
	// Arrange: fake pandoc
	fakeDir := mustTempDir(t)
	writeFakePandoc(t, fakeDir)
	restore := withPathPrepended(t, fakeDir)
	defer restore()

	exp := toRealExport(testExport{
		Title: "EpubTitle",
		HTMLByChapter: []testChapter{
			{Chapter: "Intro", HTML: "<p>Hi</p>"},
			{Chapter: "Next", HTML: "<p>There</p>"},
		},
	})

	// Act
	name, err := HTMLToEPUB(exp)
	if err != nil {
		t.Fatalf("HTMLToEPUB error: %v", err)
	}
	if !strings.HasSuffix(name, ".epub") {
		t.Fatalf("expected .epub suffix, got %q", name)
	}
	outPath := filepath.Join(".", "tmp", name)
	b, err := os.ReadFile(outPath)
	if err != nil {
		t.Fatalf("reading output: %v", err)
	}
	if len(b) == 0 {
		t.Fatalf("expected non-empty file; got 0 bytes")
	}
	_ = os.Remove(outPath)
}

// This is a smoke test only. It requires a functional wkhtmltopdf in PATH.
// You can opt-in by setting RUN_PDF_TESTS=1 (or ensure wkhtmltopdf exists).
func TestHTMLToPDF_Smoke(t *testing.T) {
	if os.Getenv("RUN_PDF_TESTS") != "1" {
		if _, err := exec.LookPath("wkhtmltopdf"); err != nil {
			t.Skip("wkhtmltopdf not found and RUN_PDF_TESTS!=1; skipping PDF smoke test")
		}
	}
	exp := toRealExport(testExport{
		Title: "PdfTitle",
		HTMLByChapter: []testChapter{
			{Chapter: "C1", HTML: "A\tB\nC\tD"},
		},
	})
	name, err := HTMLToPDF(exp)
	if err != nil {
		t.Fatalf("HTMLToPDF error: %v", err)
	}
	if !strings.HasSuffix(name, ".pdf") {
		t.Fatalf("expected .pdf suffix, got %q", name)
	}
	outPath := filepath.Join(".", "tmp", name)
	info, err := os.Stat(outPath)
	if err != nil {
		t.Fatalf("stat output: %v", err)
	}
	if info.Size() == 0 {
		t.Fatalf("expected non-empty pdf")
	}
	_ = os.Remove(outPath)
}

// --- Tests for URL validation ------------------------------------------------

func TestValidateImageURL_ValidHTTPSURL(t *testing.T) {
	// Valid public URL should pass
	result, err := ValidateImageURL("https://example.com/image.jpg")
	if err != nil {
		t.Errorf("Expected valid HTTPS URL to pass, got error: %v", err)
	}
	if result != "https://example.com/image.jpg" {
		t.Errorf("Expected URL to be returned unchanged, got: %s", result)
	}
}

func TestValidateImageURL_ValidHTTPURL(t *testing.T) {
	// Valid HTTP URL should pass
	result, err := ValidateImageURL("http://example.com/image.png")
	if err != nil {
		t.Errorf("Expected valid HTTP URL to pass, got error: %v", err)
	}
	if result != "http://example.com/image.png" {
		t.Errorf("Expected URL to be returned unchanged, got: %s", result)
	}
}

func TestValidateImageURL_InvalidScheme(t *testing.T) {
	tests := []string{
		"file:///etc/passwd",
		"ftp://example.com/file",
		"javascript:alert(1)",
		"data:image/png;base64,iVBORw0KG",
	}

	for _, url := range tests {
		_, err := ValidateImageURL(url)
		if err == nil {
			t.Errorf("Expected URL with invalid scheme to fail: %s", url)
		}
		if !strings.Contains(err.Error(), "invalid URL scheme") {
			t.Errorf("Expected 'invalid URL scheme' error, got: %v", err)
		}
	}
}

func TestValidateImageURL_Localhost(t *testing.T) {
	tests := []string{
		"http://localhost/image.jpg",
		"http://127.0.0.1/image.jpg",
		"http://127.0.0.2/image.jpg",
		"http://[::1]/image.jpg",
	}

	for _, url := range tests {
		_, err := ValidateImageURL(url)
		if err == nil {
			t.Errorf("Expected localhost URL to fail: %s", url)
		}
		if !strings.Contains(err.Error(), "loopback") {
			t.Errorf("Expected 'loopback' error for %s, got: %v", url, err)
		}
	}
}

func TestValidateImageURL_PrivateIP(t *testing.T) {
	tests := []string{
		"http://10.0.0.1/image.jpg",
		"http://172.16.0.1/image.jpg",
		"http://192.168.1.1/image.jpg",
	}

	for _, url := range tests {
		_, err := ValidateImageURL(url)
		if err == nil {
			t.Errorf("Expected private IP URL to fail: %s", url)
		}
		if !strings.Contains(err.Error(), "private IP") {
			t.Errorf("Expected 'private IP' error for %s, got: %v", url, err)
		}
	}
}

func TestValidateImageURL_MissingHostname(t *testing.T) {
	_, err := ValidateImageURL("http:///path/to/image.jpg")
	if err == nil {
		t.Errorf("Expected URL without hostname to fail")
	}
	if !strings.Contains(err.Error(), "missing hostname") {
		t.Errorf("Expected 'missing hostname' error, got: %v", err)
	}
}

func TestValidateImageURL_InvalidURL(t *testing.T) {
	_, err := ValidateImageURL("not a url at all")
	if err == nil {
		t.Errorf("Expected invalid URL to fail")
	}
}

func TestDownloadCoverImage_InvalidURL(t *testing.T) {
	// DownloadCoverImage should fail when trying to connect to a non-existent server
	// (validation happens at API level, this just tests network errors are handled)
	_, err := DownloadCoverImage("http://192.0.2.1/image.jpg") // TEST-NET-1 (non-routable)
	if err == nil {
		t.Errorf("Expected download from non-routable IP to fail")
	}
	if !strings.Contains(err.Error(), "failed to download image") {
		t.Errorf("Expected 'failed to download image' error, got: %v", err)
	}
}

// --- Tests for LexicalToHTML -------------------------------------------------

func TestLexicalToHTML_BoldTextInEditorState(t *testing.T) {
	// Bold text in editor state format
	lexicalJSON := `{
		"root": {
			"children": [
				{
					"type": "custom-paragraph",
					"children": [
						{
							"type": "text",
							"text": "Bold Text",
							"textFormat": 1
						}
					]
				}
			],
			"type": "root"
		}
	}`

	html, err := LexicalToHTML(lexicalJSON)
	if err != nil {
		t.Fatalf("LexicalToHTML failed: %v", err)
	}

	if !strings.Contains(html, "<strong>Bold Text</strong>") {
		t.Errorf("Expected bold text, got: %s", html)
	}
}

func TestLexicalToHTML_ItalicTextInBlocksData(t *testing.T) {
	// Italic text in BlocksData format
	lexicalJSON := `{
		"items": [
			{
				"chunk": {
					"Value": "{\"children\":[{\"type\":\"text\",\"text\":\"Italic Text\",\"textFormat\":2}],\"type\":\"custom-paragraph\"}"
				}
			}
		]
	}`

	html, err := LexicalToHTML(lexicalJSON)
	if err != nil {
		t.Fatalf("LexicalToHTML failed: %v", err)
	}

	if !strings.Contains(html, "<em>Italic Text</em>") {
		t.Errorf("Expected italic text, got: %s", html)
	}
}

func TestLexicalToHTML_CenteredParagraphInBlocksData(t *testing.T) {
	// Centered paragraph in BlocksData format
	lexicalJSON := `{
		"items": [
			{
				"chunk": {
					"Value": "{\"children\":[{\"type\":\"text\",\"text\":\"Centered\",\"textFormat\":0}],\"format\":\"center\",\"type\":\"custom-paragraph\"}"
				}
			}
		]
	}`

	html, err := LexicalToHTML(lexicalJSON)
	if err != nil {
		t.Fatalf("LexicalToHTML failed: %v", err)
	}

	if !strings.Contains(html, `style="text-align:center;"`) {
		t.Errorf("Expected centered text, got: %s", html)
	}
}

func TestLexicalToHTML_BlocksDataFormat(t *testing.T) {
	// Simulates the DynamoDB AttributeValue format
	lexicalJSON := `{
		"items": [
			{
				"chunk": {
					"Value": "{\"children\":[{\"type\":\"text\",\"text\":\"From DynamoDB\",\"textFormat\":0}],\"type\":\"custom-paragraph\"}"
				}
			}
		]
	}`

	html, err := LexicalToHTML(lexicalJSON)
	if err != nil {
		t.Fatalf("LexicalToHTML failed: %v", err)
	}

	if !strings.Contains(html, "From DynamoDB") {
		t.Errorf("Expected text from DynamoDB format, got: %s", html)
	}
}

func TestLexicalToHTML_MultipleChunks(t *testing.T) {
	// Multiple paragraphs in BlocksData format
	lexicalJSON := `{
		"items": [
			{
				"chunk": {
					"Value": "{\"children\":[{\"type\":\"text\",\"text\":\"First paragraph\",\"textFormat\":0}],\"type\":\"custom-paragraph\"}"
				}
			},
			{
				"chunk": {
					"Value": "{\"children\":[{\"type\":\"text\",\"text\":\"Second paragraph\",\"textFormat\":0}],\"type\":\"custom-paragraph\"}"
				}
			}
		]
	}`

	html, err := LexicalToHTML(lexicalJSON)
	if err != nil {
		t.Fatalf("LexicalToHTML failed: %v", err)
	}

	if !strings.Contains(html, "First paragraph") {
		t.Errorf("Expected first paragraph, got: %s", html)
	}
	if !strings.Contains(html, "Second paragraph") {
		t.Errorf("Expected second paragraph, got: %s", html)
	}
}

func TestLexicalToHTML_EditorStateFormat(t *testing.T) {
	// Full editor state format
	lexicalJSON := `{
		"root": {
			"children": [
				{
					"type": "custom-paragraph",
					"children": [
						{
							"type": "text",
							"text": "Editor state text",
							"textFormat": 0
						}
					]
				}
			],
			"direction": "ltr",
			"format": "",
			"indent": 0,
			"type": "root",
			"version": 1
		}
	}`

	html, err := LexicalToHTML(lexicalJSON)
	if err != nil {
		t.Fatalf("LexicalToHTML failed: %v", err)
	}

	if !strings.Contains(html, "Editor state text") {
		t.Errorf("Expected editor state text, got: %s", html)
	}
}

func TestLexicalToHTML_EmptyInput(t *testing.T) {
	_, err := LexicalToHTML("")
	if err == nil {
		t.Error("Expected error for empty input")
	}
}

func TestLexicalToHTML_InvalidJSON(t *testing.T) {
	_, err := LexicalToHTML("{invalid json")
	if err == nil {
		t.Error("Expected error for invalid JSON")
	}
}
