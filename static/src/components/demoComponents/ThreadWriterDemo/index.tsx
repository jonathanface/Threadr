import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import LexicalErrorBoundary from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import {
  $createRangeSelection,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  LexicalEditor,
  LexicalNode,
  SerializedEditorState,
} from "lexical";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  Association,
  AssociationType,
  SimplifiedAssociation,
} from "../../../types/Associations";
import {
  CustomParagraphNode,
  CustomSerializedParagraphNode,
} from "../../ThreadWriter/customNodes/CustomParagraphNode";
import { useEditorStateUpdater } from "../../ThreadWriter/hooks/useEditorStateUpdater";
import { AssociationDecoratorPlugin } from "../../ThreadWriter/plugins/AssociationDecoratorPlugin";
import styles from "../../ThreadWriter/threadwriter.module.css";
import { AssociationPanelDemo } from "../AssociationPanelDemo";
import { ToolbarDemo } from "../ThreadWriterToolbarDemo";

import { AssociationsContext } from "../../../contexts/associations";
import {
  $isAssociationInlineNode,
  AssociationInlineNode,
} from "../../ThreadWriter/customNodes/AssociationInlineNode";
import DocumentClickPlugin, {
  ClickData,
} from "../../ThreadWriter/plugins/DocumentClickPlugin";
import { TextTransformPlugin } from "../../ThreadWriter/plugins/TextTransformPlugin";
import {
  ContextMenu,
  ContextMenuProps,
} from "../../ThreadWriter/subcomponents/ContextMenu";
import { useEditorCommandsDemo } from "../hooks/useEditorCommandsDemo";

const theme = {
  "custom-paragraph": styles.customParagraph,
  text: {
    bold: styles.bold,
    italic: styles.italic,
    underline: styles.underline,
    strikethrough: styles.strikethrough,
  },
};

