package converters

import "time"

const (
	fontName        = "Arial"
	fontPath        = "assets/fonts/arial.ttf"
	fontSizeDefault = "12px"
	fontSizeHeader  = "18px"
	lineHeight      = "24px"
	margin1Inch     = "1in"
	// pandocTimeout caps every pandoc subprocess invocation. Pandoc's HTML→
	// {DOCX,EPUB} normally finishes in <1s; 30s is a generous backstop against
	// hangs without dragging request timeouts.
	pandocTimeout = 30 * time.Second
	// pdfMarginMM is the wkhtmltopdf page margin in millimeters (~1in).
	pdfMarginMM = 25
)
