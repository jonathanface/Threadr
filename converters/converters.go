package converters

import (
	"Threadr/models"
	"archive/zip"
	"context"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
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

// typography pulls user-chosen font/size/line-spacing from the export request,
// falling back to export defaults when the request leaves a field unset.
type typography struct {
	Family      string
	SizePx      int
	LineSpacing float64
}

func resolveTypography(req models.DocumentExportRequest) typography {
	t := typography{
		Family:      req.FontFamily,
		SizePx:      req.FontSize,
		LineSpacing: req.LineSpacing,
	}
	if t.Family == "" || !models.AllowedFonts[t.Family] {
		t.Family = models.DefaultFontFamily
	}
	if t.SizePx < models.MinFontSize || t.SizePx > models.MaxFontSize {
		t.SizePx = models.DefaultExportFontSize
	}
	if t.LineSpacing < models.MinLineSpacing || t.LineSpacing > models.MaxLineSpacing {
		t.LineSpacing = models.DefaultExportLineHeight
	}
	return t
}

func (t typography) cssFontStack() string {
	// Pair the chosen face with a generic fallback so renderers without the font still produce sane output.
	switch t.Family {
	case "Times New Roman", "Georgia", "EB Garamond", "Merriweather":
		return fmt.Sprintf(`"%s", serif`, t.Family)
	case "Courier New":
		return fmt.Sprintf(`"%s", monospace`, t.Family)
	default:
		return fmt.Sprintf(`"%s", sans-serif`, t.Family)
	}
}

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

// validateImageURL checks if a URL is safe to fetch (prevents SSRF attacks)
func ValidateImageURL(imageURL string) (string, error) {
	// Parse the URL
	parsedURL, err := url.Parse(imageURL)
	if err != nil {
		return "", fmt.Errorf("invalid URL: %w", err)
	}

	// Only allow HTTP and HTTPS schemes
	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		return "", fmt.Errorf("invalid URL scheme: only http and https are allowed")
	}

	// Extract hostname
	hostname := parsedURL.Hostname()
	if hostname == "" {
		return "", fmt.Errorf("invalid URL: missing hostname")
	}

	// Resolve hostname to IP addresses
	ips, err := net.LookupIP(hostname)
	if err != nil {
		return "", fmt.Errorf("failed to resolve hostname: %w", err)
	}

	// Check each resolved IP address
	for _, ip := range ips {
		// Block AWS metadata service IP explicitly
		if ip.String() == "169.254.169.254" {
			return "", fmt.Errorf("access to cloud metadata services is not allowed")
		}

		// Block loopback addresses (127.0.0.0/8, ::1)
		if ip.IsLoopback() {
			return "", fmt.Errorf("access to loopback addresses is not allowed")
		}

		// Block private IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, fc00::/7)
		if ip.IsPrivate() {
			return "", fmt.Errorf("access to private IP addresses is not allowed")
		}

		// Block link-local addresses (169.254.0.0/16, fe80::/10)
		if ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
			return "", fmt.Errorf("access to link-local addresses is not allowed")
		}

		// Block multicast addresses
		if ip.IsMulticast() {
			return "", fmt.Errorf("access to multicast addresses is not allowed")
		}
	}

	return imageURL, nil
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

	// Validate content type is an image
	contentType := resp.Header.Get("Content-Type")
	var ext string
	switch contentType {
	case "image/png":
		ext = ".png"
	case "image/jpeg", "image/jpg":
		ext = ".jpg"
	case "image/gif":
		ext = ".gif"
	case "image/webp":
		ext = ".webp"
	default:
		return "", fmt.Errorf("invalid content type: expected image, got %s", contentType)
	}

	// Create temporary file
	tmpFile, err := os.CreateTemp("", "cover_*"+ext)
	if err != nil {
		return "", fmt.Errorf("failed to create temp file: %w", err)
	}
	defer tmpFile.Close()

	// Limit file size to 10MB to prevent abuse
	maxSize := int64(10 * 1024 * 1024) // 10MB
	limitedReader := io.LimitReader(resp.Body, maxSize+1)

	// Copy image data to file
	written, err := io.Copy(tmpFile, limitedReader)
	if err != nil {
		os.Remove(tmpFile.Name())
		return "", fmt.Errorf("failed to write image: %w", err)
	}

	// Check if file exceeded size limit
	if written > maxSize {
		os.Remove(tmpFile.Name())
		return "", fmt.Errorf("image file too large: maximum 10MB allowed")
	}

	return tmpFile.Name(), nil
}

