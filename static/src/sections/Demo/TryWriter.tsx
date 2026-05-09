import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import LexicalErrorBoundary from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import {
  $createRangeSelection,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  type EditorState,
  type LexicalEditor,
  type LexicalNode,
  type SerializedEditorState,
} from "lexical";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";

import {
  type Association,
  AssociationType,
  type SimplifiedAssociation,
} from "../../types/Associations";
import { AssociationsContext } from "../../contexts/associations";
import {
  CustomParagraphNode,
  type CustomSerializedParagraphNode,
} from "../../components/ThreadWriter/customNodes/CustomParagraphNode";
import { AssociationInlineNode } from "../../components/ThreadWriter/customNodes/AssociationInlineNode";
import { useAutotabOnEnter } from "../../components/ThreadWriter/hooks/useAutotabOnEnter";
import { useEditorStateUpdater } from "../../components/ThreadWriter/hooks/useEditorStateUpdater";
import { AssociationDecoratorPlugin } from "../../components/ThreadWriter/plugins/AssociationDecoratorPlugin";
import DocumentClickPlugin, {
  type ClickData,
} from "../../components/ThreadWriter/plugins/DocumentClickPlugin";
import { TextTransformPlugin } from "../../components/ThreadWriter/plugins/TextTransformPlugin";
import {
  ContextMenu,
  type ContextMenuProps,
} from "../../components/ThreadWriter/subcomponents/ContextMenu";
import { AssociationPanelDemo } from "../../components/demoComponents/AssociationPanelDemo";
import { ToolbarDemo } from "../../components/demoComponents/ThreadWriterToolbarDemo";
import { useEditorCommandsDemo } from "../../components/demoComponents/hooks/useEditorCommandsDemo";
import styles from "../../components/ThreadWriter/threadwriter.module.css";

import {
  DEMO_SIZE_LIMIT_BYTES,
  readDraft,
  writeDraft,
} from "./storage";
import type { DemoDraft } from "./types";

const theme = {
  "custom-paragraph": styles.customParagraph,
  text: {
    bold: styles.bold,
    italic: styles.italic,
    underline: styles.underline,
    strikethrough: styles.strikethrough,
  },
};

const defaultContextData: ContextMenuProps = {
  visible: false,
  name: "",
  x: 0,
  y: 0,
  items: [],
};

