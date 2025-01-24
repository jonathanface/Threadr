import { useCallback, useEffect, useRef, useState } from 'react';
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { $createTextNode, $isRangeSelection, $isTextNode, KEY_TAB_COMMAND, LexicalEditor, ParagraphNode, PASTE_COMMAND, SerializedEditorState, SerializedElementNode, SerializedLexicalNode, SerializedTextNode, TextNode } from 'lexical';
import {
  $getRoot,
  $getSelection,
  $isElementNode,
  EditorState,
  ElementNode,
} from 'lexical';
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary';
import styles from "./threadwriter.module.css";
import { Toolbar } from '../ThreadWriterToolbar';
import { useLoader } from '../../hooks/useLoader';
import { DbOperationQueue, ProcessDBQueue } from './queue';
import { DBOperation, DBOperationBlock, DBOperationType } from '../../types/DBOperations';
import { v4 as uuidv4 } from 'uuid';
import { CustomParagraphNode, CustomSerializedParagraphNode } from './customNodes/CustomParagraphNode';
import { BlockOrderMap } from '../../types/Document';
import { useToaster } from '../../hooks/useToaster';
import { AlertToastType } from '../../types/AlertToasts';
import { AssociationDecoratorPlugin } from './plugins/AssociationDecoratorPlugin';
import { ClickableDecoratorNode } from './customNodes/ClickableDecoratorNode';
import { Association, SimplifiedAssociation } from '../../types/Associations';
import { AssociationPanel } from '../AssociationPanel';
import { useCurrentSelections } from '../../hooks/useCurrentSelections';

const theme = {
  paragraph: styles.paragraph,
  text: {
    bold: styles.bold,
    italic: styles.italic,
    underline: styles.underline,
    strikethrough: styles.strikethrough,
  },
};
//{"children":[{"detail":0,"format":0,"mode":"normal","style":"","text":"bcd","type":"text","version":1}],"direction":"ltr","format":"","indent":0,"type":"custom-paragraph","version":1,"textFormat":0,"textStyle":"","key_id":"4b6b9b65-595b-4a98-9dbd-644a48a35e70"}
const generateBlankLine = (): CustomSerializedParagraphNode => ({
  children: [],
  direction: "ltr",
  format: "",
  indent: 0,
  textFormat: 0,
  textStyle: "",
  type: CustomParagraphNode.getType(),
  version: 1,
  key_id: uuidv4(),
});

const getParagraphIndexByKey = (editor: EditorState, key: string): number | null => {
  let result: number | null = null;
  editor.read(() => {
    const root = $getRoot();
    const children = root.getChildren<ElementNode>();

    for (let index = 0; index < children.length; index++) {
      const node = children[index];
      if (node.getType() === CustomParagraphNode.getType() && node.getKey() === key) {
        result = index;
        break;
      }
    }
  });
  return result;
};

const getParagraphByCustomKey = (editor: EditorState, key: string): CustomParagraphNode | null => {
  editor.read(() => {
    const root = $getRoot();
    const children = root.getChildren<ElementNode>();

    for (let index = 0; index < children.length; index++) {
      const node = children[index] as CustomParagraphNode;
      if (node.getKeyId() === key) {
        return node;
      }
    }
  });
  return null;
};