// LexicalNode represents a node in the Lexical editor state
type LexicalNode struct {
	Type       string         `json:"type"`
	Children   []LexicalNode  `json:"children,omitempty"`
	Text       string         `json:"text,omitempty"`
	Format     interface{}    `json:"format,omitempty"`
	TextFormat int            `json:"textFormat,omitempty"`
	TextStyle  string         `json:"textStyle,omitempty"`
	Direction  string         `json:"direction,omitempty"`
	Indent     int            `json:"indent,omitempty"`
	Version    int            `json:"version,omitempty"`
}

// LexicalEditorState represents the root structure of Lexical JSON
type LexicalEditorState struct {
	Root struct {
		Children  []LexicalNode `json:"children"`
		Direction string        `json:"direction"`
		Format    string        `json:"format"`
		Indent    int           `json:"indent"`
		Type      string        `json:"type"`
		Version   int           `json:"version"`
	} `json:"root"`
}

// DynamoDBValue represents a DynamoDB AttributeValue with a Value field
type DynamoDBValue struct {
	Value interface{} `json:"Value"`
}

// LexicalToHTML converts Lexical JSON format to HTML
// The input can be either a full editor state or a BlocksData structure from the mobile API
func LexicalToHTML(lexicalJSON string) (string, error) {
	// First try to parse as BlocksData (mobile app format with DynamoDB AttributeValues)
	var rawData struct {
		Items []map[string]json.RawMessage `json:"items"`
	}

	if err := json.Unmarshal([]byte(lexicalJSON), &rawData); err == nil && len(rawData.Items) > 0 {
		// This is BlocksData format - extract chunks and convert
		var htmlBuilder strings.Builder

		for _, item := range rawData.Items {
			// Extract the chunk attribute (it's wrapped in DynamoDB AttributeValue format)
			if chunkRaw, ok := item["chunk"]; ok {
				// Parse the DynamoDB AttributeValue wrapper
				var chunkWrapper DynamoDBValue
				if err := json.Unmarshal(chunkRaw, &chunkWrapper); err == nil {
					// The Value field contains the Lexical JSON as a string
					var chunkStr string
					if str, ok := chunkWrapper.Value.(string); ok {
						chunkStr = str
					} else {
						// Try to marshal and unmarshal if it's not a string
						chunkBytes, _ := json.Marshal(chunkWrapper.Value)
						chunkStr = string(chunkBytes)
					}

					// Parse the Lexical node from the chunk
					var node LexicalNode
					if err := json.Unmarshal([]byte(chunkStr), &node); err == nil {
						html := nodeToHTML(node)
						htmlBuilder.WriteString(html)
					}
				}
			}
		}

		return htmlBuilder.String(), nil
	}

	// Try to parse as a full editor state
	var editorState LexicalEditorState
	if err := json.Unmarshal([]byte(lexicalJSON), &editorState); err == nil {
		var htmlBuilder strings.Builder
		for _, child := range editorState.Root.Children {
			htmlBuilder.WriteString(nodeToHTML(child))
		}
		return htmlBuilder.String(), nil
	}

	// Try to parse as a single node
	var node LexicalNode
	if err := json.Unmarshal([]byte(lexicalJSON), &node); err != nil {
		return "", fmt.Errorf("failed to parse Lexical JSON: %w", err)
	}

	return nodeToHTML(node), nil
}

