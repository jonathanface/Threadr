package converters

import (
	"archive/zip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/microcosm-cc/bluemonday"
)

// ImportedChapter represents a chapter extracted from an imported document.
type ImportedChapter struct {
	Title  string          `json:"title"`
	Blocks []ImportedBlock `json:"blocks"`
}

// ImportedBlock represents a single Lexical block (paragraph) ready for storage.
type ImportedBlock struct {
	KeyID string          `json:"key_id"`
	Chunk json.RawMessage `json:"chunk"`
	Place string          `json:"place"`
}

const pageBreakMarker = "THREADR_PAGE_BREAK_7f3a9b2e"

// injectPageBreakMarkers reads a DOCX file, replaces hard page breaks with a
// text sentinel, writes a new temp DOCX, and returns its path.
func injectPageBreakMarkers(docxPath string) (string, error) {
	r, err := zip.OpenReader(docxPath)
	if err != nil {
		return "", fmt.Errorf("failed to open docx: %w", err)
	}
	defer r.Close()

	tmpFile, err := os.CreateTemp("", "import_marked_*.docx")
	if err != nil {
		return "", err
	}
	w := zip.NewWriter(tmpFile)

	pageBreakRe := regexp.MustCompile(`<w:br\s+w:type\s*=\s*"page"\s*/?>`)

	for _, f := range r.File {
		rc, err := f.Open() //nolint:govet
		if err != nil {
			w.Close()
			tmpFile.Close()
			os.Remove(tmpFile.Name())
			return "", err
		}

		header := &zip.FileHeader{
			Name:   f.Name,
			Method: f.Method,
		}
		writer, err := w.CreateHeader(header)
		if err != nil {
			rc.Close()
			w.Close()
			tmpFile.Close()
			os.Remove(tmpFile.Name())
			return "", err
		}

		if f.Name == "word/document.xml" {
			data, err := io.ReadAll(rc) //nolint:govet
			if err != nil {
				rc.Close()
				w.Close()
				tmpFile.Close()
				os.Remove(tmpFile.Name())
				return "", err
			}
			content := string(data)
			// Replace page break elements with a marker text run.
			// Close the parent <w:r>, insert marker in its own run, reopen <w:r>.
			replacement := `</w:r><w:r><w:t>` + pageBreakMarker + `</w:t></w:r><w:r>`
			content = pageBreakRe.ReplaceAllString(content, replacement)
			writer.Write([]byte(content))
		} else {
			io.Copy(writer, rc)
		}
		rc.Close()
	}

	w.Close()
	tmpFile.Close()
	return tmpFile.Name(), nil
}

// FileToHTML converts a document file to HTML using pandoc.
// Supports .docx and .txt files.
func FileToHTML(filePath string, format string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second) //nolint:mnd
	defer cancel()

	var cmd *exec.Cmd
	switch format {
	case "docx":
		// Inject page break markers into the DOCX before pandoc conversion
		markedPath, markErr := injectPageBreakMarkers(filePath)
		if markErr != nil {
			// Fall back to original file if marker injection fails
			markedPath = filePath
		} else {
			defer os.Remove(markedPath)
		}
		cmd = exec.CommandContext(ctx, "pandoc",
			"-f", "docx",
			"-t", "html5",
			"--wrap=none",
			markedPath,
		)
	case "pdf":
		// pdftotext extracts text (no -layout to avoid page headers in output)
		cmd = exec.CommandContext(ctx, "pdftotext",
			filePath,
			"-", // output to stdout
		)
	case "txt":
		// Read and wrap as HTML directly
		data, err := os.ReadFile(filePath)
		if err != nil {
			return "", fmt.Errorf("failed to read txt file: %w", err)
		}
		return txtToHTML(string(data)), nil
	default:
		return "", fmt.Errorf("unsupported format: %s", format)
	}

	output, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("conversion failed for %s: %w", format, err)
	}

	return string(output), nil
}

// txtToHTML wraps plain text into simple HTML paragraphs.
// Double newlines become paragraph breaks.
func txtToHTML(text string) string {
	text = strings.ReplaceAll(text, "\r\n", "\n")
	text = strings.ReplaceAll(text, "\r", "\n")

	paragraphs := regexp.MustCompile(`\n{2,}`).Split(text, -1)

	var b strings.Builder
	for _, p := range paragraphs {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		// Preserve single newlines as <br> within a paragraph
		p = strings.ReplaceAll(p, "\n", "<br>")
		b.WriteString("<p>")
		b.WriteString(p)
		b.WriteString("</p>")
	}
	return b.String()
}

