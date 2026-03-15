import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_HIGH,
  KEY_BACKSPACE_COMMAND,
  KEY_TAB_COMMAND,
  LexicalEditor,
  ParagraphNode,
  PASTE_COMMAND,
  TextNode,
} from "lexical";
import { useCallback, useEffect } from "react";
import { CustomParagraphNode } from "../customNodes/CustomParagraphNode";
import { v4 as uuidv4 } from "uuid";
import { AlertToastType } from "../../../types/AlertToasts";
import { useToaster } from "../../../hooks/useToaster";
import { $isAssociationInlineNode } from "../customNodes/AssociationInlineNode";
import { useDocumentSettings } from "./useDocumentSettings";

export const useEditorCommands = (
  editorRef: React.RefObject<LexicalEditor | null>,
  pastedParagraphKeys: React.RefObject<Set<string>>,
) => {
  const { documentSettings } = useDocumentSettings();
  const { setAlertState } = useToaster();

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
            if ($isAssociationInlineNode(anchorNode)) {
              const newText = new TextNode("\t");
              anchorNode.insertBefore(newText);
            } else if ($isTextNode(anchorNode)) {
              // Case: Cursor is inside a TextNode
              const currentText = anchorNode.getTextContent();
              const beforeText = currentText.slice(0, anchorOffset); // Text before the cursor
              const afterText = currentText.slice(anchorOffset); // Text after the cursor

              // Update the existing TextNode
              const writableNode = anchorNode.getWritable();
              writableNode.setTextContent(beforeText + "\t" + afterText);

              // Update the selection to be at the end of the tab
              selection.anchor.set(
                writableNode.getKey(),
                anchorOffset + 1,
                "text",
              );
              selection.focus.set(
                writableNode.getKey(),
                anchorOffset + 1,
                "text",
              );
            } else {
              const currentIndent = parentNode.getIndent() || 0;
              parentNode.setIndent(currentIndent + 1);
            }
          } else if (
            !$isAssociationInlineNode(selectedNode) &&
            !$isTextNode(selectedNode) &&
            $isElementNode(parentNode)
          ) {
            // Handling blank line or root-level selection
            const newTextNode = $createTextNode("\t");
            selectedNode.append(newTextNode);
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
              selection.anchor.set(newTextNode.getKey(), 1, "text");
              selection.focus.set(newTextNode.getKey(), 1, "text");
            }
          } else if (
            !$isAssociationInlineNode(selectedNode) &&
            !$isTextNode(selectedNode) &&
            !$isElementNode(parentNode)
          ) {
            const root = $getRoot();
            const newParagraph = new CustomParagraphNode(uuidv4());
            const newTextNode = $createTextNode("\t");
            newParagraph.append(newTextNode);
            root.append(newParagraph);
            selection.anchor.set(newTextNode.getKey(), 1, "text");
            selection.focus.set(newTextNode.getKey(), 1, "text");
          } else if ($isAssociationInlineNode(selectedNode)) {
            const newText = new TextNode("\t");
            selectedNode.insertBefore(newText);
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
      const removeTabPress = editorRef.current.registerCommand(
        KEY_TAB_COMMAND,
        (event: KeyboardEvent) => {
          event.preventDefault();
          event.stopPropagation();
          handleTabPress();
          return true;
        },
        COMMAND_PRIORITY_CRITICAL,
      );
      return () => {
        removeTabPress();
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorRef.current, handleTabPress]);

  // Handle backspace when cursor is immediately after an AssociationInlineNode
  useEffect(() => {
    if (!editorRef.current) return;

    const removeBackspaceHandler = editorRef.current.registerCommand(
      KEY_BACKSPACE_COMMAND,
      (event: KeyboardEvent) => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          return false; // Let default handling proceed
        }

        const anchorNode = selection.anchor.getNode();
        const anchorOffset = selection.anchor.offset;

        // Check if cursor is at the start of a text node with association before it
        if ($isTextNode(anchorNode) && anchorOffset === 0) {
          const prevSibling = anchorNode.getPreviousSibling();
          if ($isAssociationInlineNode(prevSibling)) {
            // Delete the association node
            event.preventDefault();
            prevSibling.remove();
            return true;
          }
        }

        // Check if backspace would move cursor to position 0 with an association before
        // This handles cases like " had decided" where cursor is at position 1
        if ($isTextNode(anchorNode) && anchorOffset === 1) {
          const prevSibling = anchorNode.getPreviousSibling();
          if ($isAssociationInlineNode(prevSibling)) {
            // Manually delete the first character to prevent Lexical from
            // moving cursor to the association
            event.preventDefault();
            const textContent = anchorNode.getTextContent();
            if (textContent.length === 1) {
              // Single character - replace with empty text node
              const emptyText = $createTextNode("");
              anchorNode.replace(emptyText);
              selection.anchor.set(emptyText.getKey(), 0, "text");
              selection.focus.set(emptyText.getKey(), 0, "text");
            } else {
              // Multiple characters - remove first character and stay at position 0
              anchorNode.setTextContent(textContent.slice(1));
              selection.anchor.set(anchorNode.getKey(), 0, "text");
              selection.focus.set(anchorNode.getKey(), 0, "text");
            }
            return true;
          }
        }

        // Check if cursor is inside an association node at position 0
        if ($isAssociationInlineNode(anchorNode) && anchorOffset === 0) {
          const prevSibling = anchorNode.getPreviousSibling();
          if (prevSibling) {
            // Move cursor to end of previous sibling instead of jumping to front
            event.preventDefault();
            if ($isTextNode(prevSibling)) {
              selection.anchor.set(
                prevSibling.getKey(),
                prevSibling.getTextContentSize(),
                "text",
              );
              selection.focus.set(
                prevSibling.getKey(),
                prevSibling.getTextContentSize(),
                "text",
              );
            }
            return true;
          }
        }

        return false; // Let default handling proceed
      },
      COMMAND_PRIORITY_HIGH,
    );

    return () => {
      removeBackspaceHandler();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorRef.current]);

  useEffect(() => {
    if (editorRef.current) {
      const removeListener = editorRef.current.registerCommand(
        PASTE_COMMAND,
        (event: ClipboardEvent) => {
          event.preventDefault();
          // Handle the paste event
          const pastedText = event.clipboardData?.getData("text/plain");
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
                message:
                  "You're pasting a lot of paragraphs. This may take awhile to process...",
                severity: AlertToastType.warning,
                open: true,
                timeout: 10000,
              };
              setAlertState(newAlert);
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
                  if (
                    (index > 0 || isParentEmpty) &&
                    !paragraphText.startsWith("\t") &&
                    documentSettings?.autotab
                  ) {
                    paragraphText = `\t${paragraphText}`;
                  }

                  if (index === 0 && isParentEmpty) {
                    // Replace the first paragraph if the parent is empty
                    parent.append($createTextNode(paragraphText));
                    lastInsertedNode = parent; // Update reference
                    const customNode = parent as CustomParagraphNode;
                    if (customNode) {
                      const customKey = customNode.getKeyId();
                      if (customKey) {
                        pastedParagraphKeys.current.add(customKey);
                      }
                    }
                  } else if (index === 0) {
                    // Insert text at the current selection for the first paragraph
                    selection.insertText(paragraphText);
                    // Use parent (paragraph) not anchor node (TextNode) for subsequent insertAfter calls
                    lastInsertedNode = parent;
                    const customNode = parent as CustomParagraphNode;
                    if (customNode) {
                      const customKey = customNode.getKeyId();
                      if (customKey) {
                        pastedParagraphKeys.current.add(customKey);
                      }
                    }
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
                    // Track all pasted paragraphs including blank lines
                    pastedParagraphKeys.current.add(customKey);
                    lastInsertedNode = newParagraphNode; // Update reference
                  }
                });

                // Move cursor to end of last pasted content
                if (lastInsertedNode) {
                  const lastChild = $isElementNode(lastInsertedNode)
                    ? lastInsertedNode.getLastChild()
                    : lastInsertedNode;
                  if (lastChild && $isTextNode(lastChild)) {
                    selection.anchor.set(
                      lastChild.getKey(),
                      lastChild.getTextContentSize(),
                      "text",
                    );
                    selection.focus.set(
                      lastChild.getKey(),
                      lastChild.getTextContentSize(),
                      "text",
                    );
                  }
                }
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
                  // Track all pasted paragraphs including blank lines
                  pastedParagraphKeys.current.add(customKey);
                  lastInsertedNode = paragraphNode; // Update reference
                });

                // Move cursor to end of last pasted content
                if (lastInsertedNode) {
                  const lastChild = (lastInsertedNode as ParagraphNode).getLastChild();
                  if (lastChild && $isTextNode(lastChild)) {
                    const newSelection = $getSelection();
                    if ($isRangeSelection(newSelection)) {
                      newSelection.anchor.set(
                        lastChild.getKey(),
                        lastChild.getTextContentSize(),
                        "text",
                      );
                      newSelection.focus.set(
                        lastChild.getKey(),
                        lastChild.getTextContentSize(),
                        "text",
                      );
                    }
                  }
                }
              }
            });
          }
          return true;
        },
        1,
      );

      // Cleanup the listener on unmount
      return () => {
        removeListener();
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    setAlertState,
    editorRef.current,
    documentSettings?.autotab,
    pastedParagraphKeys,
  ]);
};
