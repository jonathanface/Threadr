import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  EditorState,
  ElementNode,
  LexicalNode,
  NodeKey,
  ParagraphNode,
  SerializedEditorState,
  SerializedTextNode,
} from "lexical";
import { useEffect, useRef, useState } from "react";
import styles from "./threadwriter.module.css";
import { Toolbar } from "./Toolbar";
import { Chapter } from "../../types/Chapter";
import {
  DBOperation,
  DBOperationBlock,
  DBOperationType,
  DocumentBlocksForServer,
} from "../../types/DBOperations";
import { useLoader } from "../../hooks/useLoader";
import { APIError } from "../../types/API";
import { CustomParagraphNode, SerializedCustomParagraphNode } from "./CustomParagraphNode";
import { v4 as uuidv4 } from "uuid";
import { BlockOrder, BlockOrderMap } from "../../types/Document";

const theme = {
  paragraph: styles.paragraph,
  text: {
    bold: styles.bold,
    italic: styles.italic,
    underline: styles.underline,
    strikethrough: styles.strikethrough,
  },
};

const initialConfig = {
  namespace: "ThreadWriter",
  theme,
  nodes: [CustomParagraphNode],
  onError: (error: Error) => console.error(error),
};

interface ThreadWriterProps {
  storyID: string;
  chapter: Chapter;
}

const dbOperationQueue: DBOperation[] = [];