// SplitHTMLIntoChapters splits HTML content at page break markers or heading tags.
// Returns a slice of ImportedChapter with titles and HTML content.
func SplitHTMLIntoChapters(htmlContent string, autotab bool, skipFirstPage bool) []ImportedChapter {
	// Sanitize HTML
	sanitizer := bluemonday.UGCPolicy()
	sanitizer.AllowAttrs("style").OnElements("p", "div", "span")
	htmlContent = sanitizer.Sanitize(htmlContent)

	// If we have page break markers, split on those (preferred over headings)
	// Split on page break markers
	sections := strings.Split(htmlContent, pageBreakMarker)

	// Skip the first page (title page) if requested
	if skipFirstPage && len(sections) > 1 {
		sections = sections[1:]
	}

	// Pattern to strip dangling close tags at the start of a section
	// (caused by markers landing inside HTML elements)
	danglingCloseTag := regexp.MustCompile(`^(\s*</\w+>\s*)+`)

	var chapters []ImportedChapter
	for _, section := range sections {
		section = strings.TrimSpace(section)
		section = danglingCloseTag.ReplaceAllString(section, "")
		section = strings.TrimSpace(section)
		// Strip all HTML tags and check if any real text remains
		plainText := strings.TrimSpace(stripHTMLTags(section))
		if plainText == "" {
			continue
		}
		blocks := htmlToLexicalBlocks(section, autotab)
		if len(blocks) == 0 {
			continue
		}
		title := fmt.Sprintf("Chapter %d", len(chapters)+1)
		chapters = append(chapters, ImportedChapter{
			Title:  title,
			Blocks: blocks,
		})
	}
	if len(chapters) == 0 {
		// No page breaks found — single chapter
		return []ImportedChapter{{
			Title:  "Chapter 1",
			Blocks: htmlToLexicalBlocks(htmlContent, autotab),
		}}
	}
	return chapters
}

// stripHTMLTags removes all HTML tags and decodes HTML entities (e.g. &#39; → ', &ldquo; → ").
func stripHTMLTags(s string) string {
	re := regexp.MustCompile(`<[^>]*>`)
	s = re.ReplaceAllString(s, "")
	return html.UnescapeString(s)
}

// htmlToLexicalBlocks converts HTML into a slice of Lexical paragraph blocks.
// Each <p>, <div>, or <br>-separated line becomes a separate block.
// If autotab is true, each paragraph gets a leading \t.
func htmlToLexicalBlocks(html string, autotab bool) []ImportedBlock {
	if strings.TrimSpace(html) == "" {
		return nil
	}

	// Split HTML into paragraph-level elements
	paragraphs := extractParagraphs(html)

	var blocks []ImportedBlock
	for i, para := range paragraphs {
		para = strings.Trim(para, " \n\r")
		if para == "" {
			continue
		}

		node := htmlParagraphToLexicalNode(para, autotab)
		chunk, err := json.Marshal(node)
		if err != nil {
			continue
		}

		blocks = append(blocks, ImportedBlock{
			KeyID: uuid.New().String(),
			Chunk: chunk,
			Place: strconv.Itoa(i),
		})
	}

	return blocks
}

// extractParagraphs splits HTML content into individual paragraphs.
func extractParagraphs(html string) []string {
	// Replace block-level elements with markers, then split
	blockPattern := regexp.MustCompile(`(?i)</?(p|div|blockquote)\s*[^>]*>`)

	// First, split by block elements
	parts := blockPattern.Split(html, -1)

	var result []string
	for _, part := range parts {
		part = strings.Trim(part, " \n\r")
		if part == "" {
			continue
		}
		// Further split on <br> tags to separate lines
		lines := regexp.MustCompile(`(?i)<br\s*/?>`).Split(part, -1)
		for _, line := range lines {
			line = strings.Trim(line, " \n\r")
			if line != "" {
				result = append(result, line)
			}
		}
	}

	return result
}