// nodeToHTML converts a single Lexical node to HTML
func nodeToHTML(node LexicalNode) string {
	var buf strings.Builder

	switch node.Type {
	case "paragraph", "custom-paragraph":
		// Get text alignment style
		var style string
		if node.Format != nil {
			switch fmt.Sprint(node.Format) {
			case "center":
				style = ` style="text-align:center;"`
			case "right":
				style = ` style="text-align:right;"`
			case "justify":
				style = ` style="text-align:justify;"`
			}
		}

		buf.WriteString("<div" + style + ">")
		for _, child := range node.Children {
			buf.WriteString(nodeToHTML(child))
		}
		buf.WriteString("</div>")

	case "text":
		text := html.EscapeString(node.Text)

		// Apply text formatting based on textFormat bitmask
		// Lexical uses bitmask: 1=bold, 2=italic, 4=strikethrough, 8=underline
		textFormat := node.TextFormat
		if textFormat&1 != 0 {
			text = "<strong>" + text + "</strong>"
		}
		if textFormat&2 != 0 {
			text = "<em>" + text + "</em>"
		}
		if textFormat&8 != 0 {
			text = "<u>" + text + "</u>"
		}
		if textFormat&4 != 0 {
			text = "<s>" + text + "</s>"
		}

		buf.WriteString(text)

	case "linebreak":
		buf.WriteString("<br>")

	case "heading":
		// Default to h1 if no specific heading level
		buf.WriteString("<h1>")
		for _, child := range node.Children {
			buf.WriteString(nodeToHTML(child))
		}
		buf.WriteString("</h1>")

	case "list":
		// Check if ordered or unordered (default to ul)
		listTag := "ul"
		buf.WriteString("<" + listTag + ">")
		for _, child := range node.Children {
			buf.WriteString(nodeToHTML(child))
		}
		buf.WriteString("</" + listTag + ">")

	case "listitem":
		buf.WriteString("<li>")
		for _, child := range node.Children {
			buf.WriteString(nodeToHTML(child))
		}
		buf.WriteString("</li>")

	case "link":
		buf.WriteString("<a>")
		for _, child := range node.Children {
			buf.WriteString(nodeToHTML(child))
		}
		buf.WriteString("</a>")

	case "quote":
		buf.WriteString("<blockquote>")
		for _, child := range node.Children {
			buf.WriteString(nodeToHTML(child))
		}
		buf.WriteString("</blockquote>")

	default:
		// For unknown node types, just process children
		for _, child := range node.Children {
			buf.WriteString(nodeToHTML(child))
		}
	}

	return buf.String()
}