const blankParagraph = (): CustomSerializedParagraphNode => ({
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

const blankEditorState = (): SerializedEditorState => ({
  root: {
    children: [blankParagraph()],
    type: "root",
    version: 1,
    direction: "ltr",
    format: "",
    indent: 0,
  },
});

const PERSIST_DEBOUNCE_MS = 500;

const toSimplifiedAssociation = (
  source: { client_id: string; name: string; type: string; short_description: string },
): SimplifiedAssociation => ({
  association_id: source.client_id,
  association_name: source.name,
  association_type: source.type,
  short_description: source.short_description,
  portrait: "",
  aliases: "",
  case_sensitive: true,
});

const toDraftAssociation = (assoc: SimplifiedAssociation): DemoDraft["associations"][number] => ({
  client_id: assoc.association_id,
  name: assoc.association_name,
  type: (assoc.association_type as DemoDraft["associations"][number]["type"]) ?? "character",
  short_description: assoc.short_description ?? "",
  extended_description: "",
});

// Mirrors api/consts.go nonSubscriberMaxAssoc. The demo can't know whether
// the user will subscribe after signup, so we apply the conservative
// non-subscriber cap to avoid a 402 during conversion.
export const MAX_DEMO_ASSOCIATIONS = 10;

interface TryWriterProps {
  title: string;
  onTitleChange: (title: string) => void;
  onWarning: (message: string) => void;
  onSaveClick: () => void;
  onBackClick: () => void;
  reportSnapshot: (snapshot: DemoDraft) => void;
}

export const TryWriter = ({
  title,
  onTitleChange,
  onWarning,
  onSaveClick,
  onBackClick,
  reportSnapshot,
}: TryWriterProps) => {
  const initialDraft = useMemo(() => readDraft(), []);

  const initialEditorState = useMemo<SerializedEditorState>(() => {
    if (initialDraft?.lexical_state) {
      try {
        return JSON.parse(initialDraft.lexical_state) as SerializedEditorState;
      } catch {
        return blankEditorState();
      }
    }
    return blankEditorState();
  }, [initialDraft]);

  const initialAssociations = useMemo<SimplifiedAssociation[]>(
    () =>
      (initialDraft?.associations ?? []).map((a) =>
        toSimplifiedAssociation({
          client_id: a.client_id,
          name: a.name,
          type: a.type,
          short_description: a.short_description,
        }),
      ),
    [initialDraft],
  );

  const initialConfig = {
    namespace: "TryWriterEditor",
    theme,
    nodes: [CustomParagraphNode, AssociationInlineNode],
    onError: (error: Error) => {
      console.error("Lexical error:", error);
    },
  };

  const editorRef = useRef<LexicalEditor>(null);
  const isProgrammaticChange = useRef(false);
  const pastedParagraphKeys = useRef(new Set<string>());
  const isInitialLoad = useRef(true);
  const selectedAssociation = useRef<string | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sizeWarnedRef = useRef(false);

  const [storyBlocks] = useState<SerializedEditorState | null>(initialEditorState);
  const [contextMenuData, setContextMenuData] =
    useState<ContextMenuProps>(defaultContextData);
  const [isAssociationPanelOpen, setIsAssociationPanelOpen] = useState(false);
  const [associations, setAssociations] = useState<SimplifiedAssociation[]>(
    initialAssociations,
  );

  useEditorCommandsDemo(editorRef, pastedParagraphKeys);
  useEditorStateUpdater(editorRef, storyBlocks, isProgrammaticChange);
  useAutotabOnEnter(editorRef, true);

  const persistDraft = useCallback(
    (lexicalState: SerializedEditorState, currentAssociations: SimplifiedAssociation[]) => {
      const draft: DemoDraft = {
        version: 1,
        title,
        lexical_state: JSON.stringify(lexicalState),
        associations: currentAssociations.map(toDraftAssociation),
        updated_at: new Date().toISOString(),
      };
      const result = writeDraft(draft);
      if (!result.ok && result.reason === "size_limit" && !sizeWarnedRef.current) {
        sizeWarnedRef.current = true;
        onWarning(
          "Draft size limit reached. New keystrokes won't be saved locally — sign up to keep writing.",
        );
      }
      if (result.ok) {
        sizeWarnedRef.current = false;
      }
      reportSnapshot(draft);
    },
    [title, onWarning, reportSnapshot],
  );

  const handleEditorChange = useCallback(
    (editorState: EditorState) => {
      if (isInitialLoad.current) return;
      const json = editorState.toJSON();
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(() => {
        persistDraft(json, associations);
      }, PERSIST_DEBOUNCE_MS);
    },
    [associations, persistDraft],
  );

  useEffect(() => {
    if (isInitialLoad.current) return;
    if (!editorRef.current) return;
    const json = editorRef.current.getEditorState().toJSON();
    persistDraft(json, associations);
  }, [associations, persistDraft]);

  useEffect(() => {
    if (isInitialLoad.current) return;
    if (!editorRef.current) return;
    const json = editorRef.current.getEditorState().toJSON();
    persistDraft(json, associations);
  }, [title, associations, persistDraft]);

  useEffect(() => {
    isInitialLoad.current = false;
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
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
    navigator.clipboard.writeText(text).catch(() => {
      console.error("Failed to copy");
    });
    setContextMenuData(defaultContextData);
  };

  const handleMenuItemClick = (
    _event: React.MouseEvent,
    type: AssociationType,
  ) => {
    setContextMenuData(defaultContextData);
    const text = getSelectedText();
    if (!text.length) return;

    if (associations.length >= MAX_DEMO_ASSOCIATIONS) {
      onWarning(
        `You've reached the ${MAX_DEMO_ASSOCIATIONS}-element limit for the trial. Sign up to add more.`,
      );
      return;
    }

    const newAssociation: SimplifiedAssociation = {
      association_id: uuidv4(),
      association_name: text,
      association_type: type,
      short_description: "",
      portrait: "",
      aliases: "",
      case_sensitive: true,
    };
    setAssociations((prev) => [...prev, newAssociation]);
  };

  const handleDeleteAssociationClick = () => {
    setContextMenuData(defaultContextData);
    if (selectedAssociation.current?.length) {
      const idToDelete = selectedAssociation.current;
      selectedAssociation.current = null;
      setAssociations((prev) =>
        prev.filter((assoc) => assoc.association_id !== idToDelete),
      );
    }
  };

  const associationContextMenuItems = [
    { name: "Delete Association", command: handleDeleteAssociationClick },
  ];

  const selectedContextMenuItems = [
    { name: "Copy", command: handleTextCopy },
    {
      name: "Make Association",
      subItems: [
        {
          name: "Character",
          command: (event: React.MouseEvent) =>
            handleMenuItemClick(event, AssociationType.character),
        },
        {
          name: "Place",
          command: (event: React.MouseEvent) =>
            handleMenuItemClick(event, AssociationType.place),
        },
        {
          name: "Event",
          command: (event: React.MouseEvent) =>
            handleMenuItemClick(event, AssociationType.event),
        },
        {
          name: "Item",
          command: (event: React.MouseEvent) =>
            handleMenuItemClick(event, AssociationType.item),
        },
      ],
    },
  ];

  const onAssociationEditCallback = useCallback(
    (assoc: Association) => {
      setAssociations((prev) =>
        prev.map((stored) =>
          stored.association_id === assoc.association_id
            ? { ...stored, ...assoc }
            : stored,
        ),
      );
    },
    [],
  );

  const handleDocumentLeftClick = (event: MouseEvent | TouchEvent) => {
    setContextMenuData(defaultContextData);
    if (!editorRef.current) return;

    editorRef.current.focus();

    setTimeout(() => {
      editorRef.current?.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) return;

        let clientX: number, clientY: number;
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
    const containerRect = rootElement
      .closest(`.${styles.editorArea}`)
      ?.getBoundingClientRect();
    const xInContainer = containerRect ? data.x - containerRect.left : data.x;
    const yInContainer = containerRect ? data.y - containerRect.top : data.y;
    setContextMenuData({
      name: data.text || "",
      visible: true,
      y: yInContainer,
      x: xInContainer,
      items: selectedContextMenuItems,
    });
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
    const containerRect = rootElement
      .closest(`.${styles.editorArea}`)
      ?.getBoundingClientRect();
    const xInContainer = containerRect ? data.x - containerRect.left : data.x;
    const yInContainer = containerRect ? data.y - containerRect.top : data.y;
    setContextMenuData({
      name: data.text || "",
      visible: true,
      y: yInContainer,
      x: xInContainer,
      items: associationContextMenuItems,
    });
  };

  const associationsContextValue = useMemo(
    () => ({ associations, setAssociations }),
    [associations],
  );

  return (
    <AssociationsContext.Provider value={associationsContextValue}>
      <div className={styles.outerWrapper}>
        <div style={{ padding: "8px 20px" }}>
          <input
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Untitled story"
            aria-label="Story title"
            style={{
              width: "100%",
              fontSize: "1.4rem",
              fontWeight: 600,
              border: "none",
              background: "transparent",
              outline: "none",
              color: "var(--text-primary)",
            }}
            maxLength={200}
          />
        </div>
        <LexicalComposer
          initialConfig={{
            ...initialConfig,
            editorState: (editor) => {
              editorRef.current = editor;
            },
          }}
        >
          <ToolbarDemo onSaveClick={onSaveClick} onBackClick={onBackClick} />
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
              <OnChangePlugin onChange={handleEditorChange} ignoreSelectionChange />
              <AssociationDecoratorPlugin
                isProgrammaticChange={isProgrammaticChange}
                customLeftClick={handleAssociationLeftClick}
                customRightClick={handleAssociationRightClick}
              />
              <HistoryPlugin />
              <TextTransformPlugin isProgrammaticChange={isProgrammaticChange} />
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

export const DEMO_BYTES_LIMIT = DEMO_SIZE_LIMIT_BYTES;
