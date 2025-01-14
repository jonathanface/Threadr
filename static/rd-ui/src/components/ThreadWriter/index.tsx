import { useEffect, useRef, useState } from 'react';
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { $isRangeSelection, ParagraphNode, SerializedEditorState } from 'lexical';
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
import { CustomParagraphNode, CustomSerializedParagraphNode } from './CustomParagraphNode';
import { BlockOrderMap } from '../../types/Document';

const theme = {
  paragraph: styles.paragraph,
  text: {
    bold: styles.bold,
    italic: styles.italic,
    underline: styles.underline,
    strikethrough: styles.strikethrough,
  },
};

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
    throw new Error('Node is not an instance of CustomParagraphNode');
  }

  const json = node.exportJSON() as CustomSerializedParagraphNode;
  json.children = node.getChildren().map((child) => {
    return $isElementNode(child)
      ? serializeWithChildren(child as ElementNode)
      : child.exportJSON();
  });
  return json;
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
      CustomParagraphNode
    ],
    onError: (error: Error) => {
      console.error('Lexical error:', error);
    },
  };

  const editorRef = useRef<any>(null);
  const [storyBlocks, setStoryBlocks] = useState<SerializedEditorState | null>(null);
  const { setIsLoaderVisible } = useLoader();
  const previousNodeKeysRef = useRef<Set<string>>(new Set());

  const getBatchedStoryBlocks = async (startKey: string) => {
    try {
      setIsLoaderVisible(true);
      const response = await fetch(`/api/stories/${storyID}/content?key=${startKey}&chapter=${chapter.id}`);
      if (!response.ok) throw new Error(response.statusText);
      if (response.status === 204) return;

      const data = await response.json();
      const remappedStoryBlocks = data.items.map((item: { chunk: any; key_id: any }) => {
        const fixed: CustomSerializedParagraphNode = item.chunk.Value
          ? JSON.parse(item.chunk.Value)
          : generateBlankLine();
        fixed.key_id = item.key_id.Value;

        if (fixed.type !== CustomParagraphNode.getType()) {
          fixed.type = CustomParagraphNode.getType();
        }
        return fixed;
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
    getBatchedStoryBlocks("");
  }, []);

  useEffect(() => {
    if (editorRef.current && storyBlocks) {
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
    }
  }, [storyBlocks]);

  useEffect(() => {
    if (editorRef.current) {
      // Transform default ParagraphNode to CustomParagraphNode
      editorRef.current.registerNodeTransform(ParagraphNode, (node: { getChildren: () => any; replace: (arg0: CustomParagraphNode) => void; getKey: () => any; }) => {
        if (!(node instanceof CustomParagraphNode)) {
          const replacement = new CustomParagraphNode(uuidv4());
          replacement.append(...node.getChildren());
          node.replace(replacement);
          console.log(`Replaced ParagraphNode ${node.getKey()} with CustomParagraphNode`);
        }
      });

      // Handle empty CustomParagraphNodes
      editorRef.current.registerNodeTransform(CustomParagraphNode, (node: { getTextContent: () => string; getKey: () => any; }) => {
        if (node.getTextContent().trim() === "") {
          // Prevent redundant replacement of already empty nodes

          editorRef.current.update(() => {
            const index = getParagraphIndexByKey(editorRef.current, node.getKey());
            if (index !== null) {
              const ascp = node as CustomParagraphNode;
              const id = ascp.getKeyId()
              console.log(`Empty CustomParagraphNode detected: ${id}`);
              if (id) {
                queueParagraphForSave(id, index.toString(), serializeWithChildren(ascp));
              }
            }
          });

        }
      });
    }
  }, []);


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
    const processInterval = setInterval(() => {
      ProcessDBQueue();
    }, 5000);
    window.addEventListener("unload", () => {
      // Final queue processing...
    });

    return () => {
      clearInterval(processInterval);
      window.removeEventListener("unload", () => { });
    };
  }, [storyID]);

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

  const queueParagraphForSave = (customKey: string, order: string, content: any) => {
    const saveBlock: DBOperationBlock = { key_id: customKey, chunk: content, place: order };
    const op: DBOperation = {
      type: DBOperationType.save,
      storyID,
      chapterID: chapter.id,
      blocks: [saveBlock],
      time: Date.now(),
    };
    DbOperationQueue.push(op);
  };

  const onChangeHandler = (editorState: EditorState): void => {
    const currentNodeKeys = new Set<string>();
    let orderResyncRequired = false;
    editorState.read(() => {
      const root = $getRoot();
      const children = root.getChildren();
      children.forEach((node) => {
        if (node instanceof CustomParagraphNode) {
          const id = node.getKeyId();
          if (id) {
            currentNodeKeys.add(id);
          }
        }
      });
      const previousNodeKeys = previousNodeKeysRef.current;
      const deletedKeys = Array.from(previousNodeKeys).filter(
        (key) => !currentNodeKeys.has(key)
      );
      deletedKeys.forEach((key) => {
        queueParagraphForDeletion(key);
        orderResyncRequired = true;
      });

      // Update the reference with current keys
      previousNodeKeysRef.current = currentNodeKeys;

      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        const selectedNode = selection.anchor.getNode();
        const parentParagraph = selectedNode.getParent();

        if (parentParagraph instanceof CustomParagraphNode) {
          const textContent = parentParagraph.getTextContent().trim();
          const index = getParagraphIndexByKey(editorState, parentParagraph.getKey());
          if (index !== null && textContent.length) {
            const paragraphWithChildren = serializeWithChildren(parentParagraph);
            queueParagraphForSave(paragraphWithChildren.key_id, index.toString(), paragraphWithChildren);
            const children = root.getChildren<ElementNode>();
            const isAtEnd = index === children.length - 1;
            if (!isAtEnd) {
              orderResyncRequired = true;
            }

          }
        }
      }
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
        <OnChangePlugin onChange={onChangeHandler} />
        <HistoryPlugin />
      </LexicalComposer>
    </div>
  );
};
