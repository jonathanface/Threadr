import { $generateHtmlFromNodes } from "@lexical/html";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import LexicalErrorBoundary from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import axios from "axios";
import {
  $createPoint,
  $createRangeSelection,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  CLEAR_HISTORY_COMMAND,
  type EditorState,
  type LexicalEditor,
  type LexicalNode,
  ParagraphNode,
  type SerializedEditorState,
  type SerializedElementNode,
  type SerializedLexicalNode,
  TextNode,
} from "lexical";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { api } from "../../api";
import { generateTextHash } from "../../constants/constants";
import { UserContext } from "../../contexts/user";
import { useLoader } from "../../hooks/useLoader";
import { useSelections } from "../../hooks/useSelections";
import { useToaster } from "../../hooks/useToaster";
import {
  AlertCommandType,
  type AlertFunctionCall,
  AlertToastType,
} from "../../types/AlertToasts";
import {
  type Association,
  AssociationType,
  type SimplifiedAssociation,
} from "../../types/Associations";
import {
  type DBOperationBlock,
  DBOperationType,
} from "../../types/DBOperations";
import type { BlockOrderMap } from "../../types/Document";
import {
  dbEventEmitter,
  type SaveSuccessPayload,
} from "../../utils/EventEmitter";
import {
  getParagraphIndexByKey,
  serializeWithChildren,
} from "../../utils/helpers";
import { logger } from "../../utils/logger";
import {
  $isAssociationInlineNode,
  AssociationInlineNode,
} from "./customNodes/AssociationInlineNode";
import { CustomParagraphNode } from "./customNodes/CustomParagraphNode";
import { useAssociations } from "./hooks/useAssociations";
import { useAutotabOnEnter } from "./hooks/useAutotabOnEnter";
import { useCursorMemory } from "./hooks/useCursorMemory";
import { useDocumentSettings } from "./hooks/useDocumentSettings";
import { useEditorCommands } from "./hooks/useEditorCommands";
import { useEditorStateUpdater } from "./hooks/useEditorStateUpdater";
import { useFetchStoryBlocks } from "./hooks/useFetchStoryBlocks";
import { useMobileCursorAdjustment } from "./hooks/useMobileCursorAdjustment";
import { useSaveErrorAlert } from "../../hooks/useSaveErrorAlert";
import { AssociationDecoratorPlugin } from "./plugins/AssociationDecoratorPlugin";
import DocumentClickPlugin, {
  type ClickData,
} from "./plugins/DocumentClickPlugin";
import { TextTransformPlugin } from "./plugins/TextTransformPlugin";
import { ProcessDBQueue, QueueOp, QueueSyncOrder } from "./queue";
import { AssociationPanel } from "./subcomponents/AssociationPanel";
import {
  ContextMenu,
  type ContextMenuProps,
} from "./subcomponents/ContextMenu";
import { DocumentMenu } from "./subcomponents/DocumentMenu";
import { Toolbar } from "./subcomponents/ThreadWriterToolbar";
import styles from "./threadwriter.module.css";

const theme = {
  "custom-paragraph": styles.customParagraph,
  text: {
    bold: styles.bold,
    italic: styles.italic,
    underline: styles.underline,
    strikethrough: styles.strikethrough,
  },
};

