import { $createRangeSelection, $createTextNode, $getRoot, $getSelection, $isElementNode, $isRangeSelection, $isTextNode, $setSelection, COMMAND_PRIORITY_CRITICAL, ElementNode, KEY_BACKSPACE_COMMAND, KEY_ENTER_COMMAND, KEY_TAB_COMMAND, LexicalEditor, LexicalNode, ParagraphNode, PASTE_COMMAND } from "lexical";
import { ClickableDecoratorNode } from "../components/ThreadWriter/customNodes/ClickableDecoratorNode";
import { useCallback, useEffect } from "react";
import { CustomParagraphNode } from "../components/ThreadWriter/customNodes/CustomParagraphNode";
import { useDocumentSettings } from "./useDocumentSettings";
import { v4 as uuidv4 } from 'uuid';
import { AlertToastType } from "../types/AlertToasts";
import { useToaster } from "./useToaster";

function getChildAndOffsetRange(
    paragraph: ElementNode,
    absoluteOffset: number
): { child: LexicalNode | null; childStart: number; childEnd: number; relativeOffset: number } {
    let currentOffset = 0;
    const children = paragraph.getChildren();
    for (const child of children) {
        // If the child is a decorator, treat its atomic length as 1,
        // but its visible length will be determined later.
        const atomicLength = child instanceof ClickableDecoratorNode ? 1 : child.getTextContent().length;
        const childStart = currentOffset;
        const childEnd = currentOffset + atomicLength;
        if (absoluteOffset >= childStart && absoluteOffset < childEnd) {
            return { child, childStart, childEnd, relativeOffset: absoluteOffset - childStart };
        }
        currentOffset += atomicLength;
    }
    return { child: null, childStart: currentOffset, childEnd: currentOffset, relativeOffset: 0 };
}


