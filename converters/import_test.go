package converters

import (
	"encoding/json"
	"strconv"
	"strings"
	"testing"
)

func TestTxtToHTML(t *testing.T) {
	t.Run("converts double newlines to paragraphs", func(t *testing.T) {
		input := "First paragraph.\n\nSecond paragraph."
		result := txtToHTML(input)
		if !strings.Contains(result, "<p>First paragraph.</p>") {
			t.Errorf("Expected first paragraph, got: %s", result)
		}
		if !strings.Contains(result, "<p>Second paragraph.</p>") {
			t.Errorf("Expected second paragraph, got: %s", result)
		}
	})

	t.Run("preserves single newlines as br", func(t *testing.T) {
		input := "Line one.\nLine two."
		result := txtToHTML(input)
		if !strings.Contains(result, "Line one.<br>Line two.") {
			t.Errorf("Expected br tag between lines, got: %s", result)
		}
	})

	t.Run("skips empty paragraphs", func(t *testing.T) {
		input := "\n\n\n\nOnly content here.\n\n\n"
		result := txtToHTML(input)
		count := strings.Count(result, "<p>")
		if count != 1 {
			t.Errorf("Expected 1 paragraph, got %d in: %s", count, result)
		}
	})

	t.Run("handles Windows line endings", func(t *testing.T) {
		input := "First.\r\n\r\nSecond."
		result := txtToHTML(input)
		if strings.Count(result, "<p>") != 2 {
			t.Errorf("Expected 2 paragraphs, got: %s", result)
		}
	})
}

func TestSplitHTMLIntoChapters(t *testing.T) {
	t.Run("splits on page break markers", func(t *testing.T) {
		html := `<p>Content one.</p>` + pageBreakMarker + `<p>Content two.</p>`
		chapters := SplitHTMLIntoChapters(html, false, false)
		if len(chapters) != 2 {
			t.Fatalf("Expected 2 chapters, got %d", len(chapters))
		}
		if chapters[0].Title != "Chapter 1" {
			t.Errorf("Expected 'Chapter 1', got '%s'", chapters[0].Title)
		}
		if chapters[1].Title != "Chapter 2" {
			t.Errorf("Expected 'Chapter 2', got '%s'", chapters[1].Title)
		}
	})

	t.Run("single chapter when no page breaks", func(t *testing.T) {
		html := `<p>Just some content without page breaks.</p>`
		chapters := SplitHTMLIntoChapters(html, false, false)
		if len(chapters) != 1 {
			t.Fatalf("Expected 1 chapter, got %d", len(chapters))
		}
		if chapters[0].Title != "Chapter 1" {
			t.Errorf("Expected 'Chapter 1', got '%s'", chapters[0].Title)
		}
	})

	t.Run("skips empty sections between page breaks", func(t *testing.T) {
		html := `<p>Content.</p>` + pageBreakMarker + pageBreakMarker + `<p>More content.</p>`
		chapters := SplitHTMLIntoChapters(html, false, false)
		if len(chapters) != 2 {
			t.Fatalf("Expected 2 chapters (empty section skipped), got %d", len(chapters))
		}
	})

	t.Run("multiple page breaks create multiple chapters", func(t *testing.T) {
		html := `<p>A</p>` + pageBreakMarker + `<p>B</p>` + pageBreakMarker + `<p>C</p>`
		chapters := SplitHTMLIntoChapters(html, false, false)
		if len(chapters) != 3 {
			t.Fatalf("Expected 3 chapters, got %d", len(chapters))
		}
	})

	// Pandoc converts Word's Heading 1 paragraphs to <h1> tags. A DOCX
	// that uses Heading 1 as the only chapter delimiter (the common
	// case — many manuscripts never insert hard page breaks) should
	// split correctly, and the h1 text should become the chapter title.
	t.Run("splits on h1 and uses h1 text as the title", func(t *testing.T) {
		html := `<h1>Prologue</h1><p>Before everything.</p>` +
			`<h1>Chapter 1: Dawn</h1><p>Something happens.</p>` +
			`<h1>Chapter 2: Dusk</h1><p>Something else happens.</p>`
		chapters := SplitHTMLIntoChapters(html, false, false)
		if len(chapters) != 3 {
			t.Fatalf("Expected 3 chapters, got %d", len(chapters))
		}
		wantTitles := []string{"Prologue", "Chapter 1: Dawn", "Chapter 2: Dusk"}
		for i, want := range wantTitles {
			if chapters[i].Title != want {
				t.Errorf("chapter %d title: got %q, want %q", i, chapters[i].Title, want)
			}
		}
	})

	// Pandoc preserves <h1 id="..."> attributes on heading tags
	// (anchor ids). The splitter must still recognize them as chapter
	// boundaries and extract the inner text as the title.
	t.Run("handles h1 tags with attributes", func(t *testing.T) {
		html := `<h1 id="prologue">Prologue</h1><p>a</p>` +
			`<h1 id="chapter-1">Chapter 1</h1><p>b</p>`
		chapters := SplitHTMLIntoChapters(html, false, false)
		if len(chapters) != 2 {
			t.Fatalf("Expected 2 chapters, got %d", len(chapters))
		}
		if chapters[0].Title != "Prologue" {
			t.Errorf("got %q, want %q", chapters[0].Title, "Prologue")
		}
	})

	// Threadr's own DOCX exporter emits a <w:br w:type="page"/>
	// INSIDE the Heading 1 paragraph, so after pre-processing +
	// pandoc the HTML has the sentinel bled into the <h1>'s text:
	//     <h1>SENTINELChapter Title</h1>
	// The splitter must scrub the sentinel out of the h1 content so
	// (a) the chapter title doesn't carry the sentinel garbage, and
	// (b) the split fires exactly once at that boundary — not twice
	// (once at the natural sentinel, once at the prepended one).
	t.Run("scrubs stray page-break sentinel inside h1 and keeps the title clean", func(t *testing.T) {
		html := `<p>First body.</p>` +
			`<h1>` + pageBreakMarker + `Chapter 2: Second Round</h1><p>Second body.</p>`
		chapters := SplitHTMLIntoChapters(html, false, false)
		if len(chapters) != 2 {
			t.Fatalf("Expected exactly 2 chapters (one h1 boundary), got %d", len(chapters))
		}
		if chapters[1].Title != "Chapter 2: Second Round" {
			t.Errorf("title not scrubbed: got %q", chapters[1].Title)
		}
		if strings.Contains(chapters[1].Title, pageBreakMarker) {
			t.Errorf("sentinel leaked into title: %q", chapters[1].Title)
		}
	})

	// Mixed page-break + Heading 1 content (what the Threadr exporter
	// generates): the hard break lands between content paragraphs and
	// each chapter begins with an <h1>. The split should fire once per
	// chapter and titles should come from the h1 text.
	t.Run("mixed page-break and h1 split once per chapter", func(t *testing.T) {
		html := `<h1>Chapter 1</h1><p>Body 1.</p>` + pageBreakMarker +
			`<h1>Chapter 2</h1><p>Body 2.</p>` + pageBreakMarker +
			`<h1>Chapter 3</h1><p>Body 3.</p>`
		chapters := SplitHTMLIntoChapters(html, false, false)
		if len(chapters) != 3 {
			t.Fatalf("Expected 3 chapters, got %d", len(chapters))
		}
		for i, c := range chapters {
			wantTitle := "Chapter " + strconv.Itoa(i+1)
			if c.Title != wantTitle {
				t.Errorf("chapter %d: got %q, want %q", i, c.Title, wantTitle)
			}
		}
	})

	// Headings without any body content should still produce a chapter
	// title, falling back to "Chapter N" if the h1 scrub left nothing.
	t.Run("falls back to Chapter N when a section lacks a heading", func(t *testing.T) {
		html := `<p>Standalone body.</p>` + pageBreakMarker + `<p>Second body.</p>`
		chapters := SplitHTMLIntoChapters(html, false, false)
		if len(chapters) != 2 {
			t.Fatalf("Expected 2 chapters, got %d", len(chapters))
		}
		for i, c := range chapters {
			wantTitle := "Chapter " + strconv.Itoa(i+1)
			if c.Title != wantTitle {
				t.Errorf("chapter %d: got %q, want %q", i, c.Title, wantTitle)
			}
		}
	})
}