export const ThreadWriter = ({ storyID, chapter }: ThreadWriterProps) => {
  const editorRef = useRef<any>(null);
  const [storyBlocks, setStoryBlocks] = useState<SerializedEditorState | null>(null);
  const { setIsLoaderVisible } = useLoader();
  const [previousCustomParagraphs, setPreviousCustomParagraphs] = useState<string[]>([]);


  // Helper: Generate blank line
  const generateBlankLine = (): SerializedCustomParagraphNode => ({
    children: [],
    direction: "ltr",
    customKey: uuidv4(),
    format: "",
    indent: 0,
    textFormat: 0,
    textStyle: "",
    type: "customParagraph",
    version: 1,
  });

  // Load story blocks from the server
  const getBatchedStoryBlocks = async (startKey: string) => {
    try {
      setIsLoaderVisible(true);
      const response = await fetch(`/api/stories/${storyID}/content?key=${startKey}&chapter=${chapter.id}`);
      if (!response.ok) throw new Error(response.statusText);
      if (response.status === 204) return;

      const data = await response.json();
      const remappedStoryBlocks = data.items.map((item: { chunk: any; key_id: any }) => {
        const parsedChunk = item.chunk.Value ? JSON.parse(item.chunk.Value) : generateBlankLine();
        return { ...parsedChunk, customKey: item.key_id.Value };
      });

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
    } catch (error) {
      console.error("Error retrieving story content:", error);
    } finally {
      setIsLoaderVisible(false);
    }
  };

  useEffect(() => {
    if (editorRef.current && storyBlocks) {
      const newEditorState = editorRef.current.parseEditorState(storyBlocks);
      editorRef.current.setEditorState(newEditorState);
    }
  }, [storyBlocks])

  // Transform ParagraphNode into CustomParagraphNode
  useEffect(() => {
    getBatchedStoryBlocks("");
    if (editorRef.current) {
      const unregisterTransform = editorRef.current.registerNodeTransform(ParagraphNode, (node: ParagraphNode) => {
        const customParagraphNode = new CustomParagraphNode(uuidv4());
        node.getChildren().forEach((child) => customParagraphNode.append(child));
        node.replace(customParagraphNode);
      });
      return () => unregisterTransform();
    }
  }, []);

  const exportWithChildren = (node: ElementNode) => {
    const json = node.exportJSON();
    const children = node.getChildren();
    json.children = children.map((child: LexicalNode) => child.exportJSON());
    return json;
  };

  useEffect(() => {
    const unregister = editorRef.current.registerUpdateListener(
      ({
        editorState,
        dirtyElements,
        dirtyLeaves,
      }: {
        editorState: EditorState;
        dirtyElements: Map<NodeKey, unknown>;
        dirtyLeaves: Map<NodeKey, unknown>;
      }) => {
        // Only proceed if there are changes to elements or leaves
        if (dirtyElements.size > 0 || dirtyLeaves.size > 0) {
          console.log("Content changed:", { dirtyElements, dirtyLeaves });
          handleChange(editorState);
        }
      });

    return () => {
      unregister();
    };
  }, []);

  const handleChange = (editorState: any) => {
    editorState.read(() => {

      let orderResyncRequired = false;
      const root = $getRoot();
      const selection = $getSelection();
      const currentCustomParagraphs: string[] = [];

      const paragraphs = root.getChildren().filter((node) => node.getType() === "customParagraph");

      paragraphs.forEach((paragraphNode) => {
        console.log("Parent node type:", paragraphNode.getType());
        const customParagraph = paragraphNode as CustomParagraphNode;
        if (!customParagraph.getCustomKey()) {
          editorRef.current.update(() => customParagraph.setCustomKey(uuidv4()));
        }
        currentCustomParagraphs.push(customParagraph.getCustomKey());
      });

      // Only queue for save if content has changed
      if ($isRangeSelection(selection)) {
        const anchorNode = selection.anchor.getNode();
        const parentNode = anchorNode.getParent();
        console.log("par", parentNode)
        const customParagraphNode = parentNode as CustomParagraphNode;
        console.log("cust", customParagraphNode)
        const customKey = customParagraphNode.getCustomKey();
        const content = exportWithChildren(customParagraphNode);
        const index = getCustomParagraphIndexByKey(customKey);
        if (index !== null) {
          queueParagraphForSave(customKey, index.toString(), content);
        }
      }

      // Detect explicit deletions
      const currentKeysSet = new Set(currentCustomParagraphs);
      const deletedParagraphs = previousCustomParagraphs.filter((key) => !currentKeysSet.has(key));

      deletedParagraphs.forEach((key: string) => {
        console.log("Explicitly Deleted Paragraph:", key);
        queueParagraphForDeletion(key);
      });

      // Update the state with the current customParagraphs
      setPreviousCustomParagraphs(currentCustomParagraphs);

      // Handle paragraph reordering if necessary
      if (orderResyncRequired) {
        queueParagraphOrderResync();
      }
    });
  };



  const queueParagraphOrderResync = () => {
    const root = $getRoot();
    const paragraphs = root.getChildren().filter((node) => node.getType() === "customParagraph");
    const orderMap: BlockOrderMap = {
      chapter_id: chapter.id,
      blocks: []
    }
    paragraphs.forEach(paragraph => {
      const customParagraph = paragraph as CustomParagraphNode;
      const index = getCustomParagraphIndexByKey(customParagraph.getCustomKey());
      if (index !== null) {
        orderMap.blocks.push({ key_id: customParagraph.getCustomKey(), place: index.toString() });
      }
    })
    dbOperationQueue.push({
      type: DBOperationType.syncOrder,
      orderList: orderMap,
      blocks: [],
      time: Date.now(),
      storyID: storyID,
      chapterID: chapter.id,
    });
  }

  // Queue paragraph for saving
  const queueParagraphForSave = (customKey: string, order: string, content: any) => {
    console.log("queueihng", content);
    const saveBlock: DBOperationBlock = { key_id: customKey, chunk: content, place: order };
    const op: DBOperation = { type: DBOperationType.save, storyID, chapterID: chapter.id, blocks: [saveBlock], time: Date.now() };
    dbOperationQueue.push(op);
  };

  // Queue paragraph for saving
  const queueParagraphForDeletion = (customKey: string) => {
    const deleteBlock: DBOperationBlock = { key_id: customKey };
    const op: DBOperation = { type: DBOperationType.delete, storyID, chapterID: chapter.id, blocks: [deleteBlock], time: Date.now() };
    dbOperationQueue.push(op);
  };

  let dbQueueRetryCount = 0;
  const isAPIError = (error: any): boolean => {
    return "statusCode" in error && "statusText" in error && "retry" in error;
  };

  interface OpsHolder {
    [key: string]: DBOperationBlock[];
  }

  const filterAndReduceDBOperations = (
    dbOperations: DBOperation[],
    opType: DBOperationType,
    startIndex: number
  ) => {
    const keyIDMap: OpsHolder = {};
    let j = startIndex;
    while (j < dbOperations.length) {
      const obj = dbOperations[j];
      if (obj.type === opType) {
        obj.blocks.forEach((block) => {
          keyIDMap[block.key_id] = keyIDMap[block.key_id] === undefined ? [] : keyIDMap[block.key_id];
          keyIDMap[block.key_id].push(block);
        });
        dbOperations.splice(j, 1);
      } else {
        j++;
      }
    }
    const toRun: DBOperationBlock[] = [];
    Object.keys(keyIDMap).forEach((keyID) => {
      const lastElement = keyIDMap[keyID].pop();
      if (lastElement) {
        toRun.push(lastElement);
      }
      delete keyIDMap[keyID];
    });
    return toRun;
  };

  const deleteBlocksFromServer = (ops: DBOperationBlock[], storyID: string, chapterID: string) => {
    return new Promise(async (resolve, reject) => {
      try {
        const params: DocumentBlocksForServer = {
          story_id: storyID,
          chapter_id: chapterID,
          blocks: ops,
        };
        const response = await fetch("/api/stories/" + storyID + "/block", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(params),
        });

        if (!response.ok) {
          const error: APIError = {
            statusCode: response.status,
            statusText: response.statusText,
            retry: true,
          };
          reject(error);
          return;
        }
        resolve(response.json());
      } catch (e) {
        console.error("ERROR DELETING BLOCK: " + e);
        reject(e);
      }
    });
  };

  const saveBlocksToServer = (ops: DBOperationBlock[], storyID: string, chapterID: string) => {
    return new Promise(async (resolve, reject) => {
      try {
        const params: DocumentBlocksForServer = {
          story_id: storyID,
          chapter_id: chapterID,
          blocks: ops,
        };
        const response = await fetch(`/api/stories/${storyID}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        });
        if (!response.ok) {
          const error: APIError = { statusCode: response.status, statusText: response.statusText, retry: true };
          reject(error);
          return;
        }
        resolve(response.json());
      } catch (e) {
        console.error("ERROR SAVING BLOCK:", e);
        reject(e);
      }
    });
  };

  const syncBlockOrderMap = (blockList: BlockOrderMap) => {
    return new Promise(async (resolve, reject) => {
      try {
        const params: BlockOrderMap = {
          chapter_id: chapter.id,
          blocks: blockList.blocks,
        };
        const response = await fetch("/api/stories/" + storyID + "/orderMap", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(params),
        });
        if (!response.ok) {
          const error: APIError = {
            statusCode: response.status,
            statusText: response.statusText,
            retry: true,
          };
          reject(error);
          return;
        }
        resolve(response.json());
      } catch (e) {
        console.error("ERROR ORDERING BLOCKS: " + e);
        reject(e);
      }
    });
  };

  const processDBQueue = async () => {
    console.log(`executing DB queue, processing ${dbOperationQueue.length} items`);
    dbOperationQueue.sort((a, b) => a.time - b.time);
    const retryArray: DBOperation[] = [];
    const i = 0;
    while (i < dbOperationQueue.length) {
      const op = dbOperationQueue[i];
      switch (op.type) {
        case DBOperationType.save: {
          const minifiedBlocks = filterAndReduceDBOperations(dbOperationQueue, op.type, i);
          console.log(`minimized queue to ${minifiedBlocks.length} items`)
          try {
            await saveBlocksToServer(minifiedBlocks, op.storyID, op.chapterID);
            dbQueueRetryCount = 0;
          } catch (error: any) {
            if (isAPIError(error)) {
              if (error.retry) {
                console.error("server response " + error.statusCode + ", retrying...");
                const retryOp: DBOperation = {
                  type: DBOperationType.save,
                  blocks: minifiedBlocks,
                  storyID: op.storyID,
                  chapterID: op.chapterID,
                  time: new Date().getTime(),
                };
                dbQueueRetryCount++;
                retryArray.push(retryOp);
              }
            }
          }
          break;
        }
        case DBOperationType.delete: {
          const minifiedBlocks = filterAndReduceDBOperations(dbOperationQueue, op.type, i);
          try {
            await deleteBlocksFromServer(minifiedBlocks, op.storyID, op.chapterID);
            dbQueueRetryCount = 0;
          } catch (error: any) {
            if (isAPIError(error)) {
              if (error.retry) {
                console.error("server response " + error.statusCode + ", retrying...");
                const retryOp: DBOperation = {
                  type: DBOperationType.delete,
                  blocks: minifiedBlocks,
                  storyID: op.storyID,
                  chapterID: op.chapterID,
                  time: new Date().getTime(),
                };
                retryArray.push(retryOp);
                dbQueueRetryCount++;
              }
            }
          }
          break;
        }
        case DBOperationType.syncOrder: {
          try {
            if (op.orderList) {
              await syncBlockOrderMap(op.orderList);
              dbOperationQueue.splice(i, 1);
              dbQueueRetryCount = 0;
            }
          } catch (error: any) {
            if (error as APIError) {
              if (error.retry) {
                console.error("server response " + error.statusCode + ", retrying...");
                retryArray.push(dbOperationQueue[i]);
                dbQueueRetryCount++;
              }
              dbOperationQueue.splice(i, 1);
            }
          }
          break;
        }
      }
    }
  };

  const getCustomParagraphIndexByKey = (customKey: string): number | null => {
    let result: number | null = null;

    editorRef.current.getEditorState().read(() => {
      const root = $getRoot();
      const children = root.getChildren();

      for (let index = 0; index < children.length; index++) {
        const node = children[index];
        if (node.getType() === "customParagraph" && (node as CustomParagraphNode).getCustomKey() === customKey) {
          result = index;
          break; // Exit the loop once the node is found
        }
      }
    });

    return result;
  };

  const getCustomParagraphIndexes = () => {
    const indexes: number[] = [];
    editorRef.current.getEditorState().read(() => {
      const root = $getRoot();
      const children = root.getChildren();

      children.forEach((node, index) => {
        if (node.getType() === "customParagraph") {
          indexes.push(index);
        }
      });
    });
    return indexes;
  };

  // Process database queue periodically
  useEffect(() => {
    const processInterval = setInterval(() => {
      processDBQueue();
    }, 5000);
    window.addEventListener("unload", () => {
      // Final queue processing...
    });

    return () => {
      clearInterval(processInterval);
      window.removeEventListener("unload", () => { });
    };
  }, [storyID]);

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
          placeholder={<div className={styles.placeholder}>Enter text...</div>}
          ErrorBoundary={({ children }) => <>{children}</>}
        />
        <HistoryPlugin />
      </LexicalComposer>
    </div>
  );
};