import { useEffect, useRef } from "react";
import {
  LexicalEditor,
  $getSelection,
  $isRangeSelection,
  $getRoot,
  $createRangeSelection,
  $setSelection,
  $createPoint,
} from "lexical";
import {
  saveCursorPosition,
  getCursorPosition,
} from "../../../utils/chapterMemory";
import { CustomParagraphNode } from "../customNodes/CustomParagraphNode";

/**
 * Hook to save and restore cursor position for a chapter
 * Saves when selection changes (debounced)
 * Restores when chapter content loads
 */
export const useCursorMemory = (
  editorRef: React.RefObject<LexicalEditor | null>,
  storyId: string | undefined,
  chapterId: string | undefined,
  shouldRestore: boolean, // Set to true when content has loaded
) => {
  const lastSaveTimeRef = useRef<number>(0);
  const hasRestoredRef = useRef<boolean>(false);

  // Save cursor position (debounced to every 2 seconds)
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !storyId || !chapterId) return;

    const unregister = editor.registerUpdateListener(() => {
      const now = Date.now();
      // Debounce: only save every 2 seconds
      if (now - lastSaveTimeRef.current < 2000) return;

      editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;

        const anchorNode = selection.anchor.getNode();
        let paragraph: CustomParagraphNode | null = null;

        // Find the paragraph containing the cursor
        if (anchorNode instanceof CustomParagraphNode) {
          paragraph = anchorNode;
        } else {
          const parent = anchorNode.getParent();
          if (parent instanceof CustomParagraphNode) {
            paragraph = parent;
          }
        }

        if (!paragraph) return;

        const keyId = paragraph.getKeyId();
        if (!keyId) return;

        // Save the paragraph key and offset within the paragraph
        const position = {
          paragraphKeyId: keyId,
          offset: selection.anchor.offset,
        };
        saveCursorPosition(storyId, chapterId, position);

        lastSaveTimeRef.current = now;
      });
    });

    return () => unregister();
  }, [editorRef, storyId, chapterId]);

  // Restore cursor position when content loads
  useEffect(() => {
    const editor = editorRef.current;

    if (!editor || !storyId || !chapterId || !shouldRestore) return;
    if (hasRestoredRef.current) return; // Only restore once

    const savedPosition = getCursorPosition(storyId, chapterId);

    if (!savedPosition) return;

    // Use a timeout to ensure content has rendered
    const timeout = setTimeout(() => {
      editor.update(() => {
        const root = $getRoot();
        const allParagraphs = root.getAllTextNodes();

        // Find the paragraph with the saved key_id
        let targetParagraph: CustomParagraphNode | null = null;
        for (const node of allParagraphs) {
          const parent = node.getParent();
          if (
            parent instanceof CustomParagraphNode &&
            parent.getKeyId() === savedPosition.paragraphKeyId
          ) {
            targetParagraph = parent;
            break;
          }
        }

        if (!targetParagraph) {
          // Paragraph not found (might have been deleted), just return
          return;
        }

        // Find a text node within the paragraph to place the cursor
        const firstChild = targetParagraph.getFirstChild();
        if (!firstChild) {
          return;
        }

        try {
          // Create selection at the saved offset
          const point = $createPoint(
            firstChild.getKey(),
            Math.min(savedPosition.offset, firstChild.getTextContentSize()),
            "text",
          );
          const selection = $createRangeSelection();
          selection.anchor = point;
          selection.focus = point;
          $setSelection(selection);

          hasRestoredRef.current = true;
        } catch (error) {
          console.warn("[CURSOR MEMORY] Failed to restore cursor position:", error);
        }
      });
    }, 100); // Small delay to ensure content is rendered

    return () => clearTimeout(timeout);
  }, [editorRef, storyId, chapterId, shouldRestore]);

  // Reset restoration flag when chapter changes
  useEffect(() => {
    hasRestoredRef.current = false;
  }, [chapterId]);
};
