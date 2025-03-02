import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getSelection, $isRangeSelection } from 'lexical';
import { useCallback, useEffect, useRef } from 'react';

export interface ClickData {
    id?: string;
    text?: string;
    x: number;
    y: number;
}

interface DocumentClickPluginProps {
    onRightClick: (data: ClickData) => void;
    onLeftClick: (event: MouseEvent | TouchEvent) => void;
}

export default function DocumentClickPlugin(props: DocumentClickPluginProps) {
    const [editor] = useLexicalComposerContext();
    const longPressTimer = useRef<NodeJS.Timeout | null>(null);
    const touchStartX = useRef<number>(0);
    const touchStartY = useRef<number>(0);

    const getSelectedText = useCallback(() => {
        let selectedText = '';
        editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
                selectedText = selection.getTextContent();
            }
        });
        return selectedText;
    }, [editor]);

    useEffect(() => {
        const rootElement = editor.getRootElement();
        if (!rootElement) return;

        const handleContextMenu = (event: MouseEvent) => {
            event.preventDefault();
            const selectedText = getSelectedText();
            if (!selectedText.length) return;
            props.onRightClick({
                x: event.clientX,
                y: event.clientY,
                text: selectedText
            });
        };

        const handleLeftClick = (event: MouseEvent) => {
            event.preventDefault();
            props.onLeftClick(event);
        };

        const handleTouchStart = (event: TouchEvent) => {
            const touch = event.touches[0];
            touchStartX.current = touch.clientX;
            touchStartY.current = touch.clientY;
            props.onLeftClick(event);

            longPressTimer.current = setTimeout(() => {
                const selectedText = getSelectedText();
                if (!selectedText.length) return;
                props.onRightClick({
                    x: touch.clientX,
                    y: touch.clientY,
                    text: selectedText
                });
            }, 500); // Long press duration (500ms)
        };

        const handleTouchEnd = () => {
            if (longPressTimer.current) {
                clearTimeout(longPressTimer.current);
            }
        };

        const handleTouchCancel = () => {
            if (longPressTimer.current) {
                clearTimeout(longPressTimer.current);
            }
        };

        rootElement.addEventListener('contextmenu', handleContextMenu);
        rootElement.addEventListener('click', handleLeftClick);
        rootElement.addEventListener('touchstart', handleTouchStart);
        rootElement.addEventListener('touchend', handleTouchEnd);
        rootElement.addEventListener('touchcancel', handleTouchCancel);

        return () => {
            rootElement.removeEventListener('contextmenu', handleContextMenu);
            rootElement.removeEventListener('click', handleLeftClick);
            rootElement.removeEventListener('touchstart', handleTouchStart);
            rootElement.removeEventListener('touchend', handleTouchEnd);
            rootElement.removeEventListener('touchcancel', handleTouchCancel);
        };
    }, [editor, getSelectedText, props]);

    return null;
}
