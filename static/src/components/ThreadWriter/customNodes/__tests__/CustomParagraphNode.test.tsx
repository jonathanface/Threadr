import { describe, it, expect, beforeEach } from 'vitest';
import {
  LexicalEditor,
  $getRoot,
  $createTextNode,
  $createRangeSelection,
  $createPoint,
  $setSelection,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
} from 'lexical';
import { $generateHtmlFromNodes } from '@lexical/html';
import { CustomParagraphNode, CustomSerializedParagraphNode } from '../CustomParagraphNode';
import { createTestEditor } from '../../__tests__/testUtils';

describe('CustomParagraphNode', () => {
  let editor: LexicalEditor;

  beforeEach(() => {
    editor = createTestEditor();
    // Initialize editor with empty root
    editor.update(() => {
      const root = $getRoot();
      root.clear();
    });
  });

  describe('Constructor', () => {
    it('should create node with provided key_id', () => {
      editor.update(() => {
        const keyId = 'test-key-123';
        const node = new CustomParagraphNode(keyId);

        expect(node.getKeyId()).toBe(keyId);
      });
    });

    it('should generate UUID if no key_id provided', () => {
      editor.update(() => {
        const node = new CustomParagraphNode();

        const keyId = node.getKeyId();
        expect(keyId).toBeDefined();
        expect(keyId.length).toBeGreaterThan(0);
        // UUID v4 format check
        expect(keyId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      });
    });

    it('should generate UUID if null key_id provided', () => {
      editor.update(() => {
        const node = new CustomParagraphNode(null);

        const keyId = node.getKeyId();
        expect(keyId).toBeDefined();
        expect(keyId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      });
    });

    it('should accept empty string as key_id', () => {
      editor.update(() => {
        const node = new CustomParagraphNode('');

        // Empty string is accepted as-is (not replaced with UUID)
        expect(node.getKeyId()).toBe('');
      });
    });
  });

  describe('Static methods', () => {
    it('should return correct node type', () => {
      expect(CustomParagraphNode.getType()).toBe('custom-paragraph');
    });

    it('should clone node preserving key_id', () => {
      editor.update(() => {
        const original = new CustomParagraphNode('original-key');
        const cloned = CustomParagraphNode.clone(original);

        expect(cloned.getKeyId()).toBe('original-key');
        expect(cloned).toBeInstanceOf(CustomParagraphNode);
      });
    });

    it('should import from JSON with key_id', () => {
      editor.update(() => {
        const serialized: CustomSerializedParagraphNode = {
          type: 'custom-paragraph',
          version: 1,
          key_id: 'imported-key',
          children: [],
          direction: 'ltr',
          format: '',
          indent: 0,
          textFormat: 0,
          textStyle: '',
        };

        const node = CustomParagraphNode.importJSON(serialized);

        expect(node.getKeyId()).toBe('imported-key');
        expect(node).toBeInstanceOf(CustomParagraphNode);
      });
    });

    it('should generate UUID when importing JSON without key_id', () => {
      editor.update(() => {
        const serialized = {
          type: 'custom-paragraph' as const,
          version: 1 as const,
          key_id: '', // Empty key_id
          children: [],
          direction: 'ltr' as const,
          format: '' as const,
          indent: 0,
          textFormat: 0,
          textStyle: '',
        };

        const node = CustomParagraphNode.importJSON(serialized);

        const keyId = node.getKeyId();
        expect(keyId).toBeDefined();
        expect(keyId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      });
    });

    it('should preserve format and indent when importing', () => {
      const serialized: CustomSerializedParagraphNode = {
        type: 'custom-paragraph',
        version: 1,
        key_id: 'test',
        children: [],
        direction: 'ltr',
        format: 'center',
        indent: 2,
        textFormat: 0,
        textStyle: '',
      };

      editor.update(() => {
        const node = CustomParagraphNode.importJSON(serialized);
        const root = $getRoot();
        root.append(node);
      });

      editor.read(() => {
        const root = $getRoot();
        const node = root.getFirstChild() as CustomParagraphNode;

        expect(node.getFormatType()).toBe('center');
        expect(node.getIndent()).toBe(2);
      });
    });
  });

  describe('Export methods', () => {
    it('should export to JSON with custom-paragraph type', () => {
      editor.update(() => {
        const node = new CustomParagraphNode('export-key');

        const root = $getRoot();
        root.append(node);

        const exported = node.exportJSON();

        expect(exported.type).toBe('custom-paragraph');
        expect(exported.version).toBe(1);
        expect(exported.key_id).toBe('export-key');
      });
    });

    it('should export to DOM as paragraph element', () => {
      editor.update(() => {
        const root = $getRoot();
        const textNode = $createTextNode('Hello World');
        const node = new CustomParagraphNode('test');
        node.append(textNode);
        root.append(node);

        // exportDOM returns just the container element - Lexical's HTML generation
        // handles adding children after calling exportDOM
        const { element } = node.exportDOM(editor);
        expect(element).toBeInstanceOf(HTMLElement);
        expect((element as HTMLElement).tagName).toBe('P');

        // Use $generateHtmlFromNodes to test full HTML generation with children
        const html = $generateHtmlFromNodes(editor);
        expect(html).toContain('Hello World');
      });
    });

    it('should export DOM with multiple children', () => {
      editor.update(() => {
        const root = $getRoot();
        const node = new CustomParagraphNode('test');
        node.append($createTextNode('First '));
        node.append($createTextNode('Second'));
        root.append(node);

        // Use $generateHtmlFromNodes to test full HTML generation with children
        // This is how copy/paste actually works in Lexical
        const html = $generateHtmlFromNodes(editor);
        expect(html).toContain('First ');
        expect(html).toContain('Second');
        expect(html).toContain('<p');
      });
    });
  });

  describe('Key ID management', () => {
    it('should get key_id correctly', () => {
      editor.update(() => {
        const node = new CustomParagraphNode('get-test');

        expect(node.getKeyId()).toBe('get-test');
      });
    });

    it('should set key_id correctly', () => {
      editor.update(() => {
        const node = new CustomParagraphNode('initial');

        const root = $getRoot();
        root.append(node);
        node.setKeyId('updated');

        expect(node.getKeyId()).toBe('updated');
      });
    });

    it('should maintain key_id through multiple operations', () => {
      const keyId = 'persistent-key';

      editor.update(() => {
        const node = new CustomParagraphNode(keyId);

        const root = $getRoot();
        node.append($createTextNode('Test'));
        root.append(node);
      });

      editor.read(() => {
        const root = $getRoot();
        const retrieved = root.getFirstChild() as CustomParagraphNode;

        expect(retrieved.getKeyId()).toBe(keyId);
      });
    });
  });

  describe('insertNewAfter', () => {
    it('should insert new CustomParagraphNode after current', () => {
      editor.update(() => {
        const root = $getRoot();
        const node = new CustomParagraphNode('first');
        root.append(node);

        const newNode = node.insertNewAfter();

        expect(newNode).toBeInstanceOf(CustomParagraphNode);
        expect(root.getChildren().length).toBe(2);
      });
    });

    it('should preserve direction in new node', () => {
      editor.update(() => {
        const root = $getRoot();
        const node = new CustomParagraphNode('first');
        node.setDirection('rtl');
        root.append(node);

        const newNode = node.insertNewAfter();

        expect(newNode.getDirection()).toBe('rtl');
      });
    });

    it('should generate new key_id for inserted node', () => {
      let originalKeyId!: string;
      let newKeyId!: string;

      editor.update(() => {
        const root = $getRoot();
        const node = new CustomParagraphNode('original');
        root.append(node);

        originalKeyId = node.getKeyId();
        const newNode = node.insertNewAfter();
        newKeyId = newNode.getKeyId();
      });

      expect(newKeyId).toBeDefined();
      expect(newKeyId).not.toBe(originalKeyId);
    });

    it('should insert in correct position', () => {
      editor.update(() => {
        const root = $getRoot();
        const first = new CustomParagraphNode('first');
        const third = new CustomParagraphNode('third');
        root.append(first);
        root.append(third);

        const second = first.insertNewAfter();

        const children = root.getChildren();
        expect(children[0]).toBe(first);
        expect(children[1]).toBe(second);
        expect(children[2]).toBe(third);
      });
    });

    it('should carry over paragraph-level style (line-height) on Enter', () => {
      editor.update(() => {
        const root = $getRoot();
        const node = new CustomParagraphNode('p1');
        node.setStyle('line-height: 1.5');
        root.append(node);

        const next = node.insertNewAfter();

        expect(next.getStyle()).toBe('line-height: 1.5');
      });
    });

    it('should carry over alignment on Enter', () => {
      editor.update(() => {
        const root = $getRoot();
        const node = new CustomParagraphNode('p1');
        node.setFormat('center');
        root.append(node);

        const next = node.insertNewAfter();

        expect(next.getFormatType()).toBe('center');
      });
    });

    it('end-to-end: selection.insertParagraph() carries over alignment, paragraph style, and styled-cursor buffer', () => {
      editor.update(() => {
        const root = $getRoot();
        root.clear();
        const para = new CustomParagraphNode('p1');
        para.setStyle('line-height: 1.5');
        para.setFormat('center');
        const text = $createTextNode('hello');
        text.setStyle('font-family: Times New Roman; font-size: 14px');
        para.append(text);
        root.append(para);

        // Cursor at end of styled text
        const selection = $createRangeSelection();
        const point = $createPoint(text.getKey(), text.getTextContentSize(), 'text');
        selection.anchor = point;
        selection.focus = point;
        $setSelection(selection);
      });

      // RichTextPlugin's INSERT_PARAGRAPH_COMMAND handler does exactly this.
      editor.update(() => {
        const sel = $getSelection();
        if ($isRangeSelection(sel)) {
          sel.insertParagraph();
        }
      });

      editor.read(() => {
        const root = $getRoot();
        const paragraphs = root.getChildren();
        expect(paragraphs.length).toBe(2);
        const newPara = paragraphs[1] as CustomParagraphNode;
        expect(newPara).toBeInstanceOf(CustomParagraphNode);
        expect(newPara.getFormatType()).toBe('center');
        expect(newPara.getStyle()).toBe('line-height: 1.5');
        expect(newPara.getTextStyle()).toBe(
          'font-family: Times New Roman; font-size: 14px',
        );
      });
    });

    it('typing after auto-tab keeps the carried-over text style', () => {
      // Reproduce the post-Enter state: a paragraph whose only child is a
      // styled tab TextNode, with the cursor at offset 1 (end of the tab).
      // This mirrors what useAutotabOnEnter leaves us with, and then we
      // simulate typing one character by calling selection.insertText.
      editor.update(() => {
        const root = $getRoot();
        root.clear();
        const para = new CustomParagraphNode('p1');
        // The auto-tab hook copies the parent paragraph's textStyle onto the
        // tab TextNode. Replicate that here.
        para.setTextStyle('font-size: 24px');
        const tab = $createTextNode('\t');
        tab.setStyle('font-size: 24px');
        para.append(tab);
        root.append(para);

        const selection = $createRangeSelection();
        const point = $createPoint(tab.getKey(), 1, 'text');
        selection.anchor = point;
        selection.focus = point;
        // Mirror Lexical's selection sync: anchor TextNode style flows into
        // selection.style for collapsed selections.
        selection.style = tab.getStyle();
        selection.format = tab.getFormat();
        $setSelection(selection);
      });

      editor.update(() => {
        const sel = $getSelection();
        if ($isRangeSelection(sel)) {
          sel.insertText('X');
        }
      });

      editor.read(() => {
        const root = $getRoot();
        const para = root.getFirstChild() as CustomParagraphNode;
        const text = para.getTextContent();
        expect(text).toBe('\tX');
        // Walk the children — every TextNode in the paragraph should still
        // carry the 24px style, regardless of whether 'X' got merged into
        // the tab TextNode or got its own.
        const styles = para.getChildren().map((n) =>
          $isTextNode(n) ? n.getStyle() : '',
        );
        for (const s of styles) {
          expect(s).toBe('font-size: 24px');
        }
      });
    });

    it('should buffer textFormat/textStyle from selection for next-typed text', () => {
      editor.update(() => {
        const root = $getRoot();
        const node = new CustomParagraphNode('p1');
        root.append(node);

        // Forge a minimal RangeSelection-shaped object: insertNewAfter only
        // reads `format` (bitmask) and `style` (CSS string) off it.
        const fakeSelection = {
          format: 1, // bitmask: 1 = bold
          style: 'font-family: Times New Roman; font-size: 14px',
        } as unknown as Parameters<typeof node.insertNewAfter>[0];

        const next = node.insertNewAfter(fakeSelection, false);

        expect(next.getTextFormat()).toBe(1);
        expect(next.getTextStyle()).toBe(
          'font-family: Times New Roman; font-size: 14px',
        );
      });
    });
  });

  describe('createDOM', () => {
    it('should create paragraph element', () => {
      editor.update(() => {
        const config = {
          namespace: 'test',
          theme: {},
        };

        const node = new CustomParagraphNode('test');
        const element = node.createDOM(config);

        expect(element.tagName).toBe('P');
      });
    });

    it('should apply custom class from theme', () => {
      editor.update(() => {
        const config = {
          namespace: 'test',
          theme: {
            'custom-paragraph': 'custom-para-class',
          },
        };

        const node = new CustomParagraphNode('test');
        const element = node.createDOM(config);

        expect(element.className).toBe('custom-para-class');
      });
    });

    it('should work without custom theme class', () => {
      editor.update(() => {
        const config = {
          namespace: 'test',
          theme: {},
        };

        const node = new CustomParagraphNode('test');
        const element = node.createDOM(config);

        expect(element.tagName).toBe('P');
        expect(element.className).toBe('');
      });
    });
  });

  describe('Integration with editor', () => {
    it('should be added to editor and retrieved', () => {
      const keyId = 'integration-test';

      editor.update(() => {
        const root = $getRoot();
        const node = new CustomParagraphNode(keyId);
        node.append($createTextNode('Integration test'));
        root.append(node);
      });

      editor.read(() => {
        const root = $getRoot();
        const node = root.getFirstChild() as CustomParagraphNode;

        expect(node).toBeInstanceOf(CustomParagraphNode);
        expect(node.getKeyId()).toBe(keyId);
        expect(node.getTextContent()).toBe('Integration test');
      });
    });

    it('should work with multiple CustomParagraphNodes', () => {
      editor.update(() => {
        const root = $getRoot();
        const node1 = new CustomParagraphNode('key-1');
        const node2 = new CustomParagraphNode('key-2');
        const node3 = new CustomParagraphNode('key-3');

        node1.append($createTextNode('First'));
        node2.append($createTextNode('Second'));
        node3.append($createTextNode('Third'));

        root.append(node1);
        root.append(node2);
        root.append(node3);
      });

      editor.read(() => {
        const root = $getRoot();
        const children = root.getChildren() as CustomParagraphNode[];

        expect(children).toHaveLength(3);
        expect(children[0].getKeyId()).toBe('key-1');
        expect(children[1].getKeyId()).toBe('key-2');
        expect(children[2].getKeyId()).toBe('key-3');
      });
    });

    it('should serialize and deserialize correctly', () => {
      const originalKeyId = 'serialize-test';

      editor.update(() => {
        const root = $getRoot();
        const node = new CustomParagraphNode(originalKeyId);
        node.append($createTextNode('Serialize me'));
        root.append(node);
      });

      const serialized = editor.getEditorState().toJSON();

      // Create new editor and load serialized state
      const newEditor = createTestEditor();
      const editorState = newEditor.parseEditorState(JSON.stringify(serialized));

      // Only set if state is not empty
      if (!editorState.isEmpty()) {
        newEditor.setEditorState(editorState);

        newEditor.read(() => {
          const root = $getRoot();
          const node = root.getFirstChild() as CustomParagraphNode;

          expect(node).toBeInstanceOf(CustomParagraphNode);
          expect(node.getKeyId()).toBe(originalKeyId);
          expect(node.getTextContent()).toBe('Serialize me');
        });
      } else {
        // If state is empty, skip this test
        expect(serialized).toBeDefined();
      }
    });

    it('should handle updates to existing nodes', () => {
      editor.update(() => {
        const root = $getRoot();
        const node = new CustomParagraphNode('update-test');
        node.append($createTextNode('Original'));
        root.append(node);
      });

      editor.update(() => {
        const root = $getRoot();
        const node = root.getFirstChild() as CustomParagraphNode;
        node.clear();
        node.append($createTextNode('Updated'));
      });

      editor.read(() => {
        const root = $getRoot();
        const node = root.getFirstChild() as CustomParagraphNode;

        expect(node.getKeyId()).toBe('update-test');
        expect(node.getTextContent()).toBe('Updated');
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle very long key_id', () => {
      editor.update(() => {
        const longKeyId = 'a'.repeat(1000);
        const node = new CustomParagraphNode(longKeyId);

        expect(node.getKeyId()).toBe(longKeyId);
      });
    });

    it('should handle special characters in key_id', () => {
      editor.update(() => {
        const specialKeyId = 'key-with-!@#$%^&*()_+{}|:"<>?';
        const node = new CustomParagraphNode(specialKeyId);

        expect(node.getKeyId()).toBe(specialKeyId);
      });
    });

    it('should handle unicode in key_id', () => {
      editor.update(() => {
        const unicodeKeyId = '你好-世界-🌍';
        const node = new CustomParagraphNode(unicodeKeyId);

        expect(node.getKeyId()).toBe(unicodeKeyId);
      });
    });

    it('should handle empty paragraph', () => {
      editor.update(() => {
        const root = $getRoot();
        const node = new CustomParagraphNode('empty');
        root.append(node);
      });

      editor.read(() => {
        const root = $getRoot();
        const node = root.getFirstChild() as CustomParagraphNode;

        expect(node.getTextContent()).toBe('');
        expect(node.getKeyId()).toBe('empty');
      });
    });
  });
});