const serializeWithChildren = (node: ElementNode): CustomSerializedParagraphNode => {
  if (!(node instanceof CustomParagraphNode)) {
    throw new Error("Node is not an instance of CustomParagraphNode");
  }

  const json = node.exportJSON() as CustomSerializedParagraphNode;

  const children = node.getChildren();
  const mergedChildren: SerializedLexicalNode[] = [];

  let bufferText = ""; // Buffer to accumulate text from `clickable-decorator` and `text` nodes

  children.forEach((child) => {
    if (child.getType() === "clickable-decorator" || $isTextNode(child)) {
      // Accumulate text from both `clickable-decorator` and `text` nodes
      bufferText += child.getTextContent();
    } else if ($isElementNode(child)) {
      // Serialize nested child elements
      if (bufferText) {
        // If there's buffered text, create a text node for it
        mergedChildren.push({
          type: "text",
          version: 1,
          text: bufferText,
          format: 0,
          style: "",
          mode: "normal",
          detail: 0,
        } as SerializedTextNode);
        bufferText = ""; // Clear the buffer
      }
      mergedChildren.push(serializeWithChildren(child as ElementNode)); // Recursively serialize child element
    } else {
      // If it's an unsupported node, flush buffer and skip
      if (bufferText) {
        mergedChildren.push({
          type: "text",
          version: 1,
          text: bufferText,
          format: 0,
          style: "",
          mode: "normal",
          detail: 0,
        } as SerializedTextNode);
        bufferText = ""; // Clear the buffer
      }
    }
  });

  // Add any remaining buffered text as a final text node
  if (bufferText) {
    mergedChildren.push({
      type: "text",
      version: 1,
      text: bufferText,
      format: 0,
      style: "",
      mode: "normal",
      detail: 0,
    } as SerializedTextNode);
  }

  json.children = mergedChildren;

  return json;
};



const generateTextHash = (editor: LexicalEditor): string => {
  let hash = "";

  editor.getEditorState().read(() => {
    const root = $getRoot();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const traverseNode = (node: any) => {
      const nodeKey = node.getKey();
      const nodeType = node.getType();
      const textContent = node.getTextContent();

      // Include formatting attributes (e.g., bold, italic)
      const formatAttributes =
        node instanceof TextNode
          ? JSON.stringify({
            format: node.getFormat(), // Bitmask for bold, italic, underline, etc.
            style: node.getStyle(), // Inline styles (e.g., font size, color)
          })
          : "";

      // Include node's serialized data in the hash
      hash += `${nodeKey}:${nodeType}:${textContent}:${formatAttributes};`;

      // Recursively process children (if any)
      if (node.getChildren) {
        node.getChildren().forEach(traverseNode);
      }
    };

    traverseNode(root);
  });

  return hash;
};