export const ThreadWriterDemo = () => {
  const initialConfig = {
    namespace: "ThreadWriterEditor",
    theme,
    nodes: [CustomParagraphNode, AssociationInlineNode],
    onError: (error: Error) => {
      console.error("Lexical error:", error);
    },
  };

  // refs
  const editorRef = useRef<LexicalEditor>(null);
  const isProgrammaticChange = useRef(false);
  const previousNodeKeysRef = useRef<Set<string>>(new Set());
  const pastedParagraphKeys = useRef(new Set<string>());
  const isInitialLoad = useRef(true);
  const selectedAssociation = useRef<string | null>(null);

  // states
  const [storyBlocks, setStoryBlocks] = useState<SerializedEditorState | null>(
    null,
  );
  const defaultContextData: ContextMenuProps = {
    visible: false,
    name: "",
    x: 0,
    y: 0,
    items: [],
  };
  const [contextMenuData, setContextMenuData] =
    useState<ContextMenuProps>(defaultContextData);
  const [isAssociationPanelOpen, setIsAssociationPanelOpen] = useState(false);
  const [associations, setAssociations] = useState<SimplifiedAssociation[]>([]);
  const [chapterName, setChapterName] = useState("");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  useEditorCommandsDemo(editorRef, pastedParagraphKeys);

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

  const getBatchedStoryBlocks = useCallback(async () => {
    try {
      const response = await fetch("/demo-data/dracula/body.json");
      const data = await response.json();

      if (data.associations) {
        setAssociations(data.associations as SimplifiedAssociation[]);
      }
      if (data.chapter_name) {
        setChapterName(data.chapter_name);
      }
      if (data.title) {
        setTitle(data.title);
      }
      if (data.author) {
        setAuthor(data.author);
      }

      const remappedStoryBlocks: CustomSerializedParagraphNode[] =
        data.items?.map(
          (item: { chunk: { Value: string }; key_id: { Value: string } }) => {
            const key = item.key_id?.Value || "";
            previousNodeKeysRef.current.add(key);

            const fixed: CustomSerializedParagraphNode = item.chunk?.Value
              ? JSON.parse(item.chunk.Value)
              : generateBlankLine();

            fixed.key_id = key;

            if (fixed.type !== CustomParagraphNode.getType()) {
              fixed.type = CustomParagraphNode.getType();
            }
            return fixed;
          },
        ) ?? [];

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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getSelectedText = () => {
    let selectedText = "";
    editorRef.current?.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        selectedText = selection.getTextContent();
      }
    });
    return selectedText;
  };

  const handleTextCopy = () => {
    const text = getSelectedText();
    navigator.clipboard.writeText(text).then(
      () => {},
      () => {
        console.error("Failed to copy");
      },
    );
    setContextMenuData(defaultContextData);
  };

  const handleMenuItemClick = async (
    _event: React.MouseEvent,
    type: AssociationType,
  ) => {
    setContextMenuData(defaultContextData);
    const text = getSelectedText();
    if (text.length) {
      const newAssociation: SimplifiedAssociation = {
        association_id: uuidv4(),
        association_name: text,
        association_type: type,
        short_description: "",
        portrait: "",
        aliases: "",
        case_sensitive: true,
      };
      setAssociations([...associations, newAssociation]);
    }
  };

  const handleDeleteAssociationClick = async () => {
    setContextMenuData(defaultContextData);
    if (selectedAssociation.current?.length && associations) {
      const ind = associations.findIndex((assoc) => {
        return assoc.association_id === selectedAssociation.current;
      });
      selectedAssociation.current = "";
      const newAssociations = [...associations];
      newAssociations.splice(ind, 1);
      setAssociations(newAssociations);
    }
  };

  const associationContextMenuItems = [
    {
      name: "Delete Association",
      command: handleDeleteAssociationClick,
    },
  ];

  const selectedContextMenuItems = [
    { name: "Copy", command: handleTextCopy },
    {
      name: "Make Association",
      subItems: [
        {
          name: "Character",
          command: (event: React.MouseEvent) => {
            handleMenuItemClick(event, AssociationType.character);
          },
        },
        {
          name: "Place",
          command: (event: React.MouseEvent) => {
            handleMenuItemClick(event, AssociationType.place);
          },
        },
        {
          name: "Event",
          command: (event: React.MouseEvent) => {
            handleMenuItemClick(event, AssociationType.event);
          },
        },
        {
          name: "Item",
          command: (event: React.MouseEvent) => {
            handleMenuItemClick(event, AssociationType.item);
          },
        },
      ],
    },
  ];

  useEditorStateUpdater(editorRef, storyBlocks, isProgrammaticChange);

  // Mobile cursor adjustment
  useEffect(() => {
    if (!editorRef.current) return;

    const handleTouchEnd = (event: TouchEvent) => {
      const editor: LexicalEditor | null = editorRef.current;
      if (!editor) return;

      const touch = event.changedTouches[0];
      const target = document.elementFromPoint(touch.clientX, touch.clientY);
      if (!target || !editor.getRootElement()?.contains(target)) return;

      editor.update(() => {
        const root = $getRoot();

        let closestTextNode: LexicalNode | null = null;
        let charOffset = 0;

        const textNodes: LexicalNode[] = [];
        const traverseNodes = (node: LexicalNode) => {
          if ($isTextNode(node) || $isAssociationInlineNode(node)) {
            textNodes.push(node);
          } else if ($isElementNode(node)) {
            node.getChildren().forEach(traverseNodes);
          }
        };
        root.getChildren().forEach(traverseNodes);

        let range: Range | null = null;
        const doc = document as unknown as {
          caretPositionFromPoint?: (
            x: number,
            y: number,
          ) => { offsetNode: Node; offset: number } | null;
          caretRangeFromPoint?: (x: number, y: number) => Range | null;
        } & Document;

        if (doc.caretPositionFromPoint) {
          const caretPos = doc.caretPositionFromPoint(
            touch.clientX,
            touch.clientY,
          );
          if (caretPos) {
            range = document.createRange();
            range.setStart(caretPos.offsetNode, caretPos.offset);
            range.setEnd(caretPos.offsetNode, caretPos.offset);
            charOffset = caretPos.offset;
          }
        } else if (doc.caretRangeFromPoint) {
          range = doc.caretRangeFromPoint(touch.clientX, touch.clientY);
          if (range) {
            charOffset = range.startOffset;
          }
        }

        if (range) {
          for (const node of textNodes) {
            const domNode = editor.getElementByKey(node.getKey());
            if (domNode && domNode.contains(range.startContainer)) {
              closestTextNode = node;
              break;
            }
          }
        }
        if (closestTextNode && $isTextNode(closestTextNode)) {
          const newSelection = $createRangeSelection();
          newSelection.anchor.set(closestTextNode.getKey(), charOffset, "text");
          newSelection.focus.set(closestTextNode.getKey(), charOffset, "text");
          $setSelection(newSelection);
        }
      });
    };

    document.addEventListener("touchend", handleTouchEnd);
    return () => document.removeEventListener("touchend", handleTouchEnd);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      if (isInitialLoad.current && editorRef.current) {
        isInitialLoad.current = false;

        isProgrammaticChange.current = true;
        await getBatchedStoryBlocks();
        isProgrammaticChange.current = false;
        const container = document.querySelector(
          `.${styles.outerWrapper}`,
        )?.parentElement;
        if (container) {
          setTimeout(() => (container.scrollTop = 0), 250);
        }
      }
    };

    fetchData();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getBatchedStoryBlocks, editorRef.current]);

  const onAssociationEditCallback = useCallback(
    async (assoc: Association) => {
      setAssociations((prevAssociations: SimplifiedAssociation[] = []) =>
        prevAssociations.map((storedAssociation) =>
          storedAssociation.association_id === assoc.association_id
            ? { ...storedAssociation, ...assoc }
            : storedAssociation,
        ),
      );
    },
    [setAssociations],
  );

  const handleDocumentLeftClick = (event: MouseEvent | TouchEvent) => {
    setContextMenuData(defaultContextData);
    if (!editorRef.current) return;

    editorRef.current.focus();

    setTimeout(() => {
      editorRef.current?.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          return;
        }

        let clientX, clientY;
        if (event instanceof MouseEvent) {
          clientX = event.clientX;
          clientY = event.clientY;
        } else {
          clientX = event.touches[0].clientX;
          clientY = event.touches[0].clientY;
        }

        const root = $getRoot();
        let closestTextNode: LexicalNode | null = null;
        let charOffset = 0;

        const textNodes: LexicalNode[] = [];
        const traverseNodes = (node: LexicalNode) => {
          if ($isTextNode(node)) {
            textNodes.push(node);
          } else if ($isElementNode(node)) {
            node.getChildren().forEach(traverseNodes);
          }
        };
        root.getChildren().forEach(traverseNodes);

        let range: Range | null = null;
        const doc = document as unknown as {
          caretPositionFromPoint?: (
            x: number,
            y: number,
          ) => { offsetNode: Node; offset: number } | null;
          caretRangeFromPoint?: (x: number, y: number) => Range | null;
        } & Document;

        if (doc.caretPositionFromPoint) {
          const caretPos = doc.caretPositionFromPoint(clientX, clientY);
          if (caretPos) {
            range = document.createRange();
            range.setStart(caretPos.offsetNode, caretPos.offset);
            range.setEnd(caretPos.offsetNode, caretPos.offset);
            charOffset = caretPos.offset;
          }
        } else if (doc.caretRangeFromPoint) {
          range = doc.caretRangeFromPoint(clientX, clientY);
          if (range) {
            charOffset = range.startOffset;
          }
        }

        if (range) {
          for (const node of textNodes) {
            const domNode = editorRef.current?.getElementByKey(node.getKey());
            if (domNode && domNode.contains(range.startContainer)) {
              closestTextNode = node;
              break;
            }
          }
        }
        if (closestTextNode && $isTextNode(closestTextNode)) {
          const newSelection = $createRangeSelection();
          newSelection.anchor.set(closestTextNode.getKey(), charOffset, "text");
          newSelection.focus.set(closestTextNode.getKey(), charOffset, "text");
          $setSelection(newSelection);
        }
      });
    }, 0);
  };

  const handleDocumentRightClick = (data: ClickData) => {
    const rootElement = editorRef.current?.getRootElement();
    if (!rootElement) return;
    const containerRect = rootElement.closest(`.${styles.editorArea}`)?.getBoundingClientRect();
    const xInContainer = containerRect ? data.x - containerRect.left : data.x;
    const yInContainer = containerRect ? data.y - containerRect.top : data.y;
    const contextData: ContextMenuProps = {
      name: data.text ? data.text : "",
      visible: true,
      y: yInContainer,
      x: xInContainer,
      items: selectedContextMenuItems,
    };
    setContextMenuData(contextData);
  };

  const handleAssociationLeftClick = (data: ClickData) => {
    if (!data.id) return;
    selectedAssociation.current = data.id;
    setIsAssociationPanelOpen(true);
  };

  const handleAssociationRightClick = (data: ClickData) => {
    if (!data.id) return;
    const rootElement = editorRef.current?.getRootElement();
    if (!rootElement) return;
    selectedAssociation.current = data.id;
    const containerRect = rootElement.closest(`.${styles.editorArea}`)?.getBoundingClientRect();
    const xInContainer = containerRect ? data.x - containerRect.left : data.x;
    const yInContainer = containerRect ? data.y - containerRect.top : data.y;
    const contextData: ContextMenuProps = {
      name: data.text ? data.text : "",
      visible: true,
      y: yInContainer,
      x: xInContainer,
      items: associationContextMenuItems,
    };
    setContextMenuData(contextData);
  };

  const associationsContextValue = useMemo(
    () => ({ associations, setAssociations }),
    [associations],
  );

  return (
    <AssociationsContext.Provider value={associationsContextValue}>
      <div className={styles.outerWrapper}>
        {title && author && (
          <p
            style={{
              margin: "0",
              padding: "8px 20px",
              fontSize: "0.85rem",
              color: "var(--text-secondary)",
            }}
          >
            Demo text from <b><i>{title}</i></b> by <b>{author}</b>
          </p>
        )}
        <LexicalComposer
          initialConfig={{
            ...initialConfig,
            editorState: (editor) => {
              editorRef.current = editor;
            },
          }}
        >
          <ToolbarDemo chapterName={chapterName} />
          <div className={styles.editorRow}>
            <div className={styles.editorArea}>
              <RichTextPlugin
                contentEditable={
                  <ContentEditable
                    tabIndex={0}
                    className={styles.editorInput}
                    spellCheck={true}
                  />
                }
                ErrorBoundary={LexicalErrorBoundary}
              />
              <AssociationDecoratorPlugin
                isProgrammaticChange={isProgrammaticChange}
                customLeftClick={handleAssociationLeftClick}
                customRightClick={handleAssociationRightClick}
              />
              <HistoryPlugin />
              <TextTransformPlugin
                isProgrammaticChange={isProgrammaticChange}
              />
              <DocumentClickPlugin
                onLeftClick={handleDocumentLeftClick}
                onRightClick={handleDocumentRightClick}
              />
              <AssociationPanelDemo
                associations={associations}
                onEditCallback={onAssociationEditCallback}
                isAssociationPanelOpen={isAssociationPanelOpen}
                setIsAssociationPanelOpen={setIsAssociationPanelOpen}
                selectedAssociationID={selectedAssociation.current}
              />
              <ContextMenu
                name={contextMenuData.name}
                visible={contextMenuData.visible}
                x={contextMenuData.x}
                y={contextMenuData.y}
                items={contextMenuData.items}
              />
            </div>
          </div>
        </LexicalComposer>
      </div>
    </AssociationsContext.Provider>
  );
};
