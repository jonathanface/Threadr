import { useCallback } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getRoot } from "lexical";
import { CustomParagraphNode } from "../../../customNodes/CustomParagraphNode";
import { Comment } from "../../../../../types/Sharing";

export const useScrollToComment = () => {
  const [editor] = useLexicalComposerContext();

  const scrollToComment = useCallback((comment: Comment) => {
    if (!comment.anchor_text_snapshot) return;

    editor.getEditorState().read(() => {
      const root = $getRoot();
      const children = root.getChildren();

      const keyIdToIndex = new Map<string, number>();
      children.forEach((node, index) => {
        if (node instanceof CustomParagraphNode) {
          keyIdToIndex.set(node.getKeyId(), index);
        }
      });

      const editorEl = document.querySelector("[data-lexical-editor]");
      if (!editorEl) return;
      const paragraphs = editorEl.querySelectorAll("p");

      const pIndex = keyIdToIndex.get(comment.block_key_id);
      if (pIndex === undefined || pIndex >= paragraphs.length) return;

      const p = paragraphs[pIndex];
      const textContent = p.textContent || "";

      let snippetStart = comment.anchor_offset;
      const snippetLen = comment.anchor_text_snapshot.length;

      if (
        snippetStart < 0 ||
        snippetStart + snippetLen > textContent.length ||
        textContent.substring(snippetStart, snippetStart + snippetLen) !== comment.anchor_text_snapshot
      ) {
        snippetStart = textContent.indexOf(comment.anchor_text_snapshot);
        if (snippetStart === -1) {
          // Can't find text, just scroll to the paragraph
          p.scrollIntoView({ behavior: "smooth", block: "center" });
          return;
        }
      }
      const snippetEnd = snippetStart + snippetLen;

      // Find the text nodes for the range
      const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      let charCount = 0;
      let startNode: Text | null = null;
      let startOffset = 0;
      let endNode: Text | null = null;
      let endOffset = 0;

      while (walker.nextNode()) {
        const textNode = walker.currentNode as Text;
        const nodeLen = textNode.length;
        if (!startNode && charCount + nodeLen > snippetStart) {
          startNode = textNode;
          startOffset = snippetStart - charCount;
        }
        if (charCount + nodeLen >= snippetEnd) {
          endNode = textNode;
          endOffset = snippetEnd - charCount;
          break;
        }
        charCount += nodeLen;
      }

      if (!startNode || !endNode) {
        p.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }

      try {
        const range = document.createRange();
        range.setStart(startNode, startOffset);
        range.setEnd(endNode, endOffset);

        // Scroll the paragraph into view, then highlight after scroll settles
        p.scrollIntoView({ behavior: "smooth", block: "center" });

        setTimeout(() => {
          const sel = window.getSelection();
          if (sel) {
            sel.removeAllRanges();
            sel.addRange(range);
          }
        }, 600);
      } catch {
        p.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }, [editor]);

  return scrollToComment;
};
