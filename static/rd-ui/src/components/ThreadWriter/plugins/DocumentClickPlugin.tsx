import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getSelection, $isRangeSelection } from 'lexical';
import { useCallback, useEffect } from 'react';

export interface ClickData {
    id?: string;
    text?: string;
    x: number;
    y: number;
}

interface DocumentClickPluginProps {
    onRightClick: (data: ClickData) => void;
    onLeftClick: (data: ClickData) => void;
}

export default function DocumentClickPlugin(props: DocumentClickPluginProps) {
    const [editor] = useLexicalComposerContext();

    const getSelectedText = useCallback(() => {
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
    }, [editor]);

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

        const handleLeftClick = (event: MouseEvent) => {
            event.preventDefault();
            props.onLeftClick({
                x: event.clientX,
                y: event.clientY,
            })
        }

        // Attach the event listener
        rootElement.addEventListener('contextmenu', handleContextMenu);
        rootElement.addEventListener('click', handleLeftClick);

        // Clean up on unmount
        return () => {
            rootElement.removeEventListener('contextmenu', handleContextMenu);
            rootElement.removeEventListener('click', handleLeftClick);
        };
    }, [editor, getSelectedText, props]);


    return null;
}
