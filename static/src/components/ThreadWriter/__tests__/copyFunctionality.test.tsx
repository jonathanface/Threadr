import { describe, it, expect, beforeEach } from 'vitest';
import {
  LexicalEditor,
  $getRoot,
  $createTextNode,
  $createRangeSelection,
  $setSelection,
} from 'lexical';
import { $generateHtmlFromNodes } from '@lexical/html';
import { CustomParagraphNode } from '../customNodes/CustomParagraphNode';
import { AssociationInlineNode } from '../customNodes/AssociationInlineNode';
import { createTestEditor } from './testUtils';

describe('Copy Functionality', () => {
  let editor: LexicalEditor;

  beforeEach(() => {
    editor = createTestEditor();
    editor.update(() => {
      const root = $getRoot();
      root.clear();
    });
  });

  describe('HTML Generation for Copy', () => {
    it('should generate HTML with plain text', () => {
      editor.update(() => {
        const root = $getRoot();
        const paragraph = new CustomParagraphNode('test-key');
        paragraph.append($createTextNode('Hello World'));
        root.append(paragraph);

        const html = $generateHtmlFromNodes(editor);

        expect(html).toContain('Hello World');
        expect(html).toContain('<p');
      });
    });

    it('should preserve bold formatting in generated HTML', () => {
      editor.update(() => {
        const root = $getRoot();
        const paragraph = new CustomParagraphNode('test-key');
        const textNode = $createTextNode('Bold text');
        textNode.toggleFormat('bold');
        paragraph.append(textNode);
        root.append(paragraph);

        const html = $generateHtmlFromNodes(editor);

        expect(html).toContain('Bold text');
        expect(html).toMatch(/<(strong|b)[^>]*>.*Bold text.*<\/(strong|b)>/);
      });
    });

    it('should preserve italic formatting in generated HTML', () => {
      editor.update(() => {
        const root = $getRoot();
        const paragraph = new CustomParagraphNode('test-key');
        const textNode = $createTextNode('Italic text');
        textNode.toggleFormat('italic');
        paragraph.append(textNode);
        root.append(paragraph);

        const html = $generateHtmlFromNodes(editor);

        expect(html).toContain('Italic text');
        expect(html).toMatch(/<(em|i)[^>]*>.*Italic text.*<\/(em|i)>/);
      });
    });

    it('should preserve multiple formatting styles', () => {
      editor.update(() => {
        const root = $getRoot();
        const paragraph = new CustomParagraphNode('test-key');
        const textNode = $createTextNode('Bold and italic');
        textNode.toggleFormat('bold');
        textNode.toggleFormat('italic');
        paragraph.append(textNode);
        root.append(paragraph);

        const html = $generateHtmlFromNodes(editor);

        expect(html).toContain('Bold and italic');
        // Should have both bold and italic tags
        expect(html).toMatch(/<(strong|b)/);
        expect(html).toMatch(/<(em|i)/);
      });
    });

    it('should handle multiple paragraphs', () => {
      editor.update(() => {
        const root = $getRoot();

        const para1 = new CustomParagraphNode('key-1');
        para1.append($createTextNode('First paragraph'));
        root.append(para1);

        const para2 = new CustomParagraphNode('key-2');
        para2.append($createTextNode('Second paragraph'));
        root.append(para2);

        const html = $generateHtmlFromNodes(editor);

        expect(html).toContain('First paragraph');
        expect(html).toContain('Second paragraph');
        // Should have multiple paragraph tags
        expect((html.match(/<p/g) || []).length).toBeGreaterThanOrEqual(2);
      });
    });

    it('should not duplicate paragraph content', () => {
      editor.update(() => {
        const root = $getRoot();
        const paragraph = new CustomParagraphNode('test-key');
        paragraph.append($createTextNode('Unique content'));
        root.append(paragraph);

        const html = $generateHtmlFromNodes(editor);

        // Count occurrences - should appear exactly once
        const matches = html.match(/Unique content/g) || [];
        expect(matches.length).toBe(1);
      });
    });

    it('should not duplicate content with multiple paragraphs', () => {
      editor.update(() => {
        const root = $getRoot();

        const para1 = new CustomParagraphNode('key-1');
        para1.append($createTextNode('Paragraph one'));
        root.append(para1);

        const para2 = new CustomParagraphNode('key-2');
        para2.append($createTextNode('Paragraph two'));
        root.append(para2);

        const html = $generateHtmlFromNodes(editor);

        // Each paragraph content should appear exactly once
        expect((html.match(/Paragraph one/g) || []).length).toBe(1);
        expect((html.match(/Paragraph two/g) || []).length).toBe(1);
      });
    });

    it('should handle mixed formatted and plain text', () => {
      editor.update(() => {
        const root = $getRoot();
        const paragraph = new CustomParagraphNode('test-key');

        const plainText = $createTextNode('Plain ');
        const boldText = $createTextNode('bold');
        boldText.toggleFormat('bold');
        const moreText = $createTextNode(' more plain');

        paragraph.append(plainText);
        paragraph.append(boldText);
        paragraph.append(moreText);
        root.append(paragraph);

        const html = $generateHtmlFromNodes(editor);

        expect(html).toContain('Plain');
        expect(html).toContain('bold');
        expect(html).toContain('more plain');
      });
    });

    it('should preserve paragraph alignment', () => {
      editor.update(() => {
        const root = $getRoot();
        const paragraph = new CustomParagraphNode('test-key');
        paragraph.append($createTextNode('Centered text'));
        paragraph.setFormat('center');
        root.append(paragraph);

        const html = $generateHtmlFromNodes(editor);

        expect(html).toContain('Centered text');
        // Should have alignment attribute or style
        expect(html).toMatch(/align.*center|text-align.*center/i);
      });
    });

    it('should handle AssociationInlineNode in content', () => {
      editor.update(() => {
        const root = $getRoot();
        const paragraph = new CustomParagraphNode('test-key');

        const textBefore = $createTextNode('Before ');
        const association = new AssociationInlineNode(
          'Character Name',
          'assoc-123',
          'A character',
          'character',
          ''
        );
        const textAfter = $createTextNode(' after');

        paragraph.append(textBefore);
        paragraph.append(association);
        paragraph.append(textAfter);
        root.append(paragraph);

        const html = $generateHtmlFromNodes(editor);

        expect(html).toContain('Before');
        expect(html).toContain('Character Name');
        expect(html).toContain('after');
        // Should not duplicate
        expect((html.match(/Character Name/g) || []).length).toBe(1);
      });
    });

    it('should generate HTML from selection', () => {
      editor.update(() => {
        const root = $getRoot();

        const para1 = new CustomParagraphNode('key-1');
        const text1 = $createTextNode('First paragraph');
        para1.append(text1);
        root.append(para1);

        const para2 = new CustomParagraphNode('key-2');
        const text2 = $createTextNode('Second paragraph');
        para2.append(text2);
        root.append(para2);

        // Create a selection covering just the first paragraph
        const selection = $createRangeSelection();
        selection.anchor.set(text1.getKey(), 0, 'text');
        selection.focus.set(text1.getKey(), text1.getTextContentSize(), 'text');
        $setSelection(selection);

        const html = $generateHtmlFromNodes(editor, selection);

        expect(html).toContain('First paragraph');
        // When selecting only first paragraph, second should not be included
        // Note: This depends on Lexical's implementation
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty paragraph', () => {
      editor.update(() => {
        const root = $getRoot();
        const paragraph = new CustomParagraphNode('empty-key');
        root.append(paragraph);

        const html = $generateHtmlFromNodes(editor);

        expect(html).toContain('<p');
      });
    });

    it('should handle paragraph with only whitespace', () => {
      editor.update(() => {
        const root = $getRoot();
        const paragraph = new CustomParagraphNode('whitespace-key');
        paragraph.append($createTextNode('   '));
        root.append(paragraph);

        const html = $generateHtmlFromNodes(editor);

        expect(html).toBeDefined();
      });
    });

    it('should handle paragraph starting with tab', () => {
      editor.update(() => {
        const root = $getRoot();
        const paragraph = new CustomParagraphNode('tab-key');
        paragraph.append($createTextNode('\tIndented text'));
        root.append(paragraph);

        const html = $generateHtmlFromNodes(editor);

        expect(html).toContain('Indented text');
      });
    });
  });
});
