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
	// docxHalfPointsPerPoint converts a point value to DOCX's half-point unit
	// used by <w:sz>/<w:szCs>. We treat the request's px choice as points.
	docxHalfPointsPerPoint = 2
	// docxTwipsPerLine is the DOCX "auto" line-spacing unit (twentieths of a
	// point per line). Canonical values: 240 = single, 360 = 1.5×, 480 = double.
	docxTwipsPerLine = 240
	// tmpDirPerm is the permission mask for ./tmp scratch dirs created during
	// export. Owner+group only (the running process is the sole consumer).
	tmpDirPerm = 0o750
	// tmpFilePerm is the permission mask for files written to a scratch dir.
	tmpFilePerm = 0o600
	// maxZipEntrySize caps the decompressed size of a single zip entry to
	// guard against decompression-bomb DOCX uploads. 50 MB is well above any
	// legitimate single-file payload (document.xml, styles.xml, embedded media)
	// while still bounding worst-case memory/disk pressure.
	maxZipEntrySize = 50 * 1024 * 1024
)
