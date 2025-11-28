package converters

import (
	"RichDocter/models"
	"context"
	"fmt"
	"html"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/SebastiaanKlippert/go-wkhtmltopdf"
	"github.com/microcosm-cc/bluemonday"
)

// sanitizeFilename makes a filename safe to use, only allows
// basic ASCII, replaces spaces with underscores, and strips path traversal
func sanitizeFilename(name string) string {
	// Remove path separators and ".."
	name = strings.ReplaceAll(name, "/", "_")
	name = strings.ReplaceAll(name, "\\", "_")
	name = strings.ReplaceAll(name, "..", "_")
	// Only allow [A-Za-z0-9_-] and replace anything else with _
	re := regexp.MustCompile(`[^\w\d_-]`)
	name = re.ReplaceAllString(name, "_")
	// Limit length to 64 chars
	if len(name) > 64 {
		name = name[:64]
	}
	return name
}

const (
	FONT_NAME         = "Arial"
	FONT_PATH         = "assets/fonts/arial.ttf"
	FONT_SIZE_DEFAULT = "12px"
	FONT_SIZE_HEADER  = "18px"
	LINE_HEIGHT       = "24px"
	MARGIN_1INCH      = "1in"
)

func detab(s string, tabWidth int) string {
	if tabWidth <= 0 {
		tabWidth = 5
	}
	var b strings.Builder
	b.Grow(len(s) + len(s)/8)
	col := 0
	for _, r := range s {
		switch r {
		case '\n':
			b.WriteRune('\n')
			col = 0
		case '\t':
			spaces := tabWidth - (col % tabWidth)
			for i := 0; i < spaces; i++ {
				b.WriteByte(' ')
			}
			col += spaces
		default:
			b.WriteRune(r)
			// crude width=1 for non-wide runes; good enough for ASCII text
			col++
		}
	}
	return b.String()
}

func safeTimestamp() string {
	return time.Now().UTC().Format("20060102T150405Z")
}

// DownloadCoverImage downloads an image from a URL to a temporary file
func DownloadCoverImage(imageURL string) (string, error) {
	// Create a GET request with a timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "GET", imageURL, nil)
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to download image: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("failed to download image: status %d", resp.StatusCode)
	}

	// Determine file extension from content type
	ext := ".jpg"
	contentType := resp.Header.Get("Content-Type")
	switch contentType {
	case "image/png":
		ext = ".png"
	case "image/jpeg", "image/jpg":
		ext = ".jpg"
	case "image/gif":
		ext = ".gif"
	case "image/webp":
		ext = ".webp"
	}

	// Create temporary file
	tmpFile, err := os.CreateTemp("", "cover_*"+ext)
	if err != nil {
		return "", fmt.Errorf("failed to create temp file: %w", err)
	}
	defer tmpFile.Close()

	// Copy image data to file
	_, err = io.Copy(tmpFile, resp.Body)
	if err != nil {
		os.Remove(tmpFile.Name())
		return "", fmt.Errorf("failed to write image: %w", err)
	}

	return tmpFile.Name(), nil
}

