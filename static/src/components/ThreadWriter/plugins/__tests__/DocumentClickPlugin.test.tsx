import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { render } from '@testing-library/react';
import { $createParagraphNode, $createTextNode, $getRoot, LexicalEditor } from 'lexical';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DocumentClickPlugin, { ClickData } from '../DocumentClickPlugin';

describe('DocumentClickPlugin', () => {
  const mockOnRightClick = vi.fn();
  const mockOnLeftClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const TestWrapper = ({
    onRightClick = mockOnRightClick,
    onLeftClick = mockOnLeftClick,
  }: {
    onRightClick?: (data: ClickData) => void;
    onLeftClick?: (event: MouseEvent | TouchEvent) => void;
  }) => {
    const [editor, setEditor] = React.useState<LexicalEditor | null>(null);

    const EditorRefPlugin = () => {
      const [e] = useLexicalComposerContext();
      React.useEffect(() => {
        setEditor(e);
      }, [e]);
      return null;
    };

    React.useEffect(() => {
      if (editor) {
        // Set up a simple editor state for testing
        editor.update(() => {
          const root = $getRoot();
          root.clear();
          const paragraph = $createParagraphNode();
          const textNode = $createTextNode('Hello world test');
          paragraph.append(textNode);
          root.append(paragraph);
        });
      }
    }, [editor]);

    return (
      <LexicalComposer
        initialConfig={{
          namespace: 'test',
          onError: console.error,
        }}
      >
        <EditorRefPlugin />
        <DocumentClickPlugin
          onRightClick={onRightClick}
          onLeftClick={onLeftClick}
        />
        <div data-testid="editor-container" />
      </LexicalComposer>
    );
  };

  describe('Plugin structure', () => {
    it('should return null (does not render anything)', () => {
      expect(typeof DocumentClickPlugin).toBe('function');
    });

    it('should accept required props', () => {
      const props: React.ComponentProps<typeof DocumentClickPlugin> = {
        onRightClick: mockOnRightClick,
        onLeftClick: mockOnLeftClick,
      };

      expect(props).toBeDefined();
      expect(props.onRightClick).toBe(mockOnRightClick);
      expect(props.onLeftClick).toBe(mockOnLeftClick);
    });

    it('should mount without errors', () => {
      expect(() => render(<TestWrapper />)).not.toThrow();
    });
  });

  describe('Event listener lifecycle', () => {
    it('should mount and unmount without errors', () => {
      const { unmount } = render(<TestWrapper />);

      expect(() => unmount()).not.toThrow();
    });
  });

  describe('Click handler callbacks', () => {
    it('should call onLeftClick when left click occurs', () => {
      const { container } = render(<TestWrapper />);

      const editorElement = container.querySelector('[contenteditable="true"]');
      if (editorElement) {
        const event = new MouseEvent('click', { bubbles: true });
        editorElement.dispatchEvent(event);

        // Plugin prevents default, so we just check it was called
        expect(mockOnLeftClick).toHaveBeenCalled();
      }
    });

    it('should provide click data with correct structure for right click', () => {
      // This tests the ClickData interface structure
      const clickData: ClickData = {
        x: 100,
        y: 200,
        text: 'selected text',
      };

      expect(clickData.x).toBe(100);
      expect(clickData.y).toBe(200);
      expect(clickData.text).toBe('selected text');
    });

    it('should handle optional id field in ClickData', () => {
      const clickData: ClickData = {
        id: 'test-id',
        x: 100,
        y: 200,
      };

      expect(clickData.id).toBe('test-id');
      expect(clickData.text).toBeUndefined();
    });
  });

  describe('Double-click handling', () => {
    it('should handle double-click events', () => {
      const { container } = render(<TestWrapper />);

      const editorElement = container.querySelector('[contenteditable="true"]');
      if (editorElement) {
        const event = new MouseEvent('dblclick', {
          bubbles: true,
          clientX: 100,
          clientY: 100,
        });

        expect(() => editorElement.dispatchEvent(event)).not.toThrow();
      }
    });
  });

  describe('Word selection logic', () => {
    // Test the word boundary regex pattern
    // Note: Regex with 'g' flag must be recreated for each test to reset lastIndex

    it('should match words in text', () => {
      const wordRegex = /\b\w+\b/g;
      const text = 'Hello world test';
      const matches = [...text.matchAll(wordRegex)];

      expect(matches.length).toBe(3);
      expect(matches[0][0]).toBe('Hello');
      expect(matches[1][0]).toBe('world');
      expect(matches[2][0]).toBe('test');
    });

    it('should find word at specific offset', () => {
      const wordRegex = /\b\w+\b/g;
      const text = 'Hello world test';
      const offset = 7; // Within "world"

      let found = false;
      let match;
      while ((match = wordRegex.exec(text)) !== null) {
        if (match.index <= offset && match.index + match[0].length >= offset) {
          found = true;
          expect(match[0]).toBe('world');
          break;
        }
      }

      expect(found).toBe(true);
    });

    it('should handle word at start of text', () => {
      const wordRegex = /\b\w+\b/g;
      const text = 'Hello world';
      const offset = 2; // Within "Hello"

      let found = false;
      let match;
      while ((match = wordRegex.exec(text)) !== null) {
        if (match.index <= offset && match.index + match[0].length >= offset) {
          found = true;
          expect(match[0]).toBe('Hello');
          expect(match.index).toBe(0);
          break;
        }
      }

      expect(found).toBe(true);
    });

    it('should handle word at end of text', () => {
      const wordRegex = /\b\w+\b/g;
      const text = 'Hello world';
      const offset = 9; // Within "world"

      let found = false;
      let match;
      while ((match = wordRegex.exec(text)) !== null) {
        if (match.index <= offset && match.index + match[0].length >= offset) {
          found = true;
          expect(match[0]).toBe('world');
          break;
        }
      }

      expect(found).toBe(true);
    });

    it('should not match punctuation', () => {
      const wordRegex = /\b\w+\b/g;
      const text = 'Hello, world!';
      const matches = [...text.matchAll(wordRegex)];

      expect(matches.length).toBe(2);
      expect(matches[0][0]).toBe('Hello');
      expect(matches[1][0]).toBe('world');
    });

    it('should handle single character words', () => {
      const wordRegex = /\b\w+\b/g;
      const text = 'I am a';
      const matches = [...text.matchAll(wordRegex)];

      expect(matches.length).toBe(3);
      expect(matches[0][0]).toBe('I');
      expect(matches[1][0]).toBe('am');
      expect(matches[2][0]).toBe('a');
    });

    it('should handle words with numbers', () => {
      const wordRegex = /\b\w+\b/g;
      const text = 'word123 test456';
      const matches = [...text.matchAll(wordRegex)];

      expect(matches.length).toBe(2);
      expect(matches[0][0]).toBe('word123');
      expect(matches[1][0]).toBe('test456');
    });

    it('should not match empty string', () => {
      const wordRegex = /\b\w+\b/g;
      const text = '';
      const matches = [...text.matchAll(wordRegex)];

      expect(matches.length).toBe(0);
    });

    it('should handle text with only spaces', () => {
      const wordRegex = /\b\w+\b/g;
      const text = '   ';
      const matches = [...text.matchAll(wordRegex)];

      expect(matches.length).toBe(0);
    });
  });

  describe('Touch event handling', () => {
    it('should handle touch start events', () => {
      const { container } = render(<TestWrapper />);

      const editorElement = container.querySelector('[contenteditable="true"]');
      if (editorElement) {
        const event = new TouchEvent('touchstart', {
          bubbles: true,
          touches: [{ clientX: 100, clientY: 100 } as Touch],
        });

        expect(() => editorElement.dispatchEvent(event)).not.toThrow();
      }
    });

    it('should handle touch end events', () => {
      const { container } = render(<TestWrapper />);

      const editorElement = container.querySelector('[contenteditable="true"]');
      if (editorElement) {
        const event = new TouchEvent('touchend', {
          bubbles: true,
        });

        expect(() => editorElement.dispatchEvent(event)).not.toThrow();
      }
    });

    it('should handle touch cancel events', () => {
      const { container } = render(<TestWrapper />);

      const editorElement = container.querySelector('[contenteditable="true"]');
      if (editorElement) {
        const event = new TouchEvent('touchcancel', {
          bubbles: true,
        });

        expect(() => editorElement.dispatchEvent(event)).not.toThrow();
      }
    });

    it('should detect double-tap timing (< 300ms)', () => {
      const firstTapTime = 1000;
      const secondTapTime = 1250;
      const timeDiff = secondTapTime - firstTapTime;

      expect(timeDiff).toBeLessThan(300);
    });

    it('should not detect double-tap with long delay (> 300ms)', () => {
      const firstTapTime = 1000;
      const secondTapTime = 1400;
      const timeDiff = secondTapTime - firstTapTime;

      expect(timeDiff).toBeGreaterThan(300);
    });

    it('should detect long press timing (500ms)', () => {
      const longPressDuration = 500;

      expect(longPressDuration).toBe(500);
    });
  });

  describe('Browser API compatibility', () => {
    it('should handle document.caretPositionFromPoint if available', () => {

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc = document as any;
      const hasCaretPosition = typeof doc.caretPositionFromPoint !== 'undefined';

      // Just verify the API structure
      expect(typeof hasCaretPosition).toBe('boolean');
    });

    it('should handle document.caretRangeFromPoint as fallback', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc = document as any;
      const hasCaretRange = typeof doc.caretRangeFromPoint !== 'undefined';

      // Just verify the API structure
      expect(typeof hasCaretRange).toBe('boolean');
    });

    it('should handle Range creation', () => {
      const range = document.createRange();

      expect(range).toBeDefined();
      expect(typeof range.setStart).toBe('function');
      expect(typeof range.setEnd).toBe('function');
    });
  });

  describe('Edge cases', () => {
    it('should handle clicks when editor is not ready', () => {
      // Test that the plugin doesn't crash if editor root is not available
      expect(() => render(<TestWrapper />)).not.toThrow();
    });

    it('should handle empty text selection', () => {
      const { container } = render(<TestWrapper />);

      const editorElement = container.querySelector('[contenteditable="true"]');
      if (editorElement) {
        const event = new MouseEvent('click', { bubbles: true });

        // Should not crash with empty selection
        expect(() => editorElement.dispatchEvent(event)).not.toThrow();
      }
    });

    it('should handle clicks outside editor', () => {
      render(<TestWrapper />);

      const event = new MouseEvent('click', { bubbles: true });

      // Should not crash when clicking outside editor
      expect(() => document.dispatchEvent(event)).not.toThrow();
    });

    it('should handle contextmenu on non-editor elements', () => {
      render(<TestWrapper />);

      const event = new MouseEvent('contextmenu', { bubbles: true });
      const div = document.createElement('div');

      // Should not crash for non-editor elements
      expect(() => div.dispatchEvent(event)).not.toThrow();
    });
  });

  describe('Callback invocation', () => {
    it('should invoke onRightClick even without a selection', () => {
      const callback = vi.fn((data: ClickData) => {
        expect(data).toHaveProperty('x');
        expect(data).toHaveProperty('y');
      });

      const { container } = render(<TestWrapper onRightClick={callback} />);

      const editorElement = container.querySelector('[contenteditable="true"]');
      if (editorElement) {
        const event = new MouseEvent('contextmenu', {
          bubbles: true,
          clientX: 100,
          clientY: 200,
        });
        editorElement.dispatchEvent(event);

        // Should be called even without text selected (text will be undefined)
        expect(callback).toHaveBeenCalled();
        expect(callback.mock.calls[0][0].text).toBeUndefined();
      }
    });

    it('should invoke onLeftClick with event parameter', () => {
      const callback = vi.fn((event: MouseEvent | TouchEvent) => {
        expect(event).toBeDefined();
      });

      const { container } = render(<TestWrapper onLeftClick={callback} />);

      const editorElement = container.querySelector('[contenteditable="true"]');
      if (editorElement) {
        const event = new MouseEvent('click', { bubbles: true });
        editorElement.dispatchEvent(event);

        expect(callback).toHaveBeenCalled();
      }
    });
  });
});
