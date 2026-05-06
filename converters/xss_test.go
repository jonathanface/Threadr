package converters

import (
	"strings"
	"testing"
)

func TestNodeToHTML_EscapesText(t *testing.T) {
	t.Run("escapes HTML special characters in text nodes", func(t *testing.T) {
		node := LexicalNode{
			Type: "text",
			Text: `<img src=x onerror="alert('xss')">`,
		}
		result := nodeToHTML(node)
		if strings.Contains(result, "<img") {
			t.Errorf("XSS payload was not escaped: %s", result)
		}
		if !strings.Contains(result, "&lt;img") {
			t.Errorf("Expected escaped HTML entities, got: %s", result)
		}
	})

	t.Run("escapes ampersands", func(t *testing.T) {
		node := LexicalNode{
			Type: "text",
			Text: "Tom & Jerry",
		}
		result := nodeToHTML(node)
		if !strings.Contains(result, "Tom &amp; Jerry") {
			t.Errorf("Expected escaped ampersand, got: %s", result)
		}
	})

	t.Run("escapes quotes", func(t *testing.T) {
		node := LexicalNode{
			Type: "text",
			Text: `She said "hello"`,
		}
		result := nodeToHTML(node)
		if strings.Contains(result, `"hello"`) && !strings.Contains(result, "&34;") &&
			!strings.Contains(result, "&#34;") &&
			!strings.Contains(result, "&quot;") {
			// html.EscapeString escapes " to &#34;
			if !strings.Contains(result, "&#34;") {
				t.Errorf("Expected escaped quotes, got: %s", result)
			}
		}
	})

	t.Run("escapes script tags in text", func(t *testing.T) {
		node := LexicalNode{
			Type: "text",
			Text: "<script>alert('xss')</script>",
		}
		result := nodeToHTML(node)
		if strings.Contains(result, "<script>") {
			t.Errorf("Script tag was not escaped: %s", result)
		}
	})

	t.Run("preserves formatting after escaping", func(t *testing.T) {
		node := LexicalNode{
			Type:       "text",
			Text:       "Bold & <safe>",
			TextFormat: 1, // bold
		}
		result := nodeToHTML(node)
		if !strings.Contains(result, "<strong>") {
			t.Errorf("Expected bold formatting, got: %s", result)
		}
		if !strings.Contains(result, "&amp;") {
			t.Errorf("Expected escaped ampersand, got: %s", result)
		}
		if strings.Contains(result, "<safe>") {
			t.Errorf("Tag in text should be escaped, got: %s", result)
		}
	})
}

func TestLexicalToHTML_EscapesContent(t *testing.T) {
	t.Run("full editor state with malicious text is escaped", func(t *testing.T) {
		lexicalJSON := `{
			"root": {
				"children": [{
					"type": "paragraph",
					"children": [{
						"type": "text",
						"text": "<script>alert('xss')</script>",
						"format": 0,
						"version": 1
					}],
					"direction": "ltr",
					"format": "",
					"indent": 0,
					"version": 1
				}],
				"direction": "ltr",
				"format": "",
				"indent": 0,
				"type": "root",
				"version": 1
			}
		}`

		result, err := LexicalToHTML(lexicalJSON)
		if err != nil {
			t.Fatalf("LexicalToHTML failed: %v", err)
		}
		if strings.Contains(result, "<script>") {
			t.Errorf("Script tag should be escaped in output: %s", result)
		}
	})
}
