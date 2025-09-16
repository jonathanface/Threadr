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
} from "lexical";
import { CustomParagraphNode } from "../customNodes/CustomParagraphNode";

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
            const anchorParent = sel.anchor.getNode().getParent();
            if (!(anchorParent instanceof CustomParagraphNode)) return;

            const first = anchorParent.getFirstChild();
            const hasLeadingTab =
              first instanceof TextNode &&
              first.getTextContent().startsWith("\t");
            console.log("has lead", hasLeadingTab);
            if (!hasLeadingTab) {
              const tab = new TextNode("\t");
              if (first) {
                first.insertBefore(tab);
              } else {
                anchorParent.append(tab);
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
  }, [editorRef, enabled]);
};
