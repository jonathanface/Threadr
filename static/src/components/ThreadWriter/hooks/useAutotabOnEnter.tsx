import { useEffect } from "react";
import {
  INSERT_PARAGRAPH_COMMAND,
  COMMAND_PRIORITY_LOW,
  LexicalEditor,
  $getSelection,
  $isRangeSelection,
  TextNode,
  $createPoint,
  $createRangeSelection,
  $setSelection,
  ParagraphNode,
} from "lexical";

export const useAutotabOnEnter = (
  editorRef: React.RefObject<LexicalEditor | null>,
  enabled: boolean,
) => {
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !enabled) return;

    return editor.registerCommand(
      INSERT_PARAGRAPH_COMMAND,
      () => {
        setTimeout(() => {
          editor.update(() => {
            if (!enabled) return;

            const sel = $getSelection();
            if (!$isRangeSelection(sel)) return;

            // anchor sits in the newly created paragraph after Enter
            // It might be the paragraph itself (if empty) or a node inside it
            const anchorNode = sel.anchor.getNode();

            let targetParagraph: ParagraphNode | null = null;
            if (anchorNode instanceof ParagraphNode) {
              targetParagraph = anchorNode;
            } else {
              const anchorParent = anchorNode.getParent();
              if (anchorParent instanceof ParagraphNode) {
                targetParagraph = anchorParent;
              }
            }

            if (!targetParagraph) return;

            const first = targetParagraph.getFirstChild();
            const hasLeadingTab =
              first instanceof TextNode &&
              first.getTextContent().startsWith("\t");

            if (!hasLeadingTab) {
              const tab = new TextNode("\t");
              if (first) {
                first.insertBefore(tab);
              } else {
                targetParagraph.append(tab);
              }

              // if caret is at paragraph start, put it just after the tab
              if (sel.anchor.offset === 0) {
                const point = $createPoint(tab.getKey(), 1, "text");
                const range = $createRangeSelection();
                range.anchor = point;
                range.focus = point;
                $setSelection(range);
              }
            }
          });
        }, 0);
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorRef.current, enabled]);
};
