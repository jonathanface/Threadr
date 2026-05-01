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
              // If first child is a TextNode, prepend tab to its content
              // This avoids creating separate nodes which causes cursor/backspace issues
              if (first instanceof TextNode) {
                const currentContent = first.getTextContent();
                first.setTextContent("\t" + currentContent);
                // Position cursor after the tab
                if (sel.anchor.offset === 0) {
                  const point = $createPoint(first.getKey(), 1, "text");
                  const range = $createRangeSelection();
                  range.anchor = point;
                  range.focus = point;
                  // Mirror the anchor TextNode's style/format on the selection
                  // so the next typed char compares as "matching" inside
                  // selection.insertText (otherwise Lexical splits and inserts
                  // a fresh unstyled TextNode if selectionchange sync hasn't
                  // run yet).
                  range.style = first.getStyle();
                  range.format = first.getFormat();
                  $setSelection(range);
                }
              } else {
                // No TextNode child, create a new one
                const tab = new TextNode("\t");
                // Inherit text-level style/format buffered on the new
                // paragraph so the carried-over font / size / bold / etc.
                // survive the auto-tab insertion. Without this, the tab
                // TextNode has no style and the user's next typed character
                // appends into it plain.
                const paraTextStyle = targetParagraph.getTextStyle();
                const paraTextFormat = targetParagraph.getTextFormat();
                if (paraTextStyle) {
                  tab.setStyle(paraTextStyle);
                }
                if (paraTextFormat) {
                  tab.setFormat(paraTextFormat);
                }
                if (first) {
                  first.insertBefore(tab);
                } else {
                  targetParagraph.append(tab);
                }
                // Position cursor after the tab
                if (sel.anchor.offset === 0) {
                  const point = $createPoint(tab.getKey(), 1, "text");
                  const range = $createRangeSelection();
                  range.anchor = point;
                  range.focus = point;
                  // Same as above: pre-populate selection.style/format with
                  // the tab's style so a fast keystroke doesn't slip in
                  // between $setSelection and the DOM selectionchange sync.
                  range.style = tab.getStyle();
                  range.format = tab.getFormat();
                  $setSelection(range);
                }
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