func HTMLToEPUB(export models.DocumentExportRequest) (string, error) {
	if err := os.MkdirAll("./tmp", 0o755); err != nil {
		return "", err
	}

	// ---- Build a single sanitized HTML doc (like your DOCX path) ----
	var b strings.Builder
	b.WriteString(`<html><head><meta charset="utf-8"></head><body style="font-family: serif; line-height: 1.5; margin: 0 0 1rem;">`)

	sanitizer := bluemonday.UGCPolicy()
	// Allow minimal formatting commonly used in prose; tweak as needed
	sanitizer.AllowAttrs("style", "custom-style").OnElements("div", "p")
	sanitizer.AllowElements("em", "strong", "i", "b", "u", "br", "hr", "blockquote", "ul", "ol", "li", "span")
	sanitizer.AllowAttrs("href").OnElements("a")
	sanitizer.AllowAttrs("src", "alt", "title").OnElements("img")

	for _, htmlData := range export.HtmlByChapter {
		title := html.EscapeString(htmlData.Chapter)
		b.WriteString(`<h1>` + title + `</h1>`)
		b.WriteString(sanitizer.Sanitize(htmlData.HTML))
	}
	b.WriteString(`</body></html>`)

	// Write temp HTML
	tmpHTML, err := os.CreateTemp("", "epub_src_*.html")
	if err != nil {
		return "", err
	}
	defer os.Remove(tmpHTML.Name())
	if _, err := tmpHTML.WriteString(b.String()); err != nil {
		return "", err
	}
	_ = tmpHTML.Close()

	// ---- Optional: embed a simple CSS for better reading ----
	css := `
body { margin: 0; padding: 0.5rem 0.75rem; font-size: 1rem; }
h1 { font-size: 1.6rem; margin: 1.2rem 0 0.6rem; text-align:center; }
h2 { font-size: 1.3rem; margin: 1rem 0 0.5rem; }
p, div { margin: 0 0 0.8rem; }
blockquote { margin: 0.8rem 1rem; font-style: italic; }
img { max-width: 100%; height: auto; }
a { text-decoration: underline; }
`
	tmpCSS := filepath.Join(os.TempDir(), "epub_style_"+safeTimestamp()+".css")
	if err := os.WriteFile(tmpCSS, []byte(css), 0o644); err != nil {
		return "", err
	}
	defer os.Remove(tmpCSS)

	// ---- Output path ----
	outName := export.Title + "_" + safeTimestamp() + ".epub"
	outPath := "./tmp/" + outName

	// ---- Pandoc args ----
	args := []string{
		"-f", "html",
		"-t", "epub3",
		"--toc",
		"--toc-depth=2",
		"--epub-chapter-level=1", // split on <h1>
		"--css", tmpCSS,
		"-o", outPath,
		tmpHTML.Name(),
	}

	// If you have a cover image path on the request, include it:
	// (Add these fields to your request model as needed)
	//   CoverImagePath string `json:"cover_image_path,omitempty"`
	//   Author         string `json:"author,omitempty"`
	if export.CoverImage != nil {
		args = append([]string{"--epub-cover-image", *export.CoverImage}, args...)
	}
	if export.Author != nil {
		// Quick inline metadata; for heavier use, consider a metadata YAML
		args = append([]string{"-M", "author=" + *export.Author}, args...)
	}
	if export.Title != "" {
		args = append([]string{"-M", "title=" + export.Title}, args...)
	}

	// ---- Run pandoc with a timeout ----
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "pandoc", args...)
	if err := cmd.Run(); err != nil {
		return "", err
	}
	return outName, nil
}

func HTMLToDOCX(export models.DocumentExportRequest) (string, error) {
	if err := os.MkdirAll("./tmp", 0o755); err != nil {
		return "", err
	}

	var b strings.Builder
	b.WriteString(`
		<html>
			<head>
				<meta charset="utf-8">
			</head>
			<body style="font-family:'Times New Roman',serif;font-size:` + FONT_SIZE_DEFAULT + `;line-height:` + LINE_HEIGHT + `;margin:0">`)
	sanitizer := bluemonday.UGCPolicy()
	sanitizer.AllowAttrs("style", "custom-style").OnElements("div", "p")

	for _, htmlData := range export.HtmlByChapter {
		title := html.EscapeString(htmlData.Chapter)
		b.WriteString(`<h1>` + title + `</h1>`)
		b.WriteString(sanitizer.Sanitize(htmlData.HTML))
	}
	b.WriteString(`</body></html>`)

	tmpHTML, err := os.CreateTemp("", "html_to_docx_*.html")
	if err != nil {
		return "", err
	}
	defer os.Remove(tmpHTML.Name())
	if _, err := tmpHTML.WriteString(b.String()); err != nil {
		return "", err
	}
	_ = tmpHTML.Close()

	now := time.Now().UTC()
	iso := now.Format(time.RFC3339)
	safeTitle := sanitizeFilename(export.Title)
	docTitle := safeTitle + "_" + iso
	out := "./tmp/" + docTitle + ".docx"
	// Add a timeout so pandoc can’t hang your handler forever
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "pandoc", "-f", "html", "-t", "docx",
		"--reference-doc", "assets/custom-reference.docx",
		"-o", out, tmpHTML.Name(),
	)
	if err := cmd.Run(); err != nil {
		return "", err
	}
	return docTitle + ".docx", nil
}

