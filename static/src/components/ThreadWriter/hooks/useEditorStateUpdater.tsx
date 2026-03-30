import { useEffect } from "react";
import { SerializedEditorState } from "lexical";
import { LexicalEditor } from "lexical";

export const useEditorStateUpdater = (
  editorRef: React.RefObject<null | LexicalEditor>,
  storyBlocks: SerializedEditorState | null,
  isProgrammaticChangeRef: React.RefObject<boolean>,
) => {
  useEffect(() => {
    if (editorRef.current && storyBlocks) {
      isProgrammaticChangeRef.current = true;
      const editor = editorRef.current;
      editor.update(() => {
        const newEditorState = editor.parseEditorState(storyBlocks);
        editor.setEditorState(newEditorState);
        editorRef.current = editor;
      });
      isProgrammaticChangeRef.current = false;
    }
  }, [storyBlocks, editorRef, isProgrammaticChangeRef]);
};