func HTMLToEPUB(export models.DocumentExportRequest) (string, error) {
	if err := os.MkdirAll("./tmp", 0o755); err != nil {
		return "", err
	}

	typo := resolveTypography(export)

	// ---- Build a single sanitized HTML doc (like your DOCX path) ----
	var b strings.Builder
	b.WriteString(fmt.Sprintf(
		`<html><head><meta charset="utf-8"></head><body style="font-family: %s; line-height: %s; margin: 0 0 1rem;">`,
		typo.cssFontStack(),
		strconv.FormatFloat(typo.LineSpacing, 'f', -1, 64),
	))

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
	css := fmt.Sprintf(`
body { margin: 0; padding: 0.5rem 0.75rem; font-family: %s; font-size: %dpx; line-height: %s; }
h1 { font-size: 1.6rem; margin: 1.2rem 0 0.6rem; text-align:center; }
h2 { font-size: 1.3rem; margin: 1rem 0 0.5rem; }
p, div { margin: 0 0 0.8rem; }
blockquote { margin: 0.8rem 1rem; font-style: italic; }
img { max-width: 100%%; height: auto; }
a { text-decoration: underline; }
`,
		typo.cssFontStack(),
		typo.SizePx,
		strconv.FormatFloat(typo.LineSpacing, 'f', -1, 64),
	)
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

	typo := resolveTypography(export)
	// DOCX exports always use 12pt body text regardless of editor preference —
	// it's the manuscript-standard size, and Word readers expect it.
	typo.SizePx = models.DefaultExportFontSize

	var b strings.Builder
	b.WriteString(fmt.Sprintf(`
		<html>
			<head>
				<meta charset="utf-8">
			</head>
			<body style="font-family:%s;font-size:%dpx;line-height:%s;margin:0">`,
		typo.cssFontStack(),
		typo.SizePx,
		strconv.FormatFloat(typo.LineSpacing, 'f', -1, 64),
	))
	sanitizer := bluemonday.UGCPolicy()
	sanitizer.AllowAttrs("style", "custom-style").OnElements("div", "p")

	for _, htmlData := range export.HtmlByChapter {
		title := html.EscapeString(htmlData.Chapter)
		b.WriteString(`<h1>` + title + `</h1>`)
		b.WriteString(sanitizer.Sanitize(mapAlignmentToCustomStyle(htmlData.HTML)))
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

	// Build a reference docx whose Normal style reflects the requested typography.
	// Pandoc applies the reference doc's Normal style to body text regardless of
	// inline CSS, so this is the only way to make font/size/spacing stick.
	refDoc, refCleanup, err := buildReferenceDocx("assets/custom-reference.docx", typo)
	if err != nil {
		return "", fmt.Errorf("build reference docx: %w", err)
	}
	defer refCleanup()

	now := time.Now().UTC()
	iso := now.Format(time.RFC3339)
	safeTitle := sanitizeFilename(export.Title)
	docTitle := safeTitle + "_" + iso
	out := "./tmp/" + docTitle + ".docx"
	// Add a timeout so pandoc can’t hang your handler forever
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "pandoc", "-f", "html", "-t", "docx",
		"--reference-doc", refDoc,
		"-o", out, tmpHTML.Name(),
	)
	if err := cmd.Run(); err != nil {
		return "", err
	}
	return docTitle + ".docx", nil
}

// buildReferenceDocx returns the path to a temp .docx copy of srcPath whose
// docDefaults and Normal style have been rewritten to match typo. The cleanup
// fn deletes the temp file when called.
func buildReferenceDocx(srcPath string, typo typography) (string, func(), error) {
	src, err := zip.OpenReader(srcPath)
	if err != nil {
		// Reference doc unreadable (e.g. running outside repo root); fall back
		// to passing the original path unchanged. Pandoc will surface any real
		// error from there.
		if os.IsNotExist(err) {
			return srcPath, func() {}, nil
		}
		return "", func() {}, err
	}
	defer src.Close()

	tmp, err := os.CreateTemp("", "reference_*.docx")
	if err != nil {
		return "", func() {}, err
	}
	cleanup := func() { os.Remove(tmp.Name()) }

	zw := zip.NewWriter(tmp)
	for _, f := range src.File {
		w, err := zw.CreateHeader(&zip.FileHeader{
			Name:   f.Name,
			Method: f.Method,
		})
		if err != nil {
			zw.Close()
			tmp.Close()
			cleanup()
			return "", func() {}, err
		}
		rc, err := f.Open()
		if err != nil {
			zw.Close()
			tmp.Close()
			cleanup()
			return "", func() {}, err
		}
		if f.Name == "word/styles.xml" {
			data, err := io.ReadAll(rc)
			rc.Close()
			if err != nil {
				zw.Close()
				tmp.Close()
				cleanup()
				return "", func() {}, err
			}
			data = applyTypographyToStylesXML(data, typo)
			if _, err := w.Write(data); err != nil {
				zw.Close()
				tmp.Close()
				cleanup()
				return "", func() {}, err
			}
			continue
		}
		if _, err := io.Copy(w, rc); err != nil {
			rc.Close()
			zw.Close()
			tmp.Close()
			cleanup()
			return "", func() {}, err
		}
		rc.Close()
	}
	if err := zw.Close(); err != nil {
		tmp.Close()
		cleanup()
		return "", func() {}, err
	}
	if err := tmp.Close(); err != nil {
		cleanup()
		return "", func() {}, err
	}
	return tmp.Name(), cleanup, nil
}

