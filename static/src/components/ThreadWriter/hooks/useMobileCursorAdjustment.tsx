import {
  $createRangeSelection,
  $getRoot,
  $isElementNode,
  $isTextNode,
  $setSelection,
  LexicalEditor,
  LexicalNode,
} from "lexical";
import { useEffect } from "react";
import { $isAssociationInlineNode } from "../customNodes/AssociationInlineNode";

// all of this messy effect is just to make the cursor move as expected on mobile
export const useMobileCursorAdjustment = (
  editorRef: React.RefObject<LexicalEditor | null>,
) => {
  useEffect(() => {
    if (!editorRef.current) return;

    const handleTouchEnd = (event: TouchEvent) => {
      const editor: LexicalEditor | null = editorRef.current;
      if (!editor) return;

      // Get the tapped position
      const touch = event.changedTouches[0];
      const target = document.elementFromPoint(touch.clientX, touch.clientY);
      if (!target || !editor.getRootElement()?.contains(target)) return;

      editor.update(() => {
        const root = $getRoot();

        let closestTextNode: LexicalNode | null = null;
        let charOffset = 0;

        // Get all text nodes
        const textNodes: LexicalNode[] = [];
        const traverseNodes = (node: LexicalNode) => {
          if ($isTextNode(node) || $isAssociationInlineNode(node)) {
            textNodes.push(node);
          } else if ($isElementNode(node)) {
            node.getChildren().forEach(traverseNodes);
          }
        };
        root.getChildren().forEach(traverseNodes);

        // **Step 1: Use caret position to find exact text offset**
        let range: Range | null = null;
        const doc = document as unknown as {
          caretPositionFromPoint?: (
            x: number,
            y: number,
          ) => { offsetNode: Node; offset: number } | null;
          caretRangeFromPoint?: (x: number, y: number) => Range | null;
        } & Document;

        if (doc.caretPositionFromPoint) {
          const caretPos = doc.caretPositionFromPoint(
            touch.clientX,
            touch.clientY,
          );
          if (caretPos) {
            range = document.createRange();
            range.setStart(caretPos.offsetNode, caretPos.offset);
            range.setEnd(caretPos.offsetNode, caretPos.offset);
            charOffset = caretPos.offset;
          }
        } else if (doc.caretRangeFromPoint) {
          range = doc.caretRangeFromPoint(touch.clientX, touch.clientY);
          if (range) {
            charOffset = range.startOffset;
          }
        }

        // **Step 2: Find the closest text node based on the caret range**
        if (range) {
          for (const node of textNodes) {
            const domNode = editor.getElementByKey(node.getKey());
            if (domNode && domNode.contains(range.startContainer)) {
              closestTextNode = node;
              break;
            }
          }
        }
        // **Step 3: Set cursor exactly where the user tapped**
        if (closestTextNode && $isTextNode(closestTextNode)) {
          const newSelection = $createRangeSelection();
          newSelection.anchor.set(closestTextNode.getKey(), charOffset, "text");
          newSelection.focus.set(closestTextNode.getKey(), charOffset, "text");
          $setSelection(newSelection);
        }
      });
    };

    document.addEventListener("touchend", handleTouchEnd);
    return () => document.removeEventListener("touchend", handleTouchEnd);
  }, [editorRef]);
};
