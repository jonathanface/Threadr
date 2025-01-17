import { useCallback, useEffect, useRef, useState } from 'react';
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { $createTextNode, $isRangeSelection, $isTextNode, KEY_TAB_COMMAND, LexicalEditor, ParagraphNode, SerializedEditorState, SerializedElementNode, SerializedLexicalNode } from 'lexical';
import {
  $getRoot,
  $getSelection,
  $isElementNode,
  EditorState,
  ElementNode,
} from 'lexical';
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary';
import styles from "./threadwriter.module.css";
import { Toolbar } from './Toolbar';
import { useLoader } from '../../hooks/useLoader';
import { Chapter } from '../../types/Chapter';
import { DbOperationQueue, ProcessDBQueue } from './queue';
import { DBOperation, DBOperationBlock, DBOperationType } from '../../types/DBOperations';
import { v4 as uuidv4 } from 'uuid';
import { CustomParagraphNode, CustomSerializedParagraphNode } from './customNodes/CustomParagraphNode';
import { BlockOrderMap } from '../../types/Document';
import { useToaster } from '../../hooks/useToaster';
import { AlertToastType } from '../../types/AlertToasts';
import { AssociationDecoratorPlugin } from './plugins/AssociationDecoratorPlugin';
import { ClickableDecoratorNode } from './customNodes/ClickableDecoratorNode';
import { Association } from '../../types/Associations';

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

const serializeWithChildren = (node: ElementNode): CustomSerializedParagraphNode => {
  if (!(node instanceof CustomParagraphNode)) {
    throw new Error("Node is not an instance of CustomParagraphNode");
  }

  // Export the node to JSON and then modify its children
  const json = node.exportJSON() as CustomSerializedParagraphNode;

  // Map over the children to serialize them properly
  json.children = node.getChildren().map((child) => {

    if ($isElementNode(child)) {
      // Recursively serialize child elements
      return serializeWithChildren(child as ElementNode);
    }

    // Serialize text nodes and other supported nodes
    return child.exportJSON();
  });
  return json;
};

const generateTextHash = (editor: LexicalEditor): string => {
  let combinedText = "";

  editor.getEditorState().read(() => {
    const root = $getRoot();
    const children = root.getChildren();

    children.forEach((node) => {
      if (node instanceof CustomParagraphNode) {
        combinedText += node.getTextContent();
      }
    });
  });

  // Generate a simple hash or checksum of the combined text
  return combinedText; // For large text, you might want to use a hashing function here
};

interface ThreadWriterProps {
  storyID: string;
  chapter: Chapter;
}