// mapAlignmentToCustomStyle rewrites paragraphs whose alignment is expressed as
// inline CSS or the legacy `align` attribute into pandoc-friendly
// <div custom-style="Centered|Righted|Justified">…</div> wrappers. Pandoc's
// HTML reader silently drops text-align on the way to DOCX, but it does honor
// custom-style and applies the matching paragraph style from the reference
// docx (which already defines Centered/Righted/Justified with <w:jc>).
func mapAlignmentToCustomStyle(s string) string {
	rules := []struct {
		keyword, customStyle string
	}{
		{"center", "Centered"},
		{"right", "Righted"},
		{"justify", "Justified"},
	}
	for _, r := range rules {
		// <p ... style="…text-align:KEYWORD…" …>content</p>
		pStyleRe := regexp.MustCompile(
			`(?is)<p\b([^>]*\bstyle\s*=\s*"[^"]*\btext-align\s*:\s*` + r.keyword + `\b[^"]*"[^>]*)>(.*?)</p>`,
		)
		s = pStyleRe.ReplaceAllString(s, `<div custom-style="`+r.customStyle+`"><p$1>$2</p></div>`)
		// <p ... align="KEYWORD" …>content</p>
		pAttrRe := regexp.MustCompile(
			`(?is)<p\b([^>]*\balign\s*=\s*"` + r.keyword + `"[^>]*)>(.*?)</p>`,
		)
		s = pAttrRe.ReplaceAllString(s, `<div custom-style="`+r.customStyle+`"><p$1>$2</p></div>`)
		// <div ... style="…text-align:KEYWORD…" …>content</div>  (mobile/Lexical-server output)
		divStyleRe := regexp.MustCompile(
			`(?is)<div\b([^>]*\bstyle\s*=\s*"[^"]*\btext-align\s*:\s*` + r.keyword + `\b[^"]*"[^>]*)>(.*?)</div>`,
		)
		s = divStyleRe.ReplaceAllString(s, `<div custom-style="`+r.customStyle+`">$2</div>`)
	}
	return s
}

// rFontsRe matches a <w:rFonts ... /> element (used in docDefaults and Normal style).
var rFontsRe = regexp.MustCompile(`<w:rFonts[^/]*/>`)

// szRe matches the run-property font size element.
var szRe = regexp.MustCompile(`<w:sz w:val="\d+"/>`)

// szCsRe matches the complex-script run-property font size element.
var szCsRe = regexp.MustCompile(`<w:szCs w:val="\d+"/>`)

// spacingTagRe matches any self-closing <w:spacing .../> element so we can
// rewrite its w:line/w:lineRule while preserving w:before/w:after.
var spacingTagRe = regexp.MustCompile(`<w:spacing\s+([^/]*)/>`)

// w:line and w:lineRule attributes inside a <w:spacing> tag, used to strip
// the existing values before injecting the user's chosen line spacing.
var lineAttrRe = regexp.MustCompile(`\s*w:line="\d+"`)
var lineRuleAttrRe = regexp.MustCompile(`\s*w:lineRule="\w+"`)

var pPrOpenRe = regexp.MustCompile(`<w:pPr>`)

// bodyTextStyleIDs are the paragraph styles pandoc applies to body content
// in HTML→DOCX conversion (and the styles those inherit from). Updating their
// line spacing is what makes the user's choice visible in the rendered docx.
// Headings are intentionally excluded so their existing layout stays intact.
var bodyTextStyleIDs = []string{
	"Normal",
	"TextBody",
	"FirstParagraph",
	"Compact",
	"BlockText",
	"List",
}