func TestHtmlToLexicalBlocks(t *testing.T) {
	t.Run("creates blocks from paragraphs", func(t *testing.T) {
		html := `<p>First paragraph.</p><p>Second paragraph.</p>`
		blocks := htmlToLexicalBlocks(html, false)
		if len(blocks) != 2 {
			t.Fatalf("Expected 2 blocks, got %d", len(blocks))
		}
		// Verify each block has required fields
		for _, block := range blocks {
			if block.KeyID == "" {
				t.Error("Block missing KeyID")
			}
			if len(block.Chunk) == 0 {
				t.Error("Block has empty chunk")
			}
		}
	})

	t.Run("produces valid Lexical JSON", func(t *testing.T) {
		html := `<p>Hello world</p>`
		blocks := htmlToLexicalBlocks(html, false)
		if len(blocks) == 0 {
			t.Fatal("Expected at least 1 block")
		}
		var node map[string]any
		if err := json.Unmarshal(blocks[0].Chunk, &node); err != nil {
			t.Fatalf("Chunk is not valid JSON: %v", err)
		}
		if node["type"] != "paragraph" {
			t.Errorf("Expected type 'paragraph', got '%v'", node["type"])
		}
		children, ok := node["children"].([]any)
		if !ok || len(children) == 0 {
			t.Fatal("Expected children array with content")
		}
		textNode := children[0].(map[string]any)
		if textNode["text"] != "Hello world" {
			t.Errorf("Expected text 'Hello world', got '%v'", textNode["text"])
		}
	})

	t.Run("handles bold formatting", func(t *testing.T) {
		html := `<strong>Bold text</strong>`
		blocks := htmlToLexicalBlocks(html, false)
		if len(blocks) == 0 {
			t.Fatal("Expected at least 1 block")
		}
		var node map[string]any
		json.Unmarshal(blocks[0].Chunk, &node)
		children := node["children"].([]any)
		textNode := children[0].(map[string]any)
		format := int(textNode["format"].(float64))
		if format != 1 {
			t.Errorf("Expected format 1 (bold), got %d", format)
		}
	})

	t.Run("handles italic formatting", func(t *testing.T) {
		html := `<em>Italic text</em>`
		blocks := htmlToLexicalBlocks(html, false)
		var node map[string]any
		json.Unmarshal(blocks[0].Chunk, &node)
		children := node["children"].([]any)
		textNode := children[0].(map[string]any)
		format := int(textNode["format"].(float64))
		if format != 2 {
			t.Errorf("Expected format 2 (italic), got %d", format)
		}
	})

	t.Run("returns nil for empty input", func(t *testing.T) {
		blocks := htmlToLexicalBlocks("", false)
		if blocks != nil {
			t.Errorf("Expected nil for empty input, got %d blocks", len(blocks))
		}
	})

	t.Run("assigns sequential place values", func(t *testing.T) {
		html := `<p>One</p><p>Two</p><p>Three</p>`
		blocks := htmlToLexicalBlocks(html, false)
		for i, block := range blocks {
			expected := strconv.Itoa(i)
			if block.Place != expected {
				t.Errorf("Block %d: expected place '%s', got '%s'", i, expected, block.Place)
			}
		}
	})
}

