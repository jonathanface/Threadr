// hooks/useEditorStateUpdater.ts (Reiterated for clarity)
import { useEffect } from 'react';
import { SerializedEditorState } from 'lexical';
import { LexicalEditor } from 'lexical';

export const useEditorStateUpdater = (
    editorRef: React.RefObject<null | LexicalEditor>,
    storyBlocks: SerializedEditorState | null,
    isProgrammaticChange: React.RefObject<boolean>
) => {
    useEffect(() => {
        if (editorRef.current && storyBlocks) {
            isProgrammaticChange.current = true;
            if (editorRef.current) {
                const editor = editorRef.current;
                editor.update(() => {
                    const newEditorState = editor.parseEditorState(storyBlocks);
                    editor.setEditorState(newEditorState);
                    editorRef.current = editor;
                })
            }
            isProgrammaticChange.current = false;
        }
    }, [storyBlocks, editorRef, isProgrammaticChange]);
};