func applyTypographyToStylesXML(data []byte, typo typography) []byte {
	// DOCX font sizes are in half-points; Word renders px ≈ pt for body text,
	// so we treat the user's px choice as points (matches the PDF/EPUB feel).
	sizeHalfPt := typo.SizePx * 2
	// DOCX line spacing in "auto" rule is twentieths-of-a-point per line; the
	// canonical convention is 240 = single, 360 = 1.5×, 480 = double.
	lineTwips := int(typo.LineSpacing * 240)

	fontTag := fmt.Sprintf(
		`<w:rFonts w:ascii=%q w:hAnsi=%q w:eastAsia=%q w:cs=""/>`,
		typo.Family, typo.Family, typo.Family,
	)
	szTag := fmt.Sprintf(`<w:sz w:val="%d"/>`, sizeHalfPt)
	szCsTag := fmt.Sprintf(`<w:szCs w:val="%d"/>`, sizeHalfPt)

	out := string(data)
	out = rFontsRe.ReplaceAllString(out, fontTag)
	out = szRe.ReplaceAllString(out, szTag)
	out = szCsRe.ReplaceAllString(out, szCsTag)

	// Apply line spacing inside each body-text paragraph style, preserving any
	// w:before/w:after that style relied on for vertical layout.
	for _, id := range bodyTextStyleIDs {
		out = applyLineSpacingToStyle(out, id, lineTwips)
	}

	// docDefaults pPrDefault — covers paragraph styles that don't define their
	// own <w:spacing>, so user-chosen spacing still flows through.
	defaultSpacing := fmt.Sprintf(`<w:spacing w:lineRule="auto" w:line="%d"/>`, lineTwips)
	if !strings.Contains(out, "<w:pPrDefault><w:pPr>"+defaultSpacing) {
		out = strings.Replace(
			out,
			"<w:pPrDefault><w:pPr>",
			"<w:pPrDefault><w:pPr>"+defaultSpacing,
			1,
		)
	}

	return []byte(out)
}

// applyLineSpacingToStyle finds <w:style ... w:styleId="ID">…</w:style> and
// rewrites its <w:spacing> w:line/w:lineRule (preserving other attrs) so the
// paragraph style honors the user's line spacing. If the style has no
// <w:spacing>, one is inserted at the start of <w:pPr>.
func applyLineSpacingToStyle(out, id string, lineTwips int) string {
	styleRe := regexp.MustCompile(
		`(?s)(<w:style[^>]*w:styleId="` + id + `"[^>]*>.*?</w:style>)`,
	)
	insertedSpacing := fmt.Sprintf(`<w:spacing w:lineRule="auto" w:line="%d"/>`, lineTwips)

	return styleRe.ReplaceAllStringFunc(out, func(block string) string {
		if spacingTagRe.MatchString(block) {
			return spacingTagRe.ReplaceAllStringFunc(block, func(tag string) string {
				inner := strings.TrimSuffix(strings.TrimPrefix(tag, "<w:spacing"), "/>")
				inner = lineAttrRe.ReplaceAllString(inner, "")
				inner = lineRuleAttrRe.ReplaceAllString(inner, "")
				return fmt.Sprintf(`<w:spacing w:lineRule="auto" w:line="%d"%s/>`, lineTwips, inner)
			})
		}
		if pPrOpenRe.MatchString(block) {
			return pPrOpenRe.ReplaceAllString(block, "<w:pPr>"+insertedSpacing)
		}
		return block
	})
}

func HTMLToPDF(export models.DocumentExportRequest) (string, error) {
	if err := os.MkdirAll("./tmp", 0o755); err != nil {
		return "", err
	}
	/* For code blocks: stricter preservation + monospaced font */

	typo := resolveTypography(export)
	bodyFontSize := fmt.Sprintf("%dpx", typo.SizePx)
	bodyLineHeight := strconv.FormatFloat(typo.LineSpacing, 'f', -1, 64)

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
					body { font-family:` + typo.cssFontStack() + `; font-size:` + bodyFontSize + `; line-height:` + bodyLineHeight + `; margin:0; }
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
