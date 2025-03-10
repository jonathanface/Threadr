import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getSelection, $isRangeSelection, $createRangeSelection, $setSelection, $isTextNode, TextNode, LexicalNode, $isElementNode, $getRoot } from 'lexical';
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
    const lastTapTime = useRef<number>(0);

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

    const traverseNodes = useCallback((node: LexicalNode, textNodes: TextNode[]) => {
        if ($isTextNode(node)) {
            textNodes.push(node);
        } else if ($isElementNode(node)) {
            node.getChildren().forEach((child) => traverseNodes(child, textNodes));
        }
    }, []);

    const selectWordAt = useCallback((x: number, y: number) => {
        editor.update(() => {
            const doc = document as unknown as {
                caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
                caretRangeFromPoint?: (x: number, y: number) => Range | null;
            } & Document;

            let range: Range | null = null;

            if (doc.caretPositionFromPoint) {
                const caretPos = doc.caretPositionFromPoint(x, y);
                if (caretPos) {
                    range = document.createRange();
                    range.setStart(caretPos.offsetNode, caretPos.offset);
                    range.setEnd(caretPos.offsetNode, caretPos.offset);
                }
            } else if (doc.caretRangeFromPoint) {
                range = doc.caretRangeFromPoint(x, y);
            }
            if (!range) return;

            const root = editor.getRootElement();
            if (!root) return;

            const wordRegex = /\b\w+\b/g;
            const text = range.startContainer.textContent || "";
            let startOffset = range.startOffset;
            let endOffset = range.startOffset;

            let match;
            while ((match = wordRegex.exec(text)) !== null) {
                if (match.index <= startOffset && match.index + match[0].length >= startOffset) {
                    startOffset = match.index;
                    endOffset = match.index + match[0].length;
                    break;
                }
            }

            let closestNode: TextNode | null = null;;
            let closestKey: string | null = null;

            editor.update(() => {
                const selection = $getSelection();
                if (!selection) return;

                editor.getEditorState().read(() => {
                    const textNodes: TextNode[] = [];
                    const root = $getRoot();
                    if (!root) return;
                    root.getChildren().forEach((child) => traverseNodes(child, textNodes));
                    for (const node of textNodes) {
                        const domNode = editor.getElementByKey(node.getKey());
                        if (domNode && domNode.contains(range.startContainer)) {
                            closestNode = node;
                            closestKey = node.getKey();
                            break;
                        }
                    }
                });

                if (closestNode && closestKey) {
                    const newSelection = $createRangeSelection();
                    newSelection.anchor.set(closestKey, startOffset, "text");
                    newSelection.focus.set(closestKey, endOffset, "text");
                    $setSelection(newSelection);
                }
            });
        });
    }, [editor, traverseNodes]);

    useEffect(() => {
        const rootElement = editor.getRootElement();
        if (!rootElement) return;

        const handleContextMenu = (event: MouseEvent) => {
            const rootElement = editor.getRootElement();
            if (!rootElement) return;

            if (rootElement.contains(event.target as Node)) {
                event.preventDefault();
                event.stopPropagation();

                const selectedText = getSelectedText();
                if (!selectedText.length) return;

                const containerRect = rootElement.parentElement?.parentElement?.parentElement?.parentElement?.parentElement?.getBoundingClientRect();
                console.log("container", containerRect)
                const xInContainer = containerRect ? event.clientX - containerRect.left : event.clientX;
                const yInContainer = containerRect ? event.clientY - containerRect.top : event.clientY;
                console.log("adj", xInContainer, yInContainer);

                props.onRightClick({
                    x: xInContainer,
                    y: yInContainer,
                    text: selectedText
                });
            }
        };


        const handleLeftClick = (event: MouseEvent) => {
            event.preventDefault();
            props.onLeftClick(event);
        };

        const handleDoubleClick = (event: MouseEvent) => {
            event.preventDefault();
            event.stopPropagation(); // Prevents interfering events
            setTimeout(() => {
                selectWordAt(event.clientX, event.clientY);
            }, 50); // Delay ensures selection isn't overridden by other event handlers
        };


        const handleTouchStart = (event: TouchEvent) => {
            const touch = event.touches[0];
            touchStartX.current = touch.clientX;
            touchStartY.current = touch.clientY;

            const now = Date.now();
            if (now - lastTapTime.current < 300) {
                event.preventDefault();
                selectWordAt(touch.clientX, touch.clientY);
                lastTapTime.current = 0;
                return;
            }
            lastTapTime.current = now;

            longPressTimer.current = setTimeout(() => {
                const selectedText = getSelectedText();
                if (!selectedText.length) return;
                event.preventDefault();
                props.onRightClick({
                    x: touch.clientX,
                    y: touch.clientY,
                    text: selectedText
                });

                longPressTimer.current = null;
            }, 500);
        };

        const handleTouchEnd = () => {
            if (longPressTimer.current) {
                clearTimeout(longPressTimer.current);
                longPressTimer.current = null;
                props.onLeftClick(new MouseEvent("click"));
            }
        };

        document.addEventListener('contextmenu', handleContextMenu, { passive: false });
        rootElement.addEventListener('contextmenu', handleContextMenu);
        rootElement.addEventListener('click', handleLeftClick);
        rootElement.addEventListener('dblclick', handleDoubleClick);
        rootElement.addEventListener('touchstart', handleTouchStart);
        rootElement.addEventListener('touchend', handleTouchEnd);
        rootElement.addEventListener('touchcancel', handleTouchEnd);

        return () => {
            document.removeEventListener('contextmenu', handleContextMenu);
            rootElement.removeEventListener('contextmenu', handleContextMenu);
            rootElement.removeEventListener('click', handleLeftClick);
            rootElement.removeEventListener('dblclick', handleDoubleClick);
            rootElement.removeEventListener('touchstart', handleTouchStart);
            rootElement.removeEventListener('touchend', handleTouchEnd);
            rootElement.removeEventListener('touchcancel', handleTouchEnd);
        };
    }, [editor, getSelectedText, selectWordAt, props]);

    return null;
}
