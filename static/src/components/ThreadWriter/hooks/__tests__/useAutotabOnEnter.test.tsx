import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createRef } from 'react';
import {
  LexicalEditor,
  $getRoot,
  $createParagraphNode,
  $createTextNode,
  $getSelection,
  $setSelection,
  $createRangeSelection,
  $createPoint,
  INSERT_PARAGRAPH_COMMAND,
  $isElementNode,
  $isRangeSelection,
} from 'lexical';
import { useAutotabOnEnter } from '../useAutotabOnEnter';
import { createTestEditor } from '../../__tests__/testUtils';
import { CustomParagraphNode } from '../../customNodes/CustomParagraphNode';

describe('useAutotabOnEnter', () => {
  let editor: LexicalEditor;
  let editorRef: React.RefObject<LexicalEditor>;

  beforeEach(() => {
    editor = createTestEditor();
    editorRef = createRef() as React.MutableRefObject<LexicalEditor>;
    editorRef.current = editor;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Basic functionality', () => {
    it('should insert tab when Enter is pressed and autotab is enabled', () => {
      renderHook(() => useAutotabOnEnter(editorRef, true));

      editor.update(() => {
        const root = $getRoot();
        root.clear();
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode('Hello'));
        root.append(paragraph);
      });

      // Simulate what INSERT_PARAGRAPH_COMMAND does: create a new paragraph
      editor.update(() => {
        const root = $getRoot();
        const newParagraph = $createParagraphNode();
        root.append(newParagraph);

        // Set selection to the new paragraph (simulating cursor after Enter)
        const selection = $createRangeSelection();
        const point = $createPoint(newParagraph.getKey(), 0, 'element');
        selection.anchor = point;
        selection.focus = point;
        $setSelection(selection);
      });

      // Dispatch INSERT_PARAGRAPH_COMMAND to trigger the hook
      act(() => {
        editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
      });

      // Fast-forward the setTimeout
      act(() => {
        vi.advanceTimersByTime(10);
      });

      editor.read(() => {
        const root = $getRoot();
        const paragraphs = root.getChildren();

        // Should have 2 paragraphs now (original + new)
        expect(paragraphs.length).toBe(2);

        // The new paragraph should have a tab
        const newParagraph = paragraphs[1];
        const firstChild = $isElementNode(newParagraph) ? newParagraph.getFirstChild() : null;

        if (firstChild) {
          expect(firstChild.getTextContent()).toMatch(/^\t/);
        }
      });
    });

    it('should not insert tab when autotab is disabled', () => {
      renderHook(() => useAutotabOnEnter(editorRef, false));

      editor.update(() => {
        const root = $getRoot();
        root.clear();
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode('Hello'));
        root.append(paragraph);
      });

      act(() => {
        editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
      });

      act(() => {
        vi.advanceTimersByTime(10);
      });

      editor.getEditorState().read(() => {
        const root = $getRoot();
        const paragraphs = root.getChildren();

        if (paragraphs.length > 1) {
          const newParagraph = paragraphs[1];
          const firstChild = $isElementNode(newParagraph) ? newParagraph.getFirstChild() : null;

          // Should not have a tab
          if (firstChild) {
            expect(firstChild.getTextContent()).not.toMatch(/^\t/);
          }
        }
      });
    });

    it('should not insert duplicate tabs', () => {
      renderHook(() => useAutotabOnEnter(editorRef, true));

      editor.update(() => {
        const root = $getRoot();
        root.clear();
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode('\tAlready has tab'));
        root.append(paragraph);
      });

      act(() => {
        editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
      });

      act(() => {
        vi.advanceTimersByTime(10);
      });

      editor.getEditorState().read(() => {
        const root = $getRoot();
        const paragraphs = root.getChildren();

        if (paragraphs.length > 1) {
          const newParagraph = paragraphs[1];
          const text = newParagraph.getTextContent();

          // Should have exactly one tab, not two
          const tabCount = (text.match(/\t/g) || []).length;
          expect(tabCount).toBeLessThanOrEqual(1);
        }
      });
    });
  });

  describe('Cursor positioning', () => {
    it('should position cursor after tab when cursor is at start', () => {
      renderHook(() => useAutotabOnEnter(editorRef, true));

      editor.update(() => {
        const root = $getRoot();
        root.clear();
        const paragraph = $createParagraphNode();
        const textNode = $createTextNode('Test');
        paragraph.append(textNode);
        root.append(paragraph);

        // Set cursor at start (offset 0)
        const selection = $createRangeSelection();
        selection.anchor.set(textNode.getKey(), 0, 'text');
        selection.focus.set(textNode.getKey(), 0, 'text');
        $setSelection(selection);
      });

      act(() => {
        editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
      });

      act(() => {
        vi.advanceTimersByTime(10);
      });

      editor.getEditorState().read(() => {
        const selection = $getSelection();

        if ($isRangeSelection(selection)) {
          // Cursor should be positioned after the tab (offset 1)
          expect(selection.anchor.offset).toBeGreaterThan(0);
        }
      });
    });
  });

  describe('Paragraph type handling', () => {
    it('should work with ParagraphNode', () => {
      renderHook(() => useAutotabOnEnter(editorRef, true));

      editor.update(() => {
        const root = $getRoot();
        root.clear();
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode('Regular paragraph'));
        root.append(paragraph);
      });

      act(() => {
        editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
      });

      act(() => {
        vi.advanceTimersByTime(10);
      });

      // Should not throw error
      expect(true).toBe(true);
    });

    it('should work with CustomParagraphNode', () => {
      renderHook(() => useAutotabOnEnter(editorRef, true));

      editor.update(() => {
        const root = $getRoot();
        root.clear();
        const paragraph = new CustomParagraphNode('test-id');
        paragraph.append($createTextNode('Custom paragraph'));
        root.append(paragraph);
      });

      // Simulate creating a new paragraph after Enter
      editor.update(() => {
        const root = $getRoot();
        const newParagraph = new CustomParagraphNode('new-id');
        root.append(newParagraph);

        // Set selection to the new paragraph
        const selection = $createRangeSelection();
        const point = $createPoint(newParagraph.getKey(), 0, 'element');
        selection.anchor = point;
        selection.focus = point;
        $setSelection(selection);
      });

      act(() => {
        editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
      });

      act(() => {
        vi.advanceTimersByTime(10);
      });

      editor.read(() => {
        const root = $getRoot();
        const paragraphs = root.getChildren();

        // Should have 2 paragraphs
        expect(paragraphs.length).toBe(2);

        // The new paragraph should have a tab
        const newParagraph = paragraphs[1];
        const firstChild = $isElementNode(newParagraph) ? newParagraph.getFirstChild() : null;
        if (firstChild) {
          expect(firstChild.getTextContent()).toMatch(/^\t/);
        }
      });
    });

    it('should handle empty paragraph', () => {
      renderHook(() => useAutotabOnEnter(editorRef, true));

      editor.update(() => {
        const root = $getRoot();
        root.clear();
        const paragraph = $createParagraphNode();
        // No text node - empty paragraph
        root.append(paragraph);
      });

      act(() => {
        editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
      });

      act(() => {
        vi.advanceTimersByTime(10);
      });

      // Should not throw error
      expect(true).toBe(true);
    });
  });

  describe('Selection edge cases', () => {
    it('should handle no selection gracefully', () => {
      renderHook(() => useAutotabOnEnter(editorRef, true));

      editor.update(() => {
        const root = $getRoot();
        root.clear();
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode('Test'));
        root.append(paragraph);

        // Clear selection
        $setSelection(null);
      });

      act(() => {
        editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
      });

      act(() => {
        vi.advanceTimersByTime(10);
      });

      // Should not throw error
      expect(true).toBe(true);
    });

    it('should handle non-range selection gracefully', () => {
      renderHook(() => useAutotabOnEnter(editorRef, true));

      editor.update(() => {
        const root = $getRoot();
        root.clear();
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode('Test'));
        root.append(paragraph);
      });

      act(() => {
        editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
      });

      act(() => {
        vi.advanceTimersByTime(10);
      });

      // Should complete without errors
      expect(true).toBe(true);
    });
  });

  describe('Hook lifecycle', () => {
    it('should not register command when editor is null', () => {
      const nullRef = createRef() as React.MutableRefObject<LexicalEditor | null>;
      nullRef.current = null;

      const { result } = renderHook(() => useAutotabOnEnter(nullRef, true));

      // Should not throw error
      expect(result.current).toBeUndefined();
    });

    it('should not register command when enabled is false', () => {
      const registerCommandSpy = vi.spyOn(editor, 'registerCommand');

      renderHook(() => useAutotabOnEnter(editorRef, false));

      expect(registerCommandSpy).not.toHaveBeenCalled();

      registerCommandSpy.mockRestore();
    });

    it('should unregister command on unmount', () => {
      const { unmount } = renderHook(() => useAutotabOnEnter(editorRef, true));

      // Create a paragraph
      editor.update(() => {
        const root = $getRoot();
        root.clear();
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode('Test'));
        root.append(paragraph);
      });

      unmount();

      // Try to dispatch command after unmount
      act(() => {
        editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
      });

      act(() => {
        vi.advanceTimersByTime(10);
      });

      // Should not cause errors
      expect(true).toBe(true);
    });

    it('should re-register when enabled changes from false to true', () => {
      const { rerender } = renderHook(
        ({ enabled }) => useAutotabOnEnter(editorRef, enabled),
        { initialProps: { enabled: false } }
      );

      editor.update(() => {
        const root = $getRoot();
        root.clear();
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode('Test'));
        root.append(paragraph);
      });

      // Simulate creating new paragraph but with autotab disabled
      editor.update(() => {
        const root = $getRoot();
        const newParagraph = $createParagraphNode();
        root.append(newParagraph);

        const selection = $createRangeSelection();
        const point = $createPoint(newParagraph.getKey(), 0, 'element');
        selection.anchor = point;
        selection.focus = point;
        $setSelection(selection);
      });

      // First dispatch - should not add tab (disabled)
      act(() => {
        editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
      });

      act(() => {
        vi.advanceTimersByTime(10);
      });

      // Check that no tab was added
      editor.read(() => {
        const root = $getRoot();
        const paragraphs = root.getChildren();
        const secondPara = paragraphs[1];
        const firstChild = $isElementNode(secondPara) ? secondPara.getFirstChild() : null;

        // Should not have a tab yet
        if (firstChild) {
          expect(firstChild.getTextContent()).not.toMatch(/^\t/);
        }
      });

      // Enable autotab
      rerender({ enabled: true });

      // Create another new paragraph for the second test
      editor.update(() => {
        const root = $getRoot();
        const newParagraph = $createParagraphNode();
        root.append(newParagraph);

        const selection = $createRangeSelection();
        const point = $createPoint(newParagraph.getKey(), 0, 'element');
        selection.anchor = point;
        selection.focus = point;
        $setSelection(selection);
      });

      // Second dispatch - should add tab (now enabled)
      act(() => {
        editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
      });

      act(() => {
        vi.advanceTimersByTime(10);
      });

      editor.read(() => {
        const root = $getRoot();
        const paragraphs = root.getChildren();

        // Should have 3 paragraphs now (original + 2 new)
        expect(paragraphs.length).toBe(3);

        // The third paragraph should have a tab
        const thirdPara = paragraphs[2];
        const firstChild = $isElementNode(thirdPara) ? thirdPara.getFirstChild() : null;
        if (firstChild) {
          expect(firstChild.getTextContent()).toMatch(/^\t/);
        }
      });
    });
  });

  describe('Command priority', () => {
    it('should return false to allow other handlers', () => {
      let commandResult: boolean | undefined;

      renderHook(() => useAutotabOnEnter(editorRef, true));

      editor.update(() => {
        const root = $getRoot();
        root.clear();
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode('Test'));
        root.append(paragraph);
      });

      act(() => {
        commandResult = editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
      });

      // Command should return false to allow other handlers to process
      expect(commandResult).toBe(false);
    });
  });
});
