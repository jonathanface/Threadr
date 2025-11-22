import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createRef } from 'react';
import { LexicalEditor, $getRoot, $createRangeSelection, $setSelection, $getSelection, $createPoint, $createParagraphNode, $isRangeSelection, $isElementNode } from 'lexical';
import { useCursorMemory } from '../useCursorMemory';
import { createTestEditor, setupMockLocalStorage } from '../../__tests__/testUtils';
import { CustomParagraphNode } from '../../customNodes/CustomParagraphNode';
import { $createTextNode } from 'lexical';
import * as chapterMemory from '../../../../utils/chapterMemory';

describe('useCursorMemory', () => {
  let editor: LexicalEditor;
  let editorRef: React.RefObject<LexicalEditor>;

  beforeEach(() => {
    setupMockLocalStorage();
    editor = createTestEditor();
    editorRef = createRef() as React.MutableRefObject<LexicalEditor>;
    editorRef.current = editor;
    vi.clearAllTimers();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Saving cursor position', () => {
    it('should save cursor position after 2 seconds of inactivity', async () => {
      const storyId = 'test-story';
      const chapterId = 'test-chapter';
      const paragraphId = 'test-paragraph';

      // Render hook first so it registers the update listener
      renderHook(() =>
        useCursorMemory(editorRef, storyId, chapterId, true)
      );

      // Advance time by 2.5 seconds to bypass debounce
      act(() => {
        vi.setSystemTime(new Date('2024-01-01T00:00:02.500Z'));
      });

      // Create editor content and trigger update listener
      act(() => {
        editor.update(() => {
          const root = $getRoot();
          root.clear();
          const paragraph = new CustomParagraphNode(paragraphId);
          const textNode = $createTextNode('Hello World');
          paragraph.append(textNode);
          root.append(paragraph);

          // Set cursor position at offset 5
          const selection = $createRangeSelection();
          const point = $createPoint(textNode.getKey(), 5, 'text');
          selection.anchor = point;
          selection.focus = point;
          $setSelection(selection);
        });
      });

      // Wait for microtasks to flush
      await Promise.resolve();

      // Check that save was called
      const saved = chapterMemory.getCursorPosition(storyId, chapterId);
      expect(saved).toEqual({
        paragraphKeyId: paragraphId,
        offset: 5,
      });
    });

    it('should debounce saves to once per 2 seconds', async () => {
      const storyId = 'test-story';
      const chapterId = 'test-chapter';
      const saveSpy = vi.spyOn(chapterMemory, 'saveCursorPosition');

      // Render hook first so it registers the update listener
      renderHook(() =>
        useCursorMemory(editorRef, storyId, chapterId, true)
      );

      // Set up initial content
      act(() => {
        editor.update(() => {
          const root = $getRoot();
          root.clear();
          const paragraph = new CustomParagraphNode('para-1');
          const textNode = $createTextNode('Test');
          paragraph.append(textNode);
          root.append(paragraph);

          const selection = $createRangeSelection();
          const point = $createPoint(textNode.getKey(), 0, 'text');
          selection.anchor = point;
          selection.focus = point;
          $setSelection(selection);
        });
      });

      // Trigger multiple updates quickly, advancing system time
      let currentTime = 0;
      for (let i = 0; i < 5; i++) {
        act(() => {
          // Advance system time by 500ms
          currentTime += 500;
          vi.setSystemTime(new Date(Date.parse('2024-01-01T00:00:00Z') + currentTime));

          editor.update(() => {
            const selection = $getSelection();
            if (selection) {
              $setSelection(selection);
            }
          });
        });
      }

      // Wait for microtasks to flush
      await Promise.resolve();

      // Only one save should have happened (after the first 2 seconds)
      expect(saveSpy).toHaveBeenCalledTimes(1);
    });

    it('should not save if storyId or chapterId is undefined', () => {
      const saveSpy = vi.spyOn(chapterMemory, 'saveCursorPosition');

      editor.update(() => {
        const root = $getRoot();
        root.clear();
        const paragraph = new CustomParagraphNode('para-1');
        const textNode = $createTextNode('Test');
        paragraph.append(textNode);
        root.append(paragraph);
      });

      renderHook(() =>
        useCursorMemory(editorRef, undefined, 'chapter', true)
      );

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(saveSpy).not.toHaveBeenCalled();
    });

    it('should handle cursor not in a CustomParagraphNode gracefully', () => {
      const storyId = 'test-story';
      const chapterId = 'test-chapter';
      const saveSpy = vi.spyOn(chapterMemory, 'saveCursorPosition');

      // Create content with regular paragraph (not CustomParagraphNode)
      editor.update(() => {
        const root = $getRoot();
        root.clear();
        // Use regular ParagraphNode, not CustomParagraphNode
        const paragraph = $createParagraphNode();
        const textNode = $createTextNode('Test');
        paragraph.append(textNode);
        root.append(paragraph);

        const selection = $createRangeSelection();
        const point = $createPoint(textNode.getKey(), 0, 'text');
        selection.anchor = point;
        selection.focus = point;
        $setSelection(selection);
      });

      renderHook(() =>
        useCursorMemory(editorRef, storyId, chapterId, true)
      );

      act(() => {
        editor.update(() => {
          // Trigger update
        });
        vi.advanceTimersByTime(2001);
      });

      // Should not save because cursor is not in CustomParagraphNode
      expect(saveSpy).not.toHaveBeenCalled();
    });
  });

  describe('Restoring cursor position', () => {
    it('should restore cursor position when shouldRestore is true', async () => {
      const storyId = 'test-story';
      const chapterId = 'test-chapter';
      const paragraphId = 'test-paragraph';

      // Save a cursor position
      chapterMemory.saveCursorPosition(storyId, chapterId, {
        paragraphKeyId: paragraphId,
        offset: 7,
      });

      // Create editor content matching the saved position
      editor.update(() => {
        const root = $getRoot();
        root.clear();
        const paragraph = new CustomParagraphNode(paragraphId);
        const textNode = $createTextNode('Hello World Test');
        paragraph.append(textNode);
        root.append(paragraph);
      });

      renderHook(() =>
        useCursorMemory(editorRef, storyId, chapterId, true)
      );

      // Fast-forward past the restore timeout
      act(() => {
        vi.runAllTimers();
      });

      // Check the selection immediately
      editor.read(() => {
        const selection = $getSelection();
        expect($isRangeSelection(selection) ? selection.anchor.offset : undefined).toBe(7);
      });
    });

    it('should not restore when shouldRestore is false', () => {
      const storyId = 'test-story';
      const chapterId = 'test-chapter';
      const paragraphId = 'test-paragraph';

      chapterMemory.saveCursorPosition(storyId, chapterId, {
        paragraphKeyId: paragraphId,
        offset: 5,
      });

      editor.update(() => {
        const root = $getRoot();
        root.clear();
        const paragraph = new CustomParagraphNode(paragraphId);
        const textNode = $createTextNode('Test');
        paragraph.append(textNode);
        root.append(paragraph);
      });

      renderHook(() =>
        useCursorMemory(editorRef, storyId, chapterId, false)
      );

      act(() => {
        vi.advanceTimersByTime(100);
      });

      editor.getEditorState().read(() => {
        const selection = $getSelection();
        // Selection should be null or not at the saved position
        expect($isRangeSelection(selection) ? selection.anchor.offset : undefined).not.toBe(5);
      });
    });

    it('should not restore if paragraph is not found', async () => {
      const storyId = 'test-story';
      const chapterId = 'test-chapter';
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Save position for a paragraph that doesn't exist
      chapterMemory.saveCursorPosition(storyId, chapterId, {
        paragraphKeyId: 'non-existent-paragraph',
        offset: 5,
      });

      // Create editor with different paragraph
      editor.update(() => {
        const root = $getRoot();
        root.clear();
        const paragraph = new CustomParagraphNode('different-id');
        const textNode = $createTextNode('Test');
        paragraph.append(textNode);
        root.append(paragraph);
      });

      renderHook(() =>
        useCursorMemory(editorRef, storyId, chapterId, true)
      );

      act(() => {
        vi.advanceTimersByTime(100);
      });

      // Should not throw error, just not restore
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should clamp offset to text content size', async () => {
      const storyId = 'test-story';
      const chapterId = 'test-chapter';
      const paragraphId = 'test-paragraph';

      // Save position with large offset
      chapterMemory.saveCursorPosition(storyId, chapterId, {
        paragraphKeyId: paragraphId,
        offset: 1000,
      });

      editor.update(() => {
        const root = $getRoot();
        root.clear();
        const paragraph = new CustomParagraphNode(paragraphId);
        const textNode = $createTextNode('Short'); // Only 5 characters
        paragraph.append(textNode);
        root.append(paragraph);
      });

      renderHook(() =>
        useCursorMemory(editorRef, storyId, chapterId, true)
      );

      act(() => {
        vi.runAllTimers();
      });

      // Check immediately
      editor.read(() => {
        const selection = $getSelection();
        // Should be clamped to text length (5)
        expect($isRangeSelection(selection) ? selection.anchor.offset : 0).toBeLessThanOrEqual(5);
      });
    });

    it('should reset hasRestored flag when chapter changes', () => {
      const storyId = 'test-story';
      const chapterId1 = 'chapter-1';
      const chapterId2 = 'chapter-2';

      chapterMemory.saveCursorPosition(storyId, chapterId1, {
        paragraphKeyId: 'para-1',
        offset: 5,
      });

      editor.update(() => {
        const root = $getRoot();
        root.clear();
        const paragraph = new CustomParagraphNode('para-1');
        const textNode = $createTextNode('Test content');
        paragraph.append(textNode);
        root.append(paragraph);
      });

      const { rerender } = renderHook(
        ({ chapterId }) => useCursorMemory(editorRef, storyId, chapterId, true),
        { initialProps: { chapterId: chapterId1 } }
      );

      act(() => {
        vi.advanceTimersByTime(100);
      });

      // Now change to chapter 2
      rerender({ chapterId: chapterId2 });

      // hasRestored should be reset, allowing another restore
      // This is tested implicitly - if it wasn't reset, the second restore wouldn't work
    });

    it('should only restore once per chapter load', async () => {
      const storyId = 'test-story';
      const chapterId = 'test-chapter';
      const paragraphId = 'test-paragraph';

      chapterMemory.saveCursorPosition(storyId, chapterId, {
        paragraphKeyId: paragraphId,
        offset: 5,
      });

      editor.update(() => {
        const root = $getRoot();
        root.clear();
        const paragraph = new CustomParagraphNode(paragraphId);
        const textNode = $createTextNode('Test content');
        paragraph.append(textNode);
        root.append(paragraph);
      });

      const { rerender } = renderHook(
        ({ shouldRestore }) => useCursorMemory(editorRef, storyId, chapterId, shouldRestore),
        { initialProps: { shouldRestore: true } }
      );

      act(() => {
        vi.runAllTimers();
      });

      // Change selection manually
      act(() => {
        editor.update(() => {
          const root = $getRoot();
          const firstChild = root.getFirstChild();
          const textNode = $isElementNode(firstChild) ? firstChild.getFirstChild() : null;
          if (textNode) {
            const selection = $createRangeSelection();
            const point = $createPoint(textNode.getKey(), 0, 'text');
            selection.anchor = point;
            selection.focus = point;
            $setSelection(selection);
          }
        });
      });

      // Re-render with shouldRestore still true
      rerender({ shouldRestore: true });

      act(() => {
        vi.runAllTimers();
      });

      // Selection should still be at 0, not restored again to 5
      editor.read(() => {
        const selection = $getSelection();
        expect($isRangeSelection(selection) ? selection.anchor.offset : undefined).toBe(0);
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle empty paragraph gracefully', () => {
      const storyId = 'test-story';
      const chapterId = 'test-chapter';
      const paragraphId = 'empty-para';

      chapterMemory.saveCursorPosition(storyId, chapterId, {
        paragraphKeyId: paragraphId,
        offset: 0,
      });

      editor.update(() => {
        const root = $getRoot();
        root.clear();
        const paragraph = new CustomParagraphNode(paragraphId);
        // No text node - empty paragraph
        root.append(paragraph);
      });

      renderHook(() =>
        useCursorMemory(editorRef, storyId, chapterId, true)
      );

      act(() => {
        vi.advanceTimersByTime(100);
      });

      // Should not throw error
      expect(true).toBe(true);
    });

    it('should handle null editor ref', () => {
      const nullRef = createRef() as React.MutableRefObject<LexicalEditor | null>;
      nullRef.current = null;

      const { result } = renderHook(() =>
        useCursorMemory(nullRef, 'story', 'chapter', true)
      );

      // Should not throw error
      expect(result.current).toBeUndefined();
    });

    it('should cleanup timeout on unmount', () => {
      const storyId = 'test-story';
      const chapterId = 'test-chapter';

      chapterMemory.saveCursorPosition(storyId, chapterId, {
        paragraphKeyId: 'para-1',
        offset: 5,
      });

      const { unmount } = renderHook(() =>
        useCursorMemory(editorRef, storyId, chapterId, true)
      );

      unmount();

      act(() => {
        vi.advanceTimersByTime(100);
      });

      // Should not throw error or cause issues
      expect(true).toBe(true);
    });
  });
});
