package converters

import (
	"RichDocter/models"
	"fmt"
	"io"
	"os"
	"os/exec"
	"regexp"
	"strings"

	"github.com/SebastiaanKlippert/go-wkhtmltopdf"
	"github.com/google/uuid"
	"github.com/microcosm-cc/bluemonday"
)

const (
	FONT_NAME         = "Arial"
	FONT_PATH         = "fonts/arial.ttf"
	FONT_SIZE_DEFAULT = "12px"
	FONT_SIZE_HEADER  = "18px"
	LINE_HEIGHT       = "24px"
	MARGIN_1INCH      = "1in"
)

var regexes = []*regexp.Regexp{
	regexp.MustCompile(`<CENTER>(.*?)<\/CENTER>`),
	regexp.MustCompile(`<RIGHT>(.*?)<\/RIGHT>`),
	regexp.MustCompile(`<JUSTIFY>(.*?)<\/JUSTIFY>`),
	regexp.MustCompile(`’`),
	regexp.MustCompile(`&#x27;`),
	regexp.MustCompile(`&#39;`),
	regexp.MustCompile(`“`),
	regexp.MustCompile(`”`),
	regexp.MustCompile(`&quot;`),
	regexp.MustCompile(`&#34;`),
	regexp.MustCompile(`—`),
	regexp.MustCompile(`<p>(.*?)<\/p>`),
	regexp.MustCompile(`&amp;`),
}
var reMatches = []string{
	`<p style="margin:0;padding:0;white-space:pre-wrap;text-align:center;">$1</p>`,
	`<p style="margin:0;padding:0;white-space:pre-wrap;text-align:right;">$1</p>`,
	`<p style="margin:0;padding:0;white-space:pre-wrap;text-align:justify;">$1</p>`,
	`'`,
	`'`,
	`'`,
	`"`,
	`"`,
	`"`,
	`"`,
	`--`,
	`<p style="margin:0;padding:0;white-space:pre-wrap;">$1</p>`,
	`&`,
}

func HTMLToDOCX(export models.DocumentExportRequest) (filename string, err error) {
	htmlContent := `<html><body style="font-family:Arial,san-serif;font-size:` + FONT_SIZE_DEFAULT + `;line-height:` + LINE_HEIGHT + `;margin:0">`
	for _, htmlData := range export.HtmlByChapter {
		for idx, re := range regexes {
			htmlData.HTML = re.ReplaceAllString(htmlData.HTML, reMatches[idx])
		}
		sanitizer := bluemonday.UGCPolicy()
		sanitizer.AllowAttrs("style").OnElements("p")
		sanitizedHTML := sanitizer.Sanitize(htmlData.HTML)
		chapterTitle := fmt.Sprintf(`<h1>%s</h1>`, htmlData.Chapter)
		htmlContent += chapterTitle + sanitizedHTML
	}
	htmlContent += "</body></html>"

	// Create a temporary HTML file
	tmpFile, err := os.CreateTemp("", "html_to_docx_*.html")
	if err != nil {
		fmt.Println("creating temp html file err", err)
		return "", err
	}
	defer os.Remove(tmpFile.Name())

	// Write HTML content to the temporary file
	_, err = tmpFile.WriteString(htmlContent)
	if err != nil {
		fmt.Println("writing html to temp file error", err)
		return "", err
	}
	tmpFile.Close()

	// Convert HTML to DOCX using Pandoc command-line tool
	filename = uuid.NewString()
	cmd := exec.Command("pandoc", "-f", "html", "-t", "docx", "--reference-doc", "bins/custom-reference.docx", "-o", "./tmp/"+filename, tmpFile.Name())

	// Execute the command
	err = cmd.Run()
	if err != nil {
		fmt.Println("pandoc error", err)
		return "", err
	}
	return filename, nil
}

func HTMLToPDF(export models.DocumentExportRequest) (filename string, err error) {
	pdfg, err := wkhtmltopdf.NewPDFGenerator()
	if err != nil {
		return "", err
	}
	htmlContent := `<html><body style="font-family:Arial,san-serif;font-size:` + FONT_SIZE_DEFAULT + `;line-height:` + LINE_HEIGHT + `;margin:0">`
	for _, htmlData := range export.HtmlByChapter {
		for idx, re := range regexes {
			htmlData.HTML = re.ReplaceAllString(htmlData.HTML, reMatches[idx])
		}
		sanitizer := bluemonday.UGCPolicy()
		sanitizer.AllowAttrs("style").OnElements("p")
		sanitizedHTML := sanitizer.Sanitize(htmlData.HTML)
		chapterTitle := fmt.Sprintf(`<div style="page-break-before: always; margin: 0; margin-bottom: %s; padding: 0; text-align: center; font-weight: bold; font-size: %s; line-height: %s;">%s</div>`, FONT_SIZE_HEADER, FONT_SIZE_HEADER, FONT_SIZE_HEADER, htmlData.Chapter)
		htmlContent += chapterTitle + sanitizedHTML
		pdfg.AddPage(wkhtmltopdf.NewPageReader(strings.NewReader(htmlContent)))
	}
	htmlContent += "</body></html>"

	safeTitle := uuid.New()
	filename = fmt.Sprintf("%s.pdf", safeTitle)
	cmd := exec.Command("wkhtmltopdf",
		"--margin-top", "1in",
		"--margin-right", "1in",
		"--margin-bottom", "1in",
		"--margin-left", "1in",
		"-", // Read HTML from stdin
		"./tmp/"+filename,
	)

	// Get pipes for stdin and stdout
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return "", err
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "", err
	}

	// Start the command
	if err := cmd.Start(); err != nil {
		return "", err
	}

	// Write HTML string to stdin
	_, err = io.WriteString(stdin, htmlContent)
	if err != nil {
		return "", err
	}
	stdin.Close() // Close stdin to signal end of input

	// Read the generated PDF from stdout
	file, err := os.Create("./tmp/" + filename)
	if err != nil {
		return "", err
	}
	defer file.Close()

	_, err = io.Copy(file, stdout)
	if err != nil {
		return "", err
	}

	// Wait for the command to finish
	if err := cmd.Wait(); err != nil {
		return "", err
	}
	return filename, nil
}
