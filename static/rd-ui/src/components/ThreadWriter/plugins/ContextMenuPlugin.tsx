import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getSelection, $isRangeSelection } from 'lexical';
import { useEffect } from 'react';

export interface RightClickData {
    text: string;
    x: number;
    y: number;
}

interface LexicalRightClickPluginProps {
    onRightClick: (data: RightClickData) => void;
}

export default function LexicalRightClickPlugin(props: LexicalRightClickPluginProps) {
    const [editor] = useLexicalComposerContext();

    const getSelectedText = () => {
        let selectedText = '';
        // Update the editor state to read the current selection.
        editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
                // getTextContent() returns the selected text.
                selectedText = selection.getTextContent();
            }
        });
        return selectedText;
    };

    useEffect(() => {
        // Get the editor's root DOM element
        const rootElement = editor.getRootElement();
        if (!rootElement) return; // Ensure it's mounted

        const handleContextMenu = (event: MouseEvent) => {
            // Prevent the default browser context menu (optional)
            event.preventDefault();
            const selectedText = getSelectedText();
            if (!selectedText.length) return;
            props.onRightClick({
                x: event.clientX,
                y: event.clientY,
                text: selectedText
            })
        };

        // Attach the event listener
        rootElement.addEventListener('contextmenu', handleContextMenu);

        // Clean up on unmount
        return () => {
            rootElement.removeEventListener('contextmenu', handleContextMenu);
        };
    }, [editor]);


    return null;
}