func TestSplitTextWithTabs(t *testing.T) {
	t.Run("no tabs returns single text node", func(t *testing.T) {
		nodes := splitTextWithTabs("hello world", 0)
		if len(nodes) != 1 {
			t.Fatalf("Expected 1 node, got %d", len(nodes))
		}
		if nodes[0]["type"] != "text" {
			t.Errorf("Expected text node, got %v", nodes[0]["type"])
		}
	})

	t.Run("preserves tab characters inline in text node", func(t *testing.T) {
		nodes := splitTextWithTabs("\tindented text", 0)
		if len(nodes) != 1 {
			t.Fatalf("Expected 1 node, got %d", len(nodes))
		}
		if nodes[0]["text"] != "\tindented text" {
			t.Errorf("Expected tab preserved in text, got: %q", nodes[0]["text"])
		}
	})

	t.Run("preserves format", func(t *testing.T) {
		nodes := splitTextWithTabs("\tbold text", 1)
		if nodes[0]["format"] != 1 {
			t.Errorf("Expected format 1, got %v", nodes[0]["format"])
		}
	})
}

func TestHtmlToLexicalBlocks_WithTabs(t *testing.T) {
	t.Run("autotab prepends real tab char to first text node", func(t *testing.T) {
		input := "Indented paragraph"
		blocks := htmlToLexicalBlocks(input, true)
		if len(blocks) == 0 {
			t.Fatal("Expected at least 1 block")
		}
		var node map[string]any
		json.Unmarshal(blocks[0].Chunk, &node)
		children := node["children"].([]any)
		firstChild := children[0].(map[string]any)
		text := firstChild["text"].(string)
		if !strings.HasPrefix(text, "\t") {
			t.Errorf("Expected text to start with tab char, got: %q", text)
		}
	})

	t.Run("autotab false does not prepend tab", func(t *testing.T) {
		input := "No tab paragraph"
		blocks := htmlToLexicalBlocks(input, false)
		if len(blocks) == 0 {
			t.Fatal("Expected at least 1 block")
		}
		var node map[string]any
		json.Unmarshal(blocks[0].Chunk, &node)
		children := node["children"].([]any)
		firstChild := children[0].(map[string]any)
		text := firstChild["text"].(string)
		if strings.HasPrefix(text, "\t") {
			t.Errorf("Expected no tab prefix, got: %q", text)
		}
	})
}

func TestStripHTMLTags(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"<strong>bold</strong>", "bold"},
		{"<em>italic</em> text", "italic text"},
		{"no tags", "no tags"},
		{"<a href=\"url\">link</a>", "link"},
		{"", ""},
		// HTML entity decoding
		{"didn&#39;t", "didn't"},
		{"didn&apos;t", "didn't"},
		{"&ldquo;hello&rdquo;", "\u201chello\u201d"},
		{"&amp; more", "& more"},
		{"&#34;quoted&#34;", "\"quoted\""},
		{"caf&eacute;", "café"},
		{"&mdash;", "—"},
		{"&lsquo;smart&rsquo;", "\u2018smart\u2019"},
		// Tabs are preserved (not converted to spaces) for Lexical tab nodes
		{"indented\twith\ttabs", "indented\twith\ttabs"},
		{"<p>\ttabbed paragraph</p>", "\ttabbed paragraph"},
	}
	for _, tt := range tests {
		result := stripHTMLTags(tt.input)
		if result != tt.expected {
			t.Errorf("stripHTMLTags(%q) = %q, want %q", tt.input, result, tt.expected)
		}
	}
}