export const useEditorCommands = (editorRef: React.RefObject<LexicalEditor | null>, pastedParagraphKeys: React.RefObject<Set<string>>) => {

    const { documentSettings } = useDocumentSettings();
    const { setAlertState } = useToaster();

    const handleEnterPress = useCallback(() => {
        editorRef.current?.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
                // Get the top-level element (paragraph) that contains the current selection.
                const currentParagraph = selection.anchor.getNode().getTopLevelElementOrThrow();

                // Create a new CustomParagraphNode.
                const newParagraph = new CustomParagraphNode(uuidv4());
                // Insert the new paragraph immediately after the current paragraph.
                currentParagraph.insertAfter(newParagraph);
                let textNode = $createTextNode("");
                if (documentSettings?.autotab) {
                    // Create a text node that starts with a tab.
                    textNode = $createTextNode("\t");
                }
                newParagraph.append(textNode);
                // Set the selection to the new paragraph's text node after the tab.
                const newSelection = $createRangeSelection();
                newSelection.anchor.set(textNode.getKey(), 1, "text");
                newSelection.focus.set(textNode.getKey(), 1, "text");
                $setSelection(newSelection);
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [documentSettings?.autotab, editorRef.current]);

    const handleTabPress = useCallback(() => {
        if (editorRef.current) {
            editorRef.current.focus();
            editorRef.current.update(() => {
                const selection = $getSelection();
                if ($isRangeSelection(selection)) {
                    const selectedNode = selection.anchor.getNode();
                    const parentNode = selectedNode.getParent();
                    if (parentNode instanceof CustomParagraphNode) {
                        const anchorOffset = selection.anchor.offset; // Get the cursor offset
                        const anchorNode = selection.anchor.getNode();
                        if ($isTextNode(anchorNode)) {
                            // Case: Cursor is inside a TextNode
                            const currentText = anchorNode.getTextContent();
                            const beforeText = currentText.slice(0, anchorOffset); // Text before the cursor
                            const afterText = currentText.slice(anchorOffset); // Text after the cursor

                            // Update the existing TextNode
                            const writableNode = anchorNode.getWritable();
                            writableNode.setTextContent(beforeText + "\t" + afterText);

                            // Update the selection to be at the end of the tab
                            selection.anchor.set(writableNode.getKey(), anchorOffset + 1, "text");
                            selection.focus.set(writableNode.getKey(), anchorOffset + 1, "text");
                        } else {
                            const currentIndent = parentNode.getIndent() || 0;
                            parentNode.setIndent(currentIndent + 1);
                        }
                    } else if (!$isTextNode(selectedNode) && $isElementNode(parentNode)) {
                        // Handling blank line or root-level selection
                        const newTextNode = $createTextNode("\t");
                        selectedNode.append(newTextNode);
                        const selection = $getSelection();
                        if ($isRangeSelection(selection)) {
                            selection.anchor.set(newTextNode.getKey(), 1, "text");
                            selection.focus.set(newTextNode.getKey(), 1, "text");
                        }
                    } else if (!$isTextNode(selectedNode) && !$isElementNode(parentNode)) {
                        const root = $getRoot();
                        const newParagraph = new CustomParagraphNode(uuidv4());
                        const newTextNode = $createTextNode("\t");
                        newParagraph.append(newTextNode);
                        root.append(newParagraph);
                        selection.anchor.set(newTextNode.getKey(), 1, "text");
                        selection.focus.set(newTextNode.getKey(), 1, "text");
                    } else if ($isTextNode(selectedNode)) {
                        const currentText = selectedNode.getTextContent();
                        selectedNode.setTextContent(currentText + "\t");
                    } else {
                        // Handle unexpected cases
                        console.warn("Unhandled case for Tab key press");
                    }
                }
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editorRef.current]);

    useEffect(() => {
        if (editorRef.current) {
            const unregister = editorRef.current.registerCommand(
                KEY_BACKSPACE_COMMAND,
                (event: KeyboardEvent) => {
                    const selection = $getSelection();
                    if (!$isRangeSelection(selection)) return false;

                    // Log current selection info
                    const originalNode = selection.anchor.getNode();
                    //console.log("Original selection node key:", originalNode.getKey(), originalNode.getType(), "offset:", selection.anchor.offset);

                    // If the selection is in a plain text node at offset 0,
                    // check if the previous sibling is a decorator.
                    let targetNode: LexicalNode = originalNode;
                    if ($isTextNode(originalNode) && selection.anchor.offset === 0) {
                        const parent = originalNode.getParent();
                        if (parent instanceof ElementNode) {
                            const siblings = parent.getChildren();
                            const index = siblings.findIndex((node) => node.getKey() === originalNode.getKey());
                            if (index > 0) {
                                const prevSibling = siblings[index - 1];
                                if (prevSibling instanceof ClickableDecoratorNode) {
                                    targetNode = prevSibling;
                                    // Snap selection to the end of the decorator.
                                    const newOffset = targetNode.getTextContent().length;
                                    selection.anchor.set(targetNode.getKey(), newOffset, "text");
                                    selection.focus.set(targetNode.getKey(), newOffset, "text");
                                    $setSelection(selection);
                                    console.log("Snapped selection to decorator", targetNode.getKey());
                                }
                            }
                        }
                    }

                    // Now we assume that if targetNode is a decorator, it’s the one to edit.
                    // Instead of calling $getSelection() again, we use our targetNode.
                    let effectiveDecorator: ClickableDecoratorNode | null = null;
                    if (targetNode instanceof ClickableDecoratorNode) {
                        effectiveDecorator = targetNode;
                    } else {
                        // If not, try to determine if the atomic offset falls within a decorator.
                        const paragraph = originalNode.getTopLevelElementOrThrow() as ElementNode;
                        const atomicOffset = selection.anchor.offset;
                        const { child } = getChildAndOffsetRange(paragraph, atomicOffset);
                        if (child && child instanceof ClickableDecoratorNode) {
                            effectiveDecorator = child;
                        }
                    }

                    if (effectiveDecorator) {
                        // Use the decorator's full visible length as the effective offset.
                        const textContent = effectiveDecorator.getTextContent();
                        const effectiveOffset = textContent.length; // assume caret is at the end
                        if (effectiveOffset > 0) {
                            // Remove one character immediately before the effective offset.
                            const newText = textContent.slice(0, effectiveOffset - 1) + textContent.slice(effectiveOffset);
                            const plainTextNode = $createTextNode(newText);
                            effectiveDecorator.replace(plainTextNode);
                            // Set selection at the new offset.
                            const newOffset = effectiveOffset - 1;
                            selection.anchor.set(plainTextNode.getKey(), newOffset, "text");
                            selection.focus.set(plainTextNode.getKey(), newOffset, "text");
                            $setSelection(selection);
                            event.preventDefault();
                            return true;
                        }
                    }
                    return false;
                },
                COMMAND_PRIORITY_CRITICAL
            );
            return () => unregister();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editorRef.current]);




    useEffect(() => {
        if (editorRef.current) {
            const removeTabPress = editorRef.current.registerCommand(
                KEY_TAB_COMMAND,
                (event: KeyboardEvent) => {
                    event.preventDefault();
                    event.stopPropagation();
                    handleTabPress();
                    return true;
                }, COMMAND_PRIORITY_CRITICAL
            );
            return () => {
                removeTabPress();
            };
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editorRef.current, handleTabPress]);

    useEffect(() => {
        if (editorRef.current) {
            const removeEnterPress = editorRef.current.registerCommand(
                KEY_ENTER_COMMAND,
                (event: KeyboardEvent) => {
                    event.preventDefault();
                    event.stopPropagation();
                    handleEnterPress();
                    return true;
                }, COMMAND_PRIORITY_CRITICAL
            );
            return () => {
                removeEnterPress();
            };
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editorRef.current, handleEnterPress]);

    useEffect(() => {
        if (editorRef.current) {
            const removeListener = editorRef.current.registerCommand(
                PASTE_COMMAND,
                (event: ClipboardEvent) => {
                    event.preventDefault();
                    // Handle the paste event
                    const pastedText = event.clipboardData?.getData("text/plain")
                    if (pastedText) {
                        const cleanedText = pastedText
                            .replace(/“/g, '"') // Left double quote
                            .replace(/”/g, '"') // Right double quote
                            .replace(/‘/g, "'") // Left single quote
                            .replace(/’/g, "'") // Right single quote
                            .replace(/--/g, "—"); // double-hyphen to em-dash
                        const paragraphs = cleanedText.split("\n");
                        if (paragraphs.length > 100) {
                            const newAlert = {
                                title: "Oh, jeez",
                                message: "You're pasting a lot of paragraphs. This may take awhile to process...",
                                severity: AlertToastType.warning,
                                open: true,
                                timeout: 10000,
                            };
                            setAlertState(newAlert);
                            console.log(`Large paste operation detected. Total paragraphs: ${paragraphs.length}`);
                        }

                        editorRef.current?.update(() => {
                            const selection = $getSelection();

                            if ($isRangeSelection(selection)) {
                                let lastInsertedNode = selection.anchor.getNode();

                                // Ensure we're working with the top-level parent node
                                const parent = lastInsertedNode.getTopLevelElementOrThrow();

                                const isParentEmpty = parent.getTextContent().trim() === "";
                                if (isParentEmpty) {
                                    parent.clear();
                                }
                                paragraphs.forEach((paragraphText, index) => {
                                    if (!paragraphText.startsWith("\t") && documentSettings?.autotab) {
                                        paragraphText = `\t${paragraphText}`;
                                    }

                                    if (index === 0 && isParentEmpty) {
                                        // Replace the first paragraph if the parent is empty
                                        parent.append($createTextNode(paragraphText));
                                        lastInsertedNode = parent; // Update reference
                                        const customKey = (parent as CustomParagraphNode).getKeyId();
                                        if (customKey)
                                            pastedParagraphKeys.current.add(customKey);
                                    } else if (index === 0) {
                                        // Insert text at the current selection for the first paragraph
                                        selection.insertText(paragraphText);
                                        lastInsertedNode = selection.anchor.getNode(); // Update reference
                                        const customKey = (parent as CustomParagraphNode).getKeyId()
                                        if (customKey)
                                            pastedParagraphKeys.current.add(customKey);
                                    } else {
                                        // Create and append new paragraphs for subsequent lines
                                        const customKey = uuidv4();
                                        const newParagraphNode = new CustomParagraphNode(customKey);
                                        newParagraphNode.append($createTextNode(paragraphText));

                                        if (lastInsertedNode) {
                                            lastInsertedNode.insertAfter(newParagraphNode);
                                        } else {
                                            parent.append(newParagraphNode);
                                        }
                                        pastedParagraphKeys.current.add(customKey);
                                        lastInsertedNode = newParagraphNode; // Update reference
                                    }
                                });
                            } else {
                                // Append to the root if no selection exists
                                const root = $getRoot();
                                let lastInsertedNode: null | ParagraphNode = null;

                                paragraphs.forEach((paragraphText, index) => {
                                    if (index > 0 && !paragraphText.startsWith("\t")) {
                                        paragraphText = `\t${paragraphText}`;
                                    }
                                    const customKey = uuidv4();
                                    const paragraphNode = new CustomParagraphNode(customKey);
                                    paragraphNode.append($createTextNode(paragraphText));

                                    if (lastInsertedNode) {
                                        lastInsertedNode.insertAfter(paragraphNode);
                                    } else {
                                        root.append(paragraphNode); // Append the first paragraph directly to the root
                                    }
                                    pastedParagraphKeys.current.add(customKey);
                                    lastInsertedNode = paragraphNode; // Update reference
                                });
                            }
                        });

                    }
                    return true;
                },
                1
            );

            // Cleanup the listener on unmount
            return () => {
                removeListener();
            };
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setAlertState, editorRef.current, documentSettings?.autotab, pastedParagraphKeys]);

}