func HTMLToPDF(export models.DocumentExportRequest) (string, error) {
	if err := os.MkdirAll("./tmp", 0o755); err != nil {
		return "", err
	}
	/* For code blocks: stricter preservation + monospaced font */

	// Build a single HTML document with page breaks between chapters
	var b strings.Builder
	b.WriteString(`
		<html>
			<head>
				<meta charset="utf-8">
				<style>
					@page { margin: 1in; }
					html, body, div, p, pre { 
						tab-size: 4;
						-o-tab-size: 4; /* harmless fallback */
						white-space: pre-wrap; /* preserves tabs & spaces, still allows wrapping */
					}
					pre, .code {
						white-space: pre;      /* no collapsing, no wrapping */
						font-family: "Courier New", Courier, monospace;
						tab-size: 4;
					}
					body { font-family: Arial, sans-serif; font-size:` + FONT_SIZE_DEFAULT + `; line-height:` + LINE_HEIGHT + `; margin:0; }
					.h1 { text-align:center; font-weight:bold; font-size:` + FONT_SIZE_HEADER + `; line-height:` + FONT_SIZE_HEADER + `; margin: 0 0 ` + FONT_SIZE_HEADER + ` 0; }
					.chapter { page-break-before: always; }
					.chapter:first-child { page-break-before: auto; }
					div, p { margin:0; padding:0; white-space: pre-wrap; }
				</style>
			</head>
		<body>`)

	// Prepare sanitizer once
	sanitizer := bluemonday.UGCPolicy()
	sanitizer.AllowAttrs("style").OnElements("p", "div", "pre")

	// If you still want the alignment transforms, do it more narrowly and avoid double-decodes.
	align := func(s string) string {
		s = strings.ReplaceAll(s, "’", "'")
		s = strings.ReplaceAll(s, "&#x27;", "'")
		s = strings.ReplaceAll(s, "&#39;", "'")
		s = strings.ReplaceAll(s, "“", `"`)
		s = strings.ReplaceAll(s, "”", `"`)
		s = strings.ReplaceAll(s, "&quot;", `"`)
		s = strings.ReplaceAll(s, "&#34;", `"`)
		// don’t turn &amp; back into & before sanitization; sanitizer will normalize safely
		// don’t convert em dash to double-hyphen
		// convert only your custom-style wrappers
		s = regexp.MustCompile(`(?s)<div custom-style="Centered">(.*?)</div>`).ReplaceAllString(s, `<div style="text-align:center;">$1</div>`)
		s = regexp.MustCompile(`(?s)<div custom-style="Righted">(.*?)</div>`).ReplaceAllString(s, `<div style="text-align:right;">$1</div>`)
		s = regexp.MustCompile(`(?s)<div custom-style="Justified">(.*?)</div>`).ReplaceAllString(s, `<div style="text-align:justify;">$1</div>`)
		// Generic div normalization across newlines:
		s = regexp.MustCompile(`(?s)<div>(.*?)</div>`).ReplaceAllString(s, `<div>$1</div>`)
		return s
	}

	for i, htmlData := range export.HtmlByChapter {
		title := html.EscapeString(htmlData.Chapter)
		sectionClass := "chapter"
		if i == 0 {
			sectionClass = "" // first chapter: no forced break
		}
		b.WriteString(`<section class="` + sectionClass + `">`)
		b.WriteString(`<div class="h1">` + title + `</div>`)
		raw := detab(htmlData.HTML, 4)
		body := align(raw)
		b.WriteString(sanitizer.Sanitize(body))
		b.WriteString(`</section>`)
	}
	b.WriteString(`</body></html>`)

	pdfg, err := wkhtmltopdf.NewPDFGenerator()
	if err != nil {
		return "", err
	}

	page := wkhtmltopdf.NewPageReader(strings.NewReader(b.String()))
	// Allow local @font-face or images if you add them later
	page.EnableLocalFileAccess.Set(true)

	pdfg.AddPage(page)

	// Margins can be set either via CSS @page or here; we already set @page,
	// but setting here is OK and explicit:
	pdfg.MarginTop.Set(25) // ~1in at 96dpi; wkhtmltopdf uses mm by default, but lib converts
	pdfg.MarginRight.Set(25)
	pdfg.MarginBottom.Set(25)
	pdfg.MarginLeft.Set(25)

	if err := pdfg.Create(); err != nil {
		return "", err
	}
	now := time.Now().UTC()
	iso := now.Format(time.RFC3339)
	safeTitle := sanitizeFilename(export.Title)
	docTitle := safeTitle + "_" + iso
	name := docTitle + ".pdf"
	out := "./tmp/" + name
	if err := pdfg.WriteFile(out); err != nil {
		return "", err
	}
	return name, nil
}
