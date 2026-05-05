package converters

import (
	"archive/zip"
	"io"
	"strings"
	"testing"
)

func TestMapParagraphTypographyToCustomStyle(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{
			name: "p with text-align center",
			in:   `<p style="text-align: center;">hi</p>`,
			want: `<div custom-style="Centered"><p style="text-align: center;">hi</p></div>`,
		},
		{
			name: "p with align attribute right",
			in:   `<p align="right">hi</p>`,
			want: `<div custom-style="Righted"><p align="right">hi</p></div>`,
		},
		{
			name: "p with text-align justify (alignment-only)",
			in:   `<p class="x" style="margin:0;text-align:justify;">x</p>`,
			want: `<div custom-style="Justified">`,
		},
		{
			name: "p with line-height 1.5 (line-only)",
			in:   `<p style="line-height: 1.5;">y</p>`,
			want: `<div custom-style="Line15"><p style="line-height: 1.5;">y</p></div>`,
		},
		{
			name: "p with center + line 2 (combined)",
			in:   `<p style="text-align: center; line-height: 2;">z</p>`,
			want: `<div custom-style="CenteredLineDouble">`,
		},
		{
			name: "p with justify + line 1.15 (combined)",
			in:   `<p style="text-align:justify; line-height:1.15;">w</p>`,
			want: `<div custom-style="JustifiedLine115">`,
		},
		{
			name: "div with text-align center (server-side Lexical output)",
			in:   `<div style="text-align:center;">hi</div>`,
			want: `<div custom-style="Centered">hi</div>`,
		},
		{
			name: "left/default unchanged",
			in:   `<p>plain</p>`,
			want: `<p>plain</p>`,
		},
		{
			name: "unknown line-height value leaves paragraph alone",
			in:   `<p style="line-height: 3.7;">odd</p>`,
			want: `<p style="line-height: 3.7;">odd</p>`,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := mapParagraphTypographyToCustomStyle(tc.in)
			if !strings.Contains(got, tc.want) {
				t.Errorf("expected output to contain %q\ngot %q", tc.want, got)
			}
		})
	}
}

func TestStripDocxNoise(t *testing.T) {
	in := "\tThe \u200B\uFEFF\u00ADmen \u200Cwere\u200D big.\t"
	want := "The men were big."
	got := stripDocxNoise(in)
	if got != want {
		t.Errorf("stripDocxNoise = %q, want %q", got, want)
	}
}

func TestLineSpacingOverrideStylesXML(t *testing.T) {
	xml := lineSpacingOverrideStylesXML()
	required := []string{
		`w:styleId="LineSingle"`,
		`w:styleId="Line115"`,
		`w:styleId="Line15"`,
		`w:styleId="LineDouble"`,
		`w:styleId="CenteredLineSingle"`,
		`w:styleId="CenteredLine15"`,
		`w:styleId="RightedLineDouble"`,
		`w:styleId="JustifiedLine115"`,
		`w:line="240"`,
		`w:line="276"`,
		`w:line="360"`,
		`w:line="480"`,
	}
	for _, want := range required {
		if !strings.Contains(xml, want) {
			t.Errorf("expected line-spacing styles XML to contain %q", want)
		}
	}
}

func TestBuildReferenceDocxMutatesStyles(t *testing.T) {
	typo := typography{Family: "Times New Roman", SizePx: 14, LineSpacing: 1.5}
	out, cleanup, err := buildReferenceDocx("../assets/custom-reference.docx", typo)
	if err != nil {
		t.Fatalf("buildReferenceDocx: %v", err)
	}
	defer cleanup()

	zr, err := zip.OpenReader(out)
	if err != nil {
		t.Fatalf("open mutated docx: %v", err)
	}
	defer zr.Close()

	var styles string
	for _, f := range zr.File {
		if f.Name != "word/styles.xml" {
			continue
		}
		rc, _ := f.Open()
		b, _ := io.ReadAll(rc)
		rc.Close()
		styles = string(b)
	}
	if styles == "" {
		t.Fatal("word/styles.xml not present in mutated reference doc")
	}

	if !strings.Contains(styles, `w:ascii="Times New Roman"`) {
		t.Error(`expected font family applied to <w:rFonts>; not found`)
	}
	if !strings.Contains(styles, `<w:sz w:val="28"/>`) { // 14px → 28 half-points
		t.Error(`expected <w:sz w:val="28"/>; not found`)
	}
	if !strings.Contains(styles, `w:line="360"`) { // 1.5 × 240 twentieths-of-a-point
		t.Error(`expected w:line="360"; not found`)
	}

	// Line spacing must land inside TextBody specifically (the style pandoc
	// applies to body content), preserving the existing w:before/w:after.
	textBodyIdx := strings.Index(styles, `w:styleId="TextBody"`)
	if textBodyIdx < 0 {
		t.Fatal("TextBody style block missing")
	}
	endIdx := strings.Index(styles[textBodyIdx:], `</w:style>`)
	if endIdx < 0 {
		t.Fatal("TextBody style block not closed")
	}
	textBody := styles[textBodyIdx : textBodyIdx+endIdx]
	if !strings.Contains(textBody, `w:line="360"`) {
		t.Errorf("expected TextBody to carry w:line=360; got: %s", textBody)
	}
	if !strings.Contains(textBody, `w:before="0"`) || !strings.Contains(textBody, `w:after="0"`) {
		t.Errorf("expected TextBody w:before/w:after preserved; got: %s", textBody)
	}

	// Same for FirstParagraph — its w:before="720" must survive the rewrite.
	firstIdx := strings.Index(styles, `w:styleId="FirstParagraph"`)
	if firstIdx < 0 {
		t.Fatal("FirstParagraph style block missing")
	}
	firstEnd := strings.Index(styles[firstIdx:], `</w:style>`)
	firstBody := styles[firstIdx : firstIdx+firstEnd]
	if !strings.Contains(firstBody, `w:line="360"`) {
		t.Errorf("expected FirstParagraph to carry w:line=360; got: %s", firstBody)
	}
	if !strings.Contains(firstBody, `w:before="720"`) {
		t.Errorf("expected FirstParagraph w:before=720 preserved; got: %s", firstBody)
	}
}