export const ThreadWriter = () => {
  const initialConfig = {
    namespace: "ThreadWriterEditor",
    theme,
    nodes: [CustomParagraphNode, AssociationInlineNode],
    onError: (error: Error) => {
      logger.error("Lexical error:", error);
    },
  };

  const defaultContextData: ContextMenuProps = {
    visible: false,
    name: "",
    x: 0,
    y: 0,
    items: [],
  };

  // refs
  const editorRef = useRef<LexicalEditor>(null);
  const isProgrammaticChange = useRef(false);
  const previousNodeKeysRef = useRef<
    Map<string, { text: string; place: string; format: number }>
  >(new Map());
  const previousTextHashRef = useRef<string | null>(null);
  const pastedParagraphKeys = useRef(new Set<string>());
  const isInitialLoad = useRef(true);
  const selectedAssociation = useRef<string | null>(null);
  const isQueuePausedRef = useRef(false);

  // states
  const [storyBlocks, setStoryBlocks] = useState<SerializedEditorState | null>(
    null
  );
  const [contextMenuData, setContextMenuData] =
    useState<ContextMenuProps>(defaultContextData);
  const [isAssociationPanelOpen, setIsAssociationPanelOpen] = useState(false);

  const resetContextMenu = () => setContextMenuData({ ...defaultContextData });

  // hooks
  const { setAlertState } = useToaster();
  useSaveErrorAlert(); // Admin-only alerts for save failures
  const userContext = useContext(UserContext);
  const isAdmin = userContext?.userDetails?.admin ?? false;
  const { story, chapter } = useSelections();
  const { showLoader, hideLoader } = useLoader();
  const { documentSettings } = useDocumentSettings();
  const { associations, setAssociations } = useAssociations();
  useAutotabOnEnter(editorRef, !!documentSettings?.autotab);
  useEditorStateUpdater(editorRef, storyBlocks, isProgrammaticChange);
  useMobileCursorAdjustment(editorRef);
  useEditorCommands(editorRef, pastedParagraphKeys);

  useCursorMemory(
    editorRef,
    story?.story_id,
    chapter?.id,
    !!storyBlocks // Restore cursor after content loads
  );

  // Fetchers
  const { getBatchedStoryBlocks, previousTableStatus, tableStatus } =
    useFetchStoryBlocks(
      story?.story_id || "",
      chapter?.id || "",
      setStoryBlocks,
      previousNodeKeysRef
    );

  const getSelectedText = () => {
    let selectedText = "";
    // Update the editor state to read the current selection.
    editorRef.current?.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        // getTextContent() returns the selected text.
        selectedText = selection.getTextContent();
      }
    });
    return selectedText;
  };

  const handleTextCopy = () => {
    if (!editorRef.current) {
      resetContextMenu();
      return;
    }

    // Use update() instead of read() because $generateHtmlFromNodes clones nodes internally
    editorRef.current.update(
      () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return;
        }

        const plainText = selection.getTextContent();
        const htmlContent = $generateHtmlFromNodes(editorRef.current!, selection);

        // Copy both plain text and HTML to preserve formatting when pasting into rich text editors
        const clipboardItem = new ClipboardItem({
          "text/plain": new Blob([plainText], { type: "text/plain" }),
          "text/html": new Blob([htmlContent], { type: "text/html" }),
        });

        navigator.clipboard.write([clipboardItem]).catch(() => {
          logger.error("Failed to copy");
        });
      },
      { discrete: true }
    );

    resetContextMenu();
  };

  const saveAssociationsToServer = async (
    associations: SimplifiedAssociation[]
  ) => {
    if (!story?.story_id) return;
    try {
      showLoader();

      const { data } = await api.post(
        `/stories/${story.story_id}/associations`,
        associations,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      return data;
    } catch (error) {
      logger.error("Error saving associations:", error);
      if (axios.isAxiosError(error) && error.response?.status === 402) {
        const subscribeFunc: AlertFunctionCall = {
          type: AlertCommandType.subscribe,
          text: "subscribe",
        };
        setAlertState({
          title: "Insufficient subscription",
          message: "Free accounts are limited to 10 associations per story.",
          open: true,
          severity: AlertToastType.warning,
          timeout: null,
          callback: subscribeFunc,
        });
      } else {
        setAlertState({
          title: "Error saving association",
          message:
            "There was an error saving your association. Please try again later.",
          severity: AlertToastType.error,
          open: true,
        });
      }
    } finally {
      hideLoader();
    }
  };

  const handleMenuItemClick = async (
    _event: React.MouseEvent,
    type: AssociationType
  ) => {
    resetContextMenu();
    const text = getSelectedText();
    if (text.length) {
      // check if !contains
      const newAssociation: SimplifiedAssociation = {
        association_name: text,
        association_type: type,
        association_id: "",
        short_description: "",
        portrait: "",
        aliases: "",
        case_sensitive: true,
      };
      const storedAssociation = await saveAssociationsToServer([
        newAssociation,
      ]);
      if (storedAssociation) {
        newAssociation.portrait = storedAssociation[0].portrait;
        newAssociation.association_id = storedAssociation[0].association_id;
        if (associations) {
          setAssociations([...associations, newAssociation]);
        } else {
          setAssociations([newAssociation]);
        }
      }
    }
  };

  const deleteAssociationsFromServer = async (
    associations: SimplifiedAssociation[]
  ) => {
    if (!story) return;
    try {
      showLoader();

      await api.delete(`/stories/${story.story_id}/associations`, {
        headers: { "Content-Type": "application/json" },
        data: associations,
      });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        logger.error(
          `Error deleting association: ${error.response?.status} ${error.response?.statusText}`
        );
      } else {
        logger.error("Unexpected error deleting association:", error);
      }
    } finally {
      hideLoader();
    }
  };

  const handleDeleteAssociationClick = async () => {
    resetContextMenu();
    if (selectedAssociation.current?.length && associations) {
      const ind = associations.findIndex((assoc) => {
        return assoc.association_id === selectedAssociation.current;
      });
      selectedAssociation.current = "";
      const deleteMe = associations[ind];
      const newAssociations = [...associations];
      newAssociations.splice(ind, 1);
      setAssociations(newAssociations);
      await deleteAssociationsFromServer([deleteMe]);
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
      name: "Create Association",
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

  // queue operations
  const runQueue = useCallback(async () => {
    try {
      await ProcessDBQueue();
    } catch (error) {
      logger.error("Error from DB queue:", (error as Error).message);
      setAlertState({
        title: "Unable to sync",
        message:
          "We are experiencing difficulty contacting the server. We'll keep attempting to save your work as long as you leave this window open, however we suggest you save a local copy of your current work.",
        severity: AlertToastType.error,
        open: true,
        timeout: null,
      });
    }
  }, [setAlertState]);

  const queueParagraphOrderResync = useCallback(() => {
    if (!story || !chapter || !editorRef.current) return;
    logger.log("Queueing paragraph order resync");
    editorRef.current.read(() => {
      const root = $getRoot();
      const paragraphs = root
        .getChildren()
        .filter((node) => node.getType() === "custom-paragraph");
      const orderMap: BlockOrderMap = {
        chapter_id: chapter.id,
        blocks: [],
      };
      paragraphs.forEach((paragraph) => {
        const index = getParagraphIndexByKey(
          editorRef.current,
          paragraph.getKey()
        );
        if (index !== null) {
          const asCP = paragraph as CustomParagraphNode;
          const customKey = asCP.getKeyId();
          if (customKey) {
            orderMap.blocks.push({
              key_id: customKey,
              place: index.toString(),
            });
          }
        }
      });
      QueueSyncOrder({
        type: DBOperationType.syncOrder,
        orderList: orderMap,
        blocks: [],
        time: Date.now(),
        storyID: story.story_id,
        chapterID: chapter.id,
        tableBecameReady: false,
      });
    });
  }, [chapter, story]);

  const writeEpochRef = useRef(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: We intentionally only depend on story?.story_id and chapter?.id to avoid re-running when story/chapter properties change. This should only run when switching stories/chapters.
  useEffect(() => {
    if (!chapter) {
      // Clear storyBlocks when chapter becomes undefined (navigating away)
      setStoryBlocks(null);
      return;
    }
    isQueuePausedRef.current = true;
    pastedParagraphKeys.current.clear();
    previousNodeKeysRef.current.clear();
    // Clear storyBlocks when switching chapters
    setStoryBlocks(null);
    // fetch + set storyBlocks…
    // mount/hydrate happens because key changed
    setTimeout(() => {
      // or better, flip after a microtask post-hydrate
      isQueuePausedRef.current = false;
    }, 0);
    writeEpochRef.current += 1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter?.id]);

  const loadChapterIntoEditor = useCallback(
    (
      editor: LexicalEditor,
      serialized: SerializedEditorState | string,
      opts?: { tag?: string }
    ) => {
      const json =
        typeof serialized === "string"
          ? serialized
          : JSON.stringify(serialized);

      // bracket the swap
      isProgrammaticChange.current = true;
      isQueuePausedRef.current = true;
      pastedParagraphKeys.current.clear();
      previousNodeKeysRef.current.clear();

      const next = editor.parseEditorState(json);
      editor.setEditorState(next, { tag: opts?.tag ?? "CHAPTER_LOAD" });

      // seed previousNodeKeys so onChange won't diff against the old chapter
      editor.update(() => {
        const root = $getRoot();
        root.getChildren().forEach((n, index) => {
          if (n instanceof CustomParagraphNode) {
            const id = n.getKeyId();
            if (id)
              previousNodeKeysRef.current.set(id, {
                text: n.getTextContent(),
                place: index.toString(),
                format: n.getFormat(),
              });
          }
        });
      });

      // clear history for clean undo
      editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);

      isProgrammaticChange.current = false;
      isQueuePausedRef.current = false;
    },
    []
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: We intentionally only depend on story?.story_id and chapter?.id to avoid re-running when story/chapter properties change. This should only run when switching stories/chapters.
  useEffect(() => {
    if (!story || !chapter) return;
    if (!storyBlocks) return;
    if (!editorRef.current) return;

    loadChapterIntoEditor(editorRef.current, storyBlocks, {
      tag: "CHAPTER_LOAD",
    });
    // refresh the "no-change" hash after a programmatic load
    previousTextHashRef.current = generateTextHash(editorRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.story_id, chapter?.id, storyBlocks, loadChapterIntoEditor]);

  const queueParagraphForDeletion = useCallback(
    (chapterID: string, customKey: string, place?: string) => {
      if (!story) return;
      const deleteBlock: DBOperationBlock = { key_id: customKey, place };
      const storyID = story.story_id;
      QueueOp(
        DBOperationType.delete,
        storyID,
        chapterID,
        deleteBlock,
        previousTableStatus === "501" && tableStatus === "ok",
        {
          epoch: writeEpochRef.current,
        }
      );
    },
    [story, previousTableStatus, tableStatus]
  );

  const queueParagraphForSave = useCallback(
    (
      chapterID: string,
      customKey: string,
      order: string,
      content: SerializedElementNode<SerializedLexicalNode>
    ) => {
      if (!story || !chapter) return;
      const saveBlock: DBOperationBlock = {
        key_id: customKey,
        chunk: content,
        place: order,
      };
      const storyID = story.story_id;
      QueueOp(
        DBOperationType.save,
        storyID,
        chapterID,
        saveBlock,
        previousTableStatus === "501" && tableStatus === "ok",
        {
          epoch: writeEpochRef.current,
        }
      );
    },
    [chapter, previousTableStatus, story, tableStatus]
  );

  const queueAllParagraphsForSave = useCallback(
    (storyID: string, chapterID: string) => {
      if (!editorRef || !editorRef.current) {
        logger.warn("ThreadWriter - Editor not available.");
        return;
      }

      const orderMap: BlockOrderMap = {
        chapter_id: chapterID,
        blocks: [],
      };
      editorRef.current.read(() => {
        const root = $getRoot();
        const paragraphs = root
          .getChildren()
          .filter(
            (node) => node instanceof CustomParagraphNode
          ) as CustomParagraphNode[];

        paragraphs.forEach((paragraph, index) => {
          const key_id = paragraph.getKeyId();
          if (!key_id) {
            logger.warn(
              `ThreadWriter - Paragraph at index ${index} is missing a key_id.`
            );
            return;
          }

          // Serialize the paragraph
          const serialized = serializeWithChildren(paragraph);
          if (!serialized) {
            logger.warn(
              `ThreadWriter - Failed to serialize paragraph with key_id: ${key_id}`
            );
            return;
          }

          // Create a save operation block
          const saveBlock: DBOperationBlock = {
            key_id,
            chunk: serialized,
            place: index.toString(), // Assuming 'place' represents the order
          };

          QueueOp(DBOperationType.save, storyID, chapterID, saveBlock, false, {
            epoch: writeEpochRef.current,
          });

          orderMap.blocks.push({ key_id, place: index.toString() });
        });

        try {
          runQueue();
        } catch (error) {
          logger.error("Error from db queue", error);
        }
        setAlertState({
          title: "Chapter ready",
          message:
            "Your chapter assets are complete and your content was saved",
          severity: AlertToastType.success,
          open: true,
          timeout: 10000,
        });
      });
    },
    [setAlertState, runQueue]
  );

  useEffect(() => {
    // this effect will wait for tables with previous statuses (stati?) of 501 (assets not ready yet)
    // are now deployed and you should synch all current data nodes with the cloud now
    const handleSaveSuccess = (event: Event) => {
      const customEvent = event as CustomEvent<SaveSuccessPayload>;
      const payload = customEvent.detail;
      queueAllParagraphsForSave(payload.storyID, payload.chapterID);
    };
    dbEventEmitter.addEventListener("saveSuccess", handleSaveSuccess);
    return () => {
      dbEventEmitter.removeEventListener("saveSuccess", handleSaveSuccess);
    };
  }, [queueAllParagraphsForSave]);

  // Merged useEffect to handle both story and chapter changes
  useEffect(() => {
    if (story?.story_id && chapter?.id) {
      const fetchData = async () => {
        if (isInitialLoad.current && editorRef.current) {
          logger.log("Initial load: fetching story blocks and associations");
          isProgrammaticChange.current = true; // Start programmatic change
          await getBatchedStoryBlocks("", true); // Show loader on initial load
          const newHash = generateTextHash(editorRef.current);
          previousTextHashRef.current = newHash;
          isProgrammaticChange.current = false; // End programmatic change
          isInitialLoad.current = false;
        } else {
          logger.log("Chapter change: fetching new story blocks");
          isProgrammaticChange.current = true; // Start programmatic change
          await getBatchedStoryBlocks("", false); // No loader when switching chapters
          isProgrammaticChange.current = false; // End programmatic change
        }
      };
      fetchData();
    }
  }, [story?.story_id, chapter?.id, getBatchedStoryBlocks]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: We intentionally only depend on story?.story_id and chapter?.id to avoid re-running when story/chapter properties change. This should only run when switching stories/chapters.
  useEffect(() => {
    if (!chapter) return;
    if (editorRef.current) {
      // Transform default ParagraphNode to CustomParagraphNode
      const unregisterParagraphTransform =
        editorRef.current.registerNodeTransform(
          ParagraphNode,
          (node: ParagraphNode) => {
            if (!(node instanceof CustomParagraphNode) || !node.getKeyId()) {
              const replacement = new CustomParagraphNode(uuidv4());
              replacement.append(...node.getChildren());
              if (documentSettings?.autotab) {
                const firstChild = replacement.getFirstChild();
                // Check if already has leading tab
                const hasLeadingTab =
                  firstChild instanceof TextNode &&
                  firstChild.getTextContent().startsWith("\t");

                if (!hasLeadingTab) {
                  // If first child is a TextNode, prepend tab to its content
                  // This avoids creating separate nodes which causes cursor/backspace issues
                  if (firstChild instanceof TextNode) {
                    const currentContent = firstChild.getTextContent();
                    firstChild.setTextContent("\t" + currentContent);
                    const point = $createPoint(firstChild.getKey(), 1, "text");
                    const rangeSelection = $createRangeSelection();
                    rangeSelection.anchor = point;
                    rangeSelection.focus = point;
                    $setSelection(rangeSelection);
                  } else {
                    // No TextNode child, create a new one
                    const tabTextNode = $createTextNode("\t");
                    if (firstChild) {
                      firstChild.insertBefore(tabTextNode);
                    } else {
                      replacement.append(tabTextNode);
                    }
                    const point = $createPoint(tabTextNode.getKey(), 1, "text");
                    const rangeSelection = $createRangeSelection();
                    rangeSelection.anchor = point;
                    rangeSelection.focus = point;
                    $setSelection(rangeSelection);
                  }
                }
              }
              node.replace(replacement);
            }
          }
        );

      return () => {
        unregisterParagraphTransform();
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter?.id, queueParagraphForSave, documentSettings?.autotab]);

  useEffect(() => {
    const processInterval = setInterval(() => {
      if (!isQueuePausedRef.current) {
        runQueue();
      }
    }, 5000);
    return () => {
      clearInterval(processInterval);
    };
  }, [runQueue]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      try {
        logger.warn("UNLOAD DETECTED");
        ProcessDBQueue(); // force sync
      } catch (err) {
        logger.error("Error flushing DB queue on unload", err);
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const onChangeHandler = useCallback(
    (editorState: EditorState) => {
      if (!chapter) return;
      if (isProgrammaticChange.current) {
        logger.log("Programmatic change detected, skipping onChange handling.");
        return;
      }
      if (!editorRef.current) return;
      const currentHash = generateTextHash(editorRef.current);
      const previousHash = previousTextHashRef.current;

      if (currentHash === previousHash) {
        logger.log("No content changes detected, skipping onChange handling.");
        return;
      }
      previousTextHashRef.current = currentHash;

      editorState.read(() => {
        let orderResyncRequired = false;
        const root = $getRoot();
        const children = root.getChildren();
        const currentNodeKeys = new Set<string>();
        const newParagraphKeys = new Set<string>();
        const paragraphsToSave: {
          key_id: string;
          order: string;
          content: SerializedElementNode<SerializedLexicalNode>;
        }[] = [];

        // Check for untransformed ParagraphNodes (transform is pending)
        const hasUntransformedParagraphs = children.some(
          (node) =>
            node instanceof ParagraphNode &&
            !(node instanceof CustomParagraphNode)
        );

        children.forEach((node, index) => {
          if (node instanceof CustomParagraphNode) {
            const id = node.getKeyId();
            if (id) {
              currentNodeKeys.add(id);
              // If new paragraph (not seen before), flag for save
              if (!previousNodeKeysRef.current.has(id)) {
                newParagraphKeys.add(id);
              }
              const currentText = node.getTextContent();
              const currentFormat = node.getFormat();
              const prevData = previousNodeKeysRef.current.get(id);
              const textHasChanged =
                prevData === undefined || currentText !== prevData.text;
              const formatHasChanged =
                prevData === undefined || currentFormat !== prevData.format;

              // Add to paragraphsToSave if new, pasted, or selected
              const selection = $getSelection();
              const customParagraph = $isRangeSelection(selection)
                ? selection.anchor.getNode().getParent()
                : null;
              const selectedNodeKey =
                customParagraph instanceof CustomParagraphNode
                  ? customParagraph.getKeyId()
                  : null;

              const isSelected = id === selectedNodeKey;
              const isNew = newParagraphKeys.has(id);

              // Allow saving empty paragraphs (blank lines) - user expectation
              if (
                pastedParagraphKeys.current.has(id) ||
                isNew ||
                isSelected ||
                textHasChanged ||
                formatHasChanged
              ) {
                const serialized = serializeWithChildren(node);
                paragraphsToSave.push({
                  key_id: serialized.key_id,
                  order: index.toString(),
                  content: serialized,
                });
                previousNodeKeysRef.current.set(id, {
                  text: currentText,
                  place: index.toString(),
                  format: currentFormat,
                });
                // Remove from pastedParagraphKeys after saving to prevent re-saving on subsequent onChange calls
                pastedParagraphKeys.current.delete(id);
              }
            }
          }
        });

        // Remaining keys in previousNodeKeysRef are to be deleted
        const deletedKeys = Array.from(
          previousNodeKeysRef.current.keys()
        ).filter((key) => !currentNodeKeys.has(key));

        if (deletedKeys.length > 0) {
          logger.log("Delete operation detected", {
            deletedKeys,
            deletedCount: deletedKeys.length,
            currentNodeCount: currentNodeKeys.size,
          });
        }

        deletedKeys.forEach((key) => {
          const prevData = previousNodeKeysRef.current.get(key);
          queueParagraphForDeletion(chapter.id, key, prevData?.place);
          previousNodeKeysRef.current.delete(key);
        });
        if (deletedKeys.length || newParagraphKeys.size) {
          orderResyncRequired = true;
        }

        // Step 4: Filter saves – remove any that were just deleted
        const filteredSaves = paragraphsToSave.filter(
          (p) => !deletedKeys.includes(p.key_id)
        );

        if (filteredSaves.length > 0) {
          logger.log("Save operations queued", {
            saveCount: filteredSaves.length,
            savedKeys: filteredSaves.map((p) => p.key_id),
          });
        }

        filteredSaves.forEach((p) => {
          queueParagraphForSave(chapter.id, p.key_id, p.order, p.content);
        });
        // If order resync is required, queue it
        if (orderResyncRequired) {
          logger.log("Order resync required after paragraph changes");
          queueParagraphOrderResync();
        }

        // Admin-only alert: content hash changed but nothing was queued
        // Skip alert if there are untransformed ParagraphNodes (transform pending, will save on next onChange)
        if (hasUntransformedParagraphs) {
          logger.log(
            "Untransformed ParagraphNodes detected, skipping save check (transform pending)"
          );
        } else if (
          isAdmin &&
          filteredSaves.length === 0 &&
          deletedKeys.length === 0 &&
          !orderResyncRequired
        ) {
          logger.warn("Content hash changed but no operations queued", {
            previousHash,
            currentHash,
            childCount: children.length,
            previousNodeKeysCount: previousNodeKeysRef.current.size,
          });
          setAlertState({
            title: "Save Detection Warning",
            message: `Content changed but no paragraphs were queued for save. Hash: ${currentHash?.slice(0, 8)}... Previous: ${previousHash?.slice(0, 8)}...`,
            severity: AlertToastType.warning,
            open: true,
            timeout: 10000,
          });
        }
      });
    },
    [
      chapter,
      isAdmin,
      setAlertState,
      queueParagraphForDeletion,
      queueParagraphForSave,
      queueParagraphOrderResync,
    ]
  );

  const onAssociationEditCallback = useCallback(
    async (assoc: Association) => {
      if (!story) return;
      try {
        showLoader();

        await api.put(
          `/stories/${story.story_id}/associations`,
          [assoc], // axios auto-stringifies JSON
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      } catch (error) {
        if (axios.isAxiosError(error)) {
          logger.error(
            `Error saving association: ${error.response?.status} ${error.message}`
          );
        } else {
          logger.error(`Error saving association: ${error}`);
        }

        setAlertState({
          title: "Save Failure",
          message:
            "We are unable to save your association. Please try again later.",
          severity: AlertToastType.error,
          open: true,
        });
      } finally {
        // Mark as programmatic change to prevent scroll during association update
        isProgrammaticChange.current = true;
        setAssociations((prevAssociations: SimplifiedAssociation[] = []) =>
          prevAssociations.map((storedAssociation) =>
            storedAssociation.association_id === assoc.association_id
              ? { ...storedAssociation, ...assoc }
              : storedAssociation
          )
        );

        // Update all AssociationInlineNode instances in the editor with the new data
        editorRef.current?.update(() => {
          const root = $getRoot();
          const updateNodes = (node: LexicalNode) => {
            if ($isAssociationInlineNode(node)) {
              if (node.getAssociationId() === assoc.association_id) {
                // Create a new node with updated data
                const newNode = new AssociationInlineNode(
                  node.getTextContent(),
                  assoc.association_id,
                  assoc.short_description,
                  assoc.association_type,
                  assoc.portrait,
                  node.__leftClickCallback,
                  node.__rightClickCallback,
                  node.getFormat(),
                );
                node.replace(newNode);
              }
            } else if ($isElementNode(node)) {
              node.getChildren().forEach(updateNodes);
            }
          };
          root.getChildren().forEach(updateNodes);
        });

        // Reset after a delay to allow the update to complete
        setTimeout(() => {
          isProgrammaticChange.current = false;
        }, 100);
        hideLoader();
      }
    },
    [story, hideLoader, showLoader, setAlertState, setAssociations]
  );

  const handleDocumentLeftClick = (event: MouseEvent | TouchEvent) => {
    resetContextMenu();
    if (!editorRef.current) return;

    editorRef.current.focus();

    // Use setTimeout to ensure selection updates after browser processing
    setTimeout(() => {
      editorRef.current?.update(() => {
        const selection = $getSelection();
        // If there's already a valid selection, do nothing.
        if ($isRangeSelection(selection)) {
          return;
        }

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

        // Get all text nodes
        const textNodes: LexicalNode[] = [];
        const traverseNodes = (node: LexicalNode) => {
          if ($isTextNode(node) || $isAssociationInlineNode(node)) {
            textNodes.push(node);
          } else if ($isElementNode(node)) {
            node.getChildren().forEach(traverseNodes);
          }
        };
        root.getChildren().forEach(traverseNodes);

        // **Find exact text offset using caret position**
        let range: Range | null = null;
        const doc = document as unknown as {
          caretPositionFromPoint?: (
            x: number,
            y: number
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

        // **Find the closest text node based on the caret range**
        if (range) {
          for (const node of textNodes) {
            const domNode = editorRef.current?.getElementByKey(node.getKey());
            if (domNode && domNode.contains(range.startContainer)) {
              closestTextNode = node;
              break;
            }
          }
        }
        // **Set cursor exactly where the user tapped**
        if (closestTextNode && $isTextNode(closestTextNode)) {
          const newSelection = $createRangeSelection();
          newSelection.anchor.set(closestTextNode.getKey(), charOffset, "text");
          newSelection.focus.set(closestTextNode.getKey(), charOffset, "text");
          $setSelection(newSelection);
        }
      });
    }, 0); // Small delay allows browser to finish handling the event
  };

  const handleDocumentRightClick = (data: ClickData) => {
    const contextData: ContextMenuProps = {
      name: data.text ? data.text : "",
      visible: true,
      y: data.y,
      x: data.x,
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
    selectedAssociation.current = data.id;
    const contextData: ContextMenuProps = {
      name: data.text ? data.text : "",
      visible: true,
      y: data.y,
      x: data.x,
      items: associationContextMenuItems,
    };
    setContextMenuData(contextData);
  };

  if (!story || !chapter) return null;
  if (!storyBlocks) {
    return <div className={styles.loading}>Loading…</div>;
  }

  return (
    <div className={styles.outerWrapper}>
      <LexicalComposer
        key={`${story?.story_id}`}
        initialConfig={{
          ...initialConfig,
          editorState: (editor) => {
            // capture the instance on first mount
            editorRef.current = editor;
          },
        }}
      >
        <Toolbar />
        <div className={styles.editorRow}>
          <div className={styles.editorArea}>
            <RichTextPlugin
              contentEditable={
                <ContentEditable
                  tabIndex={0}
                  className={styles.editorInput}
                  spellCheck={documentSettings?.spellcheck}
                />
              }
              ErrorBoundary={LexicalErrorBoundary}
            />
            <AssociationDecoratorPlugin
              isProgrammaticChange={isProgrammaticChange}
              customLeftClick={handleAssociationLeftClick}
              customRightClick={handleAssociationRightClick}
            />
            <OnChangePlugin onChange={onChangeHandler} />
            <HistoryPlugin />
            <TextTransformPlugin isProgrammaticChange={isProgrammaticChange} />
            <DocumentClickPlugin
              onLeftClick={handleDocumentLeftClick}
              onRightClick={handleDocumentRightClick}
            />
            <AssociationPanel
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
          <DocumentMenu onAssociationClick={handleAssociationLeftClick} />
        </div>
      </LexicalComposer>
    </div>
  );
};