export const ThreadWriter = () => {
  const initialConfig = {
    namespace: 'ThreadWriterEditor',
    theme,
    nodes: [
      CustomParagraphNode,
      ClickableDecoratorNode
    ],
    onError: (error: Error) => {
      console.error('Lexical error:', error);
    },
  };

  const { setAlertState } = useToaster();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null);
  const [storyBlocks, setStoryBlocks] = useState<SerializedEditorState | null>(null);
  const { setIsLoaderVisible } = useLoader();
  const previousNodeKeysRef = useRef<Set<string>>(new Set());
  const previousTextHashRef = useRef<string | null>(null); // Stores the previous text state as a hash
  const pastedParagraphKeys = useRef(new Set<string>());
  const [associations, setAssociations] = useState<SimplifiedAssociation[] | null>(null);
  const { currentStory, currentChapter } = useCurrentSelections();

  const getAllAssociations = useCallback(async () => {
    if (!currentStory) return;
    try {
      const response = await fetch("/api/stories/" + currentStory.story_id + "/associations/thumbs");
      if (!response.ok) throw response;
      const associationsData = await response.json();
      setAssociations(associationsData.map((association: SimplifiedAssociation) => {
        if (association.association_name.trim().length) {
          return association;
        }
      }));
    } catch (error: unknown) {
      console.error(`error retrieving associations: ${error}`);
    }
  }, [currentStory, currentStory?.story_id]);

  const getBatchedStoryBlocks = useCallback(async (startKey: string) => {
    if (!currentStory || !currentChapter) return;
    try {
      const response = await fetch(`/api/stories/${currentStory.story_id}/content?key=${startKey}&chapter=${currentChapter.id}`);
      if (!response.ok) throw response;

      const data = await response.json();
      const nodeKeys = new Set<string>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const remappedStoryBlocks = data.items.map((item: { chunk: any; key_id: any }) => {
        nodeKeys.add(item.key_id.Value);
        const fixed: CustomSerializedParagraphNode = item.chunk.Value
          ? JSON.parse(item.chunk.Value)
          : generateBlankLine();
        fixed.key_id = item.key_id.Value;

        if (fixed.type !== CustomParagraphNode.getType()) {
          fixed.type = CustomParagraphNode.getType();
        }
        return fixed;
      });
      previousNodeKeysRef.current = nodeKeys;
      setStoryBlocks({
        root: {
          children: remappedStoryBlocks,
          type: "root",
          version: 1,
          direction: "ltr",
          format: "",
          indent: 0,
        },
      });
    } catch (error: unknown) {
      const response: Response = error as Response;
      if (response.status === 404) {
        editorRef.current.update(() => {
          const newParagraph = new CustomParagraphNode(uuidv4());
          const root = $getRoot();
          root.append(newParagraph);
        });
        return;
      }
      console.error("Error retrieving story content:", error);
    }
  }, [currentStory, currentChapter]);

  const handleTabPress = () => {
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
  }

  const queueParagraphOrderResync = () => {
    if (!currentStory || !currentChapter) return;
    editorRef.current.read(() => {
      const root = $getRoot();
      const paragraphs = root.getChildren().filter((node) => node.getType() === "custom-paragraph");
      const orderMap: BlockOrderMap = {
        chapter_id: currentChapter.id,
        blocks: []
      }
      paragraphs.forEach(paragraph => {
        const index = getParagraphIndexByKey(editorRef.current, paragraph.getKey());
        if (index !== null) {
          const asCP = paragraph as CustomParagraphNode;
          const customKey = asCP.getKeyId();
          if (customKey) {
            orderMap.blocks.push({ key_id: customKey, place: index.toString() });
          }

        }
      })
      DbOperationQueue.push({
        type: DBOperationType.syncOrder,
        orderList: orderMap,
        blocks: [],
        time: Date.now(),
        storyID: currentStory.story_id,
        chapterID: currentChapter.id,
      });
    });
  }

  const queueParagraphForDeletion = (customKey: string) => {
    if (!currentStory || !currentChapter) return;
    const deleteBlock: DBOperationBlock = { key_id: customKey };
    const storyID = currentStory.story_id;
    const chapterID = currentChapter.id;
    const op: DBOperation = { type: DBOperationType.delete, storyID, chapterID, blocks: [deleteBlock], time: Date.now() };
    DbOperationQueue.push(op);
  };

  const queueParagraphForSave = useCallback((customKey: string, order: string, content: SerializedElementNode<SerializedLexicalNode>) => {
    if (!currentStory || !currentChapter) return;
    const saveBlock: DBOperationBlock = { key_id: customKey, chunk: content, place: order };
    const storyID = currentStory.story_id;
    const chapterID = currentChapter.id;
    const op: DBOperation = {
      type: DBOperationType.save,
      storyID,
      chapterID,
      blocks: [saveBlock],
      time: Date.now(),
    };
    DbOperationQueue.push(op);
  }, [currentChapter?.id, currentStory?.story_id]);


  useEffect(() => {
    const retrieveData = async () => {
      try {
        setIsLoaderVisible(true);
        await getBatchedStoryBlocks("");
        setIsLoaderVisible(true);
        await getAllAssociations();
      } catch (error: unknown) {
        console.error(`error retrieving story data ${error}`);
      } finally {
        setIsLoaderVisible(false);
      }
    }
    retrieveData();

  }, [getAllAssociations, getBatchedStoryBlocks]);

  useEffect(() => {
    if (editorRef.current && storyBlocks) {
      Promise.resolve().then(() => {
        editorRef.current.update(() => {
          const newEditorState = editorRef.current.parseEditorState({
            ...storyBlocks,
            root: {
              ...storyBlocks.root,
              children: storyBlocks.root.children.map((child) => {
                if (child.type === "paragraph") {
                  child.type = CustomParagraphNode.getType();
                }
                return child;
              }),
            },
          });
          editorRef.current.setEditorState(newEditorState);
        });
      });
    }
  }, [storyBlocks]);

  useEffect(() => {
    if (editorRef.current) {
      // Transform default ParagraphNode to CustomParagraphNode
      editorRef.current.registerNodeTransform(ParagraphNode, (node: ParagraphNode) => {
        if (!(node instanceof CustomParagraphNode) || !node.getKeyId()) {
          const replacement = new CustomParagraphNode(uuidv4());
          replacement.append(...node.getChildren());
          node.replace(replacement);
          console.log(`Replaced ParagraphNode ${node.getKey()} with CustomParagraphNode`);
        }
      });

      // Handle empty CustomParagraphNodes
      editorRef.current.registerNodeTransform(CustomParagraphNode, (node: CustomParagraphNode) => {
        if (node.getTextContent().trim() === "") {
          // Prevent redundant replacement of already empty nodes
          editorRef.current.update(() => {
            const index = getParagraphIndexByKey(editorRef.current, node.getKey());
            if (index !== null) {
              const id = node.getKeyId();
              if (id) {
                queueParagraphForSave(id, index.toString(), serializeWithChildren(node));
              }
            }
          });

        }
      });
    }
  }, [queueParagraphForSave]);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.update(() => {
        const root = $getRoot();
        const children = root.getChildren();

        children.forEach((child) => {
          if (child.getType() === "paragraph" && !(child instanceof CustomParagraphNode)) {
            console.error(`Existing ParagraphNode found: ${child.getKey()}`);
            const replacement = new CustomParagraphNode(uuidv4());
            replacement.append(...(child as ElementNode).getChildren<ElementNode>());
            child.replace(replacement);
            console.log(`Replaced ParagraphNode ${child.getKey()} with CustomParagraphNode`);
          }
        });
      });
    }
  }, []);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.registerCommand(
        KEY_TAB_COMMAND,
        (event: KeyboardEvent) => {
          event.preventDefault();
          handleTabPress();
          return true;
        }, 1
      );
    }
  }, []);

  useEffect(() => {
    const processInterval = setInterval(() => {
      try {
        ProcessDBQueue();
      } catch (error: unknown) {
        console.error((error as Error).message);
        setAlertState({
          title: "Unable to sync",
          message:
            "We are experiencing difficulty contacting the server. We'll keep attempting to save your work as long as you leave this window open, however we suggest you save a local copy of your current work.",
          severity: AlertToastType.error,
          open: true,
          timeout: 6000,
        });
      }
    }, 5000);
    window.addEventListener("unload", () => {
      // Final queue processing...
    });

    return () => {
      clearInterval(processInterval);
      window.removeEventListener("unload", () => { });
    };
  }, [currentStory?.story_id, setAlertState]);

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
              .replace(/’/g, "'"); // Right single quote
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

            editorRef.current.update(() => {
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
                  if (index > 0 && !paragraphText.startsWith("\t")) {
                    paragraphText = `\t${paragraphText}`;
                  }

                  if (index === 0 && isParentEmpty) {
                    // Replace the first paragraph if the parent is empty
                    parent.append($createTextNode(paragraphText));
                    lastInsertedNode = parent; // Update reference
                  } else if (index === 0) {
                    // Insert text at the current selection for the first paragraph
                    selection.insertText(paragraphText);
                    lastInsertedNode = selection.anchor.getNode(); // Update reference
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
                  console.log("pushing2", customKey);
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
  }, [editorRef.current, setAlertState]);

  const onChangeHandler = (editorState: EditorState): void => {
    const currentHash = generateTextHash(editorRef.current); // Get the current text hash
    const previousHash = previousTextHashRef.current;

    if (currentHash === previousHash) {
      console.log("No text changes detected, skipping processing.");
      return;
    }

    previousTextHashRef.current = currentHash;

    const currentNodeKeys = new Set<string>();
    const newParagraphKeys = new Set<string>();
    let orderResyncRequired = false;

    // Read current editor state
    editorState.read(() => {
      const root = $getRoot();
      const children = root.getChildren();

      const previousNodeKeys = previousNodeKeysRef.current;
      const deletedKeys = new Set(previousNodeKeys);

      children.forEach((node, nodeIndex) => {
        if (node instanceof CustomParagraphNode) {
          const id = node.getKeyId();
          if (id) {
            // Detect new paragraphs
            if (!previousNodeKeys.has(id)) {
              newParagraphKeys.add(id);
              if (nodeIndex !== children.length - 1) {
                orderResyncRequired = true;
              }
            }

            // Track current node keys and remove from deletedKeys
            currentNodeKeys.add(id);
            deletedKeys.delete(id);
            const selection = $getSelection();
            const customParagraph = $isRangeSelection(selection)
              ? selection.anchor.getNode().getParent()
              : null;

            const selectedNodeKey = customParagraph instanceof CustomParagraphNode ? customParagraph.getKeyId() : null;
            if (pastedParagraphKeys.current.has(id) || newParagraphKeys.has(id) || id === selectedNodeKey) {
              const textContent = node.getTextContent().trim();
              if (textContent.length) {
                const paragraphWithChildren = serializeWithChildren(node);
                queueParagraphForSave(
                  paragraphWithChildren.key_id,
                  nodeIndex.toString(),
                  paragraphWithChildren
                );
              }
              pastedParagraphKeys.current.delete(id); // Clean up processed key
            }
          }
        }
      });
      // Handle deleted nodes
      deletedKeys.forEach((key) => {
        queueParagraphForDeletion(key);
        orderResyncRequired = true;
      });
    });

    // Apply updates for new paragraphs
    if (newParagraphKeys.size > 0) {
      editorRef.current.update(() => {
        newParagraphKeys.forEach((key) => {
          const node = getParagraphByCustomKey(editorRef.current, key);
          if (node?.getTextContent().trim() === "") {
            const tabTextNode = $createTextNode("\t");
            node.append(tabTextNode);

            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
              selection.anchor.set(tabTextNode.getKey(), 1, "text");
              selection.focus.set(tabTextNode.getKey(), 1, "text");
            }
          }
        });
      });
    }

    // Update reference with current keys
    previousNodeKeysRef.current = currentNodeKeys;

    // Resync order if needed
    if (orderResyncRequired) {
      queueParagraphOrderResync();
    }
  };

  const onAssociationEditCallback = useCallback(async (assoc: Association) => {
    if (!currentStory) return;
    try {
      setIsLoaderVisible(true);
      const response = await fetch("/api/stories/" + currentStory.story_id + "/associations", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify([assoc]),
      });
      if (!response.ok) {
        throw new Error(`Error saving association: ${response.body}`);
      }
    } catch (error: unknown) {
      console.error(`Error saving association: ${error}`)
      setAlertState({
        title: "Save Failure",
        message:
          "We are unable to save your association. Please try again later.",
        severity: AlertToastType.error,
        open: true,
        timeout: 6000,
      });
    } finally {
      if (associations) {
        const updatedAssociations = associations?.map((storedAssociation) => {
          if (storedAssociation.association_id === assoc.association_id) {
            return {
              association_id: assoc.association_id,
              association_name: assoc.association_name,
              association_type: assoc.association_type,
              short_description: assoc.short_description,
              portrait: assoc.portrait,
              aliases: assoc.details.aliases,
              case_sensitive: assoc.details.case_sensitive
            }
          }
          return storedAssociation;
        })
        setAssociations(updatedAssociations);
      }
      setIsLoaderVisible(false);
    }
  }, [currentStory?.story_id]);

  return (
    <div className={styles.editorContainer}>
      <LexicalComposer
        initialConfig={{
          ...initialConfig,
          editorState: (editor) => {
            editorRef.current = editor;
          },
        }}
      >
        <Toolbar />
        <RichTextPlugin
          contentEditable={<ContentEditable className={styles.editorInput} />}
          placeholder={<div className={styles.placeholder}>Start typing...</div>}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <AssociationDecoratorPlugin associations={associations} scrollToTop={true} />
        <OnChangePlugin onChange={onChangeHandler} />
        <HistoryPlugin />
        <AssociationPanel associations={associations} onEditCallback={onAssociationEditCallback} />
      </LexicalComposer>
    </div>
  );
};