// htmlParagraphToLexicalNode converts a single paragraph's HTML to a Lexical paragraph node.
// If autotab is true, a \t is prepended to the first text node (matching Threadr's autotab behavior).
func htmlParagraphToLexicalNode(html string, autotab bool) map[string]any {
	children := parseInlineHTML(html)

	if autotab && len(children) > 0 {
		first := children[0]
		if text, ok := first["text"].(string); ok && !strings.HasPrefix(text, "\t") {
			first["text"] = "\t" + text
		}
	}

	return map[string]any{
		"type":      "paragraph",
		"children":  children,
		"direction": "ltr",
		"format":    "",
		"indent":    0,
		"version":   1,
	}
}

// parseInlineHTML converts inline HTML (bold, italic, etc.) to Lexical text nodes.
func parseInlineHTML(html string) []map[string]any {
	if strings.TrimSpace(html) == "" {
		return []map[string]any{
			makeTextNode("", 0),
		}
	}

	// Remove any remaining block-level tags
	html = regexp.MustCompile(`(?i)</?(?:p|div|span)\s*[^>]*>`).ReplaceAllString(html, "")

	type segment struct {
		text   string
		format int
	}

	var segments []segment
	remaining := html

	// Process inline formatting tags
	// Go's regexp doesn't support backreferences, so we match each tag type separately
	inlinePattern := regexp.MustCompile(`(?is)<(strong|b|em|i|u|s)>(.*?)</(strong|b|em|i|u|s)>`)

	// Simple approach: find formatted spans and plain text between them
	for len(remaining) > 0 {
		loc := inlinePattern.FindStringSubmatchIndex(remaining)
		if loc == nil {
			// No more formatting — rest is plain text
			text := stripHTMLTags(remaining)
			if text != "" {
				segments = append(segments, segment{text: text, format: 0})
			}
			break
		}

		// Plain text before this match
		if loc[0] > 0 {
			text := stripHTMLTags(remaining[:loc[0]])
			if text != "" {
				segments = append(segments, segment{text: text, format: 0})
			}
		}

		tag := strings.ToLower(remaining[loc[2]:loc[3]])
		innerHTML := remaining[loc[4]:loc[5]]
		innerText := stripHTMLTags(innerHTML)

		var format int
		switch tag {
		case "strong", "b":
			format = 1 // bold
		case "em", "i":
			format = 2 // italic
		case "u":
			format = 8 // underline
		case "s":
			format = 4 // strikethrough
		}

		if innerText != "" {
			segments = append(segments, segment{text: innerText, format: format})
		}

		remaining = remaining[loc[1]:]
	}

	if len(segments) == 0 {
		text := stripHTMLTags(html)
		segments = append(segments, segment{text: text, format: 0})
	}

	var nodes []map[string]any
	for _, seg := range segments {
		nodes = append(nodes, splitTextWithTabs(seg.text, seg.format)...)
	}

	return nodes
}

// makeTextNode creates a Lexical text node.
func makeTextNode(text string, format int) map[string]any {
	return map[string]any{
		"detail":  0,
		"format":  format,
		"mode":    "normal",
		"style":   "",
		"text":    text,
		"type":    "text",
		"version": 1,
	}
}

// splitTextWithTabs takes a text string and format, and returns text nodes
// with tab characters preserved inline (matching Threadr's autotab behavior
// where \t is embedded in the text node content, not as separate TabNodes).
func splitTextWithTabs(text string, format int) []map[string]any {
	return []map[string]any{makeTextNode(text, format)}
}

// stripPageHeaders removes lines that look like manuscript page headers.
// These are typically short lines with slashes and page numbers, like "FACE / HARBINGERS / 1".
func stripPageHeaders(text string) string {
	lines := strings.Split(text, "\n")
	var cleaned []string

	// Detect the repeating header pattern from the first few occurrences
	headerPattern := regexp.MustCompile(`^\s*\S+\s*/\s*\S+\s*/\s*\d+\s*$`)

	for _, line := range lines {
		if headerPattern.MatchString(line) {
			continue
		}
		cleaned = append(cleaned, line)
	}
	return strings.Join(cleaned, "\n")
}