export const ThreadWriter = ({ storyID, chapter }: ThreadWriterProps) => {
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
  const [associations, setAssociations] = useState<Association[] | null>(null);

  const getAllAssociations = useCallback(async () => {
    try {
      const response = await fetch("/api/stories/" + storyID + "/associations");
      if (!response.ok) throw response;
      const associationsData = await response.json();
      setAssociations(associationsData.map((association: Association) => {
        if (association.association_name.trim().length) {
          return association;
        }
      }));
    } catch (error: unknown) {
      console.error(`error retrieving associations: ${error}`);

    }
  }, [storyID]);


  const getBatchedStoryBlocks = useCallback(async (startKey: string) => {
    try {
      setIsLoaderVisible(true);
      const response = await fetch(`/api/stories/${storyID}/content?key=${startKey}&chapter=${chapter.id}`);
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
        return;
      }
      console.error("Error retrieving story content:", error);
    } finally {
      setIsLoaderVisible(false);
    }
  }, [setIsLoaderVisible, storyID, chapter.id]);

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
    const root = $getRoot();
    const paragraphs = root.getChildren().filter((node) => node.getType() === "custom-paragraph");
    const orderMap: BlockOrderMap = {
      chapter_id: chapter.id,
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
      storyID: storyID,
      chapterID: chapter.id,
    });
  }

  const queueParagraphForDeletion = (customKey: string) => {
    const deleteBlock: DBOperationBlock = { key_id: customKey };
    const op: DBOperation = { type: DBOperationType.delete, storyID, chapterID: chapter.id, blocks: [deleteBlock], time: Date.now() };
    DbOperationQueue.push(op);
  };

  const queueParagraphForSave = useCallback((customKey: string, order: string, content: SerializedElementNode<SerializedLexicalNode>) => {
    const saveBlock: DBOperationBlock = { key_id: customKey, chunk: content, place: order };
    const op: DBOperation = {
      type: DBOperationType.save,
      storyID,
      chapterID: chapter.id,
      blocks: [saveBlock],
      time: Date.now(),
    };
    DbOperationQueue.push(op);
  }, [chapter.id, storyID]);

  useEffect(() => {
    getBatchedStoryBlocks("");
  }, [getBatchedStoryBlocks]);

  useEffect(() => {
    getAllAssociations();
  }, [getAllAssociations]);

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
  }, [storyID, setAlertState]);

  const onChangeHandler = (editorState: EditorState): void => {
    const currentHash = generateTextHash(editorRef.current); // Get the current text hash
    const previousHash = previousTextHashRef.current;
    if (currentHash === previousHash) {
      // No changes, skip processing
      console.log("No text changes detected, skipping processing.");
      return;
    }
    previousTextHashRef.current = currentHash;
    const currentNodeKeys = new Set<string>();
    let orderResyncRequired = false;

    editorState.read(() => {
      const root = $getRoot();
      const children = root.getChildren();

      const previousNodeKeys = previousNodeKeysRef.current;
      const deletedKeys = new Set(previousNodeKeys);

      children.forEach((node, nodeIndex) => {
        if (node instanceof CustomParagraphNode) {
          const id = node.getKeyId();

          if (id) {
            // Check for new paragraphs
            if (!previousNodeKeys.has(id)) {
              if (nodeIndex !== children.length - 1) {
                console.log(`New paragraph added at index ${nodeIndex}, not at the end of the document.`);
                orderResyncRequired = true;
              }

              // Update the new paragraph node
              editorRef.current.update(() => {
                const writableNode = node.getWritable();
                if (writableNode.getTextContent().trim() === "") {
                  const tabTextNode = $createTextNode("\t");
                  writableNode.append(tabTextNode);

                  const selection = $getSelection();
                  if ($isRangeSelection(selection)) {
                    selection.anchor.set(tabTextNode.getKey(), 1, "text");
                    selection.focus.set(tabTextNode.getKey(), 1, "text");
                  }
                }
              });
            }

            // Track current node keys and remove from deletedKeys
            currentNodeKeys.add(id);
            deletedKeys.delete(id);
          }
        }
      });

      // Handle deleted nodes
      deletedKeys.forEach((key) => {
        queueParagraphForDeletion(key);
        orderResyncRequired = true;
      });

      // Update the reference with current keys
      previousNodeKeysRef.current = currentNodeKeys;

      // Save updated paragraphs
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        const selectedNode = selection.anchor.getNode();
        const parentParagraph = selectedNode.getParent();

        if (parentParagraph instanceof CustomParagraphNode) {
          const textContent = parentParagraph.getTextContent().trim();
          const parentIndex = children.indexOf(parentParagraph);
          if (parentIndex !== -1 && textContent.length) {
            const paragraphWithChildren = serializeWithChildren(parentParagraph);
            queueParagraphForSave(paragraphWithChildren.key_id, parentIndex.toString(), paragraphWithChildren);
          }
        }
      }

      // Resync order if needed
      if (orderResyncRequired) {
        queueParagraphOrderResync();
      }
    });
  };


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
        <AssociationDecoratorPlugin associations={associations} />
        <OnChangePlugin onChange={onChangeHandler} />
        <HistoryPlugin />
      </LexicalComposer>
    </div>
  );
};