// splitPDFTextIntoChapters splits plain text from pdftotext into chapters.
// It detects chapter breaks from lines like "Chapter 1", "CHAPTER ONE", "Chapter 1: Title", etc.
func splitPDFTextIntoChapters(text string, autotab bool) []ImportedChapter {
	text = stripPageHeaders(text)

	chapterPattern := regexp.MustCompile(`(?im)^\s*chapter\s+[\divxlc]+[:\s]*(.*?)\s*$`)

	matches := chapterPattern.FindAllStringSubmatchIndex(text, -1)

	if len(matches) == 0 {
		// No chapter markers — single chapter
		html := txtToHTML(text)
		return []ImportedChapter{
			{
				Title:  "Chapter 1",
				Blocks: htmlToLexicalBlocks(html, autotab),
			},
		}
	}

	var chapters []ImportedChapter

	// Content before the first chapter marker (title page, etc.)
	if matches[0][0] > 0 {
		preContent := strings.TrimSpace(text[:matches[0][0]])
		if preContent != "" {
			html := txtToHTML(preContent)
			chapters = append(chapters, ImportedChapter{
				Title:  "Title Page",
				Blocks: htmlToLexicalBlocks(html, autotab),
			})
		}
	}

	for i, match := range matches {
		// Extract chapter title from the "Chapter N" line
		fullLine := strings.Trim(text[match[0]:match[1]], " \t\n\r")

		// Check for a subtitle on the next non-empty line
		contentStart := match[1]
		remaining := text[contentStart:]
		subtitle := ""
		subtitleEnd := contentStart

		// Look ahead for a short subtitle line (e.g. "The Regent")
		nextLines := strings.SplitN(strings.TrimLeft(remaining, "\n"), "\n", 3) //nolint:mnd
		if len(nextLines) > 0 {
			candidate := strings.TrimSpace(nextLines[0])
			// A subtitle is a short non-empty line that isn't the start of body text
			if candidate != "" && len(candidate) < 80 && !strings.Contains(candidate, ".") {
				subtitle = candidate
				subtitleEnd = contentStart + strings.Index(remaining, candidate) + len(candidate)
			}
		}

		title := strings.TrimSpace(fullLine)
		if subtitle != "" {
			title = title + ": " + subtitle
		}
		// Clean up title: remove zero-width spaces, newlines, trailing colons/whitespace
		title = strings.ReplaceAll(title, "\u200b", "")
		title = strings.ReplaceAll(title, "\n", ": ")
		title = strings.ReplaceAll(title, "\r", "")
		title = regexp.MustCompile(`:\s*:\s*`).ReplaceAllString(title, ": ")
		title = strings.TrimRight(title, ": \t")
		if len(title) > 256 { //nolint:mnd
			title = title[:256]
		}

		// Content between this chapter and the next
		bodyStart := subtitleEnd
		var bodyEnd int
		if i+1 < len(matches) {
			bodyEnd = matches[i+1][0]
		} else {
			bodyEnd = len(text)
		}

		body := strings.TrimSpace(text[bodyStart:bodyEnd])
		if body != "" {
			html := txtToHTML(body)
			chapters = append(chapters, ImportedChapter{
				Title:  title,
				Blocks: htmlToLexicalBlocks(html, autotab),
			})
		}
	}

	return chapters
}

// ImportDocument is the main entry point for document import.
// It takes a file path and format, converts to HTML, splits into chapters,
// and returns ImportedChapters with Lexical blocks ready for storage.
// If autotab is true, each paragraph gets a leading \t to match Threadr's autotab behavior.
func ImportDocument(filePath string, format string, autotab bool, skipFirstPage bool) ([]ImportedChapter, error) {
	content, err := FileToHTML(filePath, format)
	if err != nil {
		return nil, fmt.Errorf("failed to convert %s: %w", format, err)
	}

	var chapters []ImportedChapter
	switch format {
	case "txt":
		chapters = []ImportedChapter{
			{
				Title:  "Chapter 1",
				Blocks: htmlToLexicalBlocks(txtToHTML(content), autotab),
			},
		}
	case "pdf":
		chapters = splitPDFTextIntoChapters(content, autotab)
	default:
		// DOCX: pandoc produces HTML with headings
		chapters = SplitHTMLIntoChapters(content, autotab, skipFirstPage)
	}

	if len(chapters) == 0 {
		return nil, errors.New("no content found in document")
	}

	return chapters, nil
}
