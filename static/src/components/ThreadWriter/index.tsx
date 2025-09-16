import { useCallback, useEffect, useRef, useState } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import {
  $createPoint,
  $createRangeSelection,
  $createTextNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  CLEAR_HISTORY_COMMAND,
  LexicalEditor,
  LexicalNode,
  ParagraphNode,
  SerializedEditorState,
  SerializedElementNode,
  SerializedLexicalNode,
} from "lexical";
import { $getRoot, $getSelection, $isElementNode, EditorState } from "lexical";
import LexicalErrorBoundary from "@lexical/react/LexicalErrorBoundary";
import styles from "./threadwriter.module.css";
import { useLoader } from "../../hooks/useLoader";
import { ProcessDBQueue, QueueOp, QueueSyncOrder } from "./queue";
import { DBOperationBlock, DBOperationType } from "../../types/DBOperations";
import { v4 as uuidv4 } from "uuid";
import { CustomParagraphNode } from "./customNodes/CustomParagraphNode";
import { BlockOrderMap } from "../../types/Document";
import { useToaster } from "../../hooks/useToaster";
import {
  AlertCommandType,
  AlertFunctionCall,
  AlertToastType,
} from "../../types/AlertToasts";
import { AssociationDecoratorPlugin } from "./plugins/AssociationDecoratorPlugin";
import {
  Association,
  AssociationType,
  SimplifiedAssociation,
} from "../../types/Associations";
import { DocumentMenu } from "./subcomponents/DocumentMenu";
import { useSelections } from "../../hooks/useSelections";
import { useFetchStoryBlocks } from "./hooks/useFetchStoryBlocks";
import { useAssociations } from "./hooks/useAssociations";
import { useEditorStateUpdater } from "./hooks/useEditorStateUpdater";
import { dbEventEmitter, SaveSuccessPayload } from "../../utils/EventEmitter";
import { generateTextHash } from "../../constants/constants";
import {
  getParagraphIndexByKey,
  serializeWithChildren,
} from "../../utils/helpers";
import DocumentClickPlugin, { ClickData } from "./plugins/DocumentClickPlugin";
import { useDocumentSettings } from "./hooks/useDocumentSettings";
import { TextTransformPlugin } from "./plugins/TextTransformPlugin";
import { useEditorCommands } from "./hooks/useEditorCommands";
import {
  $isAssociationInlineNode,
  AssociationInlineNode,
} from "./customNodes/AssociationInlineNode";
import axios from "axios";
import { api } from "../../api";
import { ContextMenu, ContextMenuProps } from "./subcomponents/ContextMenu";
import { AssociationPanel } from "./subcomponents/AssociationPanel";
import { Toolbar } from "./subcomponents/ThreadWriterToolbar";
import { useAutotabOnEnter } from "./hooks/useAutotabOnEnter";
import { useMobileCursorAdjustment } from "./hooks/useMobileCursorAdjustment";

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
      console.error("Lexical error:", error);
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
  const previousNodeKeysRef = useRef<Map<string, string>>(new Map());
  const previousTextHashRef = useRef<string | null>(null);
  const pastedParagraphKeys = useRef(new Set<string>());
  const isInitialLoad = useRef(true);
  const selectedAssociation = useRef<string | null>(null);
  const isQueuePausedRef = useRef(false);

  // states
  const [storyBlocks, setStoryBlocks] = useState<SerializedEditorState | null>(
    null,
  );
  const [contextMenuData, setContextMenuData] =
    useState<ContextMenuProps>(defaultContextData);
  const [isAssociationPanelOpen, setIsAssociationPanelOpen] = useState(false);

  const resetContextMenu = () => setContextMenuData({ ...defaultContextData });

  // hooks
  const { setAlertState } = useToaster();
  const { story, chapter } = useSelections();
  const { showLoader, hideLoader } = useLoader();
  const { documentSettings } = useDocumentSettings();
  const { associations, setAssociations } = useAssociations();
  useAutotabOnEnter(editorRef, !!documentSettings?.autotab);
  useEditorStateUpdater(editorRef, storyBlocks, isProgrammaticChange);
  useMobileCursorAdjustment(editorRef);
  useEditorCommands(editorRef, pastedParagraphKeys);

  // Fetchers
  const { getBatchedStoryBlocks, previousTableStatus, tableStatus } =
    useFetchStoryBlocks(
      story?.story_id || "",
      chapter?.id || "",
      setStoryBlocks,
      previousNodeKeysRef,
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
    const text = getSelectedText();
    navigator.clipboard.writeText(text).then(
      () => {
        /* Resolved - text copied to clipboard successfully */
      },
      () => {
        console.error("Failed to copy");
        /* Rejected - text failed to copy to the clipboard */
      },
    );
    resetContextMenu();
  };

  const saveAssociationsToServer = async (
    associations: SimplifiedAssociation[],
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
        },
      );

      return data;
    } catch (error) {
      console.error(error);

      if (axios.isAxiosError(error) && error.response?.status === 402) {
        const subscribeFunc: AlertFunctionCall = {
          type: AlertCommandType.subscribe,
          text: "subscribe",
        };
        setAlertState({
          title: "Insufficient subscription",
          message: "Free accounts are limited to 20 associations per story.",
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
    type: AssociationType,
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
    associations: SimplifiedAssociation[],
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
        console.error(
          `Error deleting association: ${error.response?.status} ${error.response?.statusText}`,
        );
      } else {
        console.error("Unexpected error deleting association:", error);
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
      console.error((error as Error).message);
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
    console.log("queueing a resync!!!!!");
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
          paragraph.getKey(),
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
  useEffect(() => {
    if (!chapter) return;
    isQueuePausedRef.current = true;
    pastedParagraphKeys.current.clear();
    previousNodeKeysRef.current.clear();
    // fetch + set storyBlocks…
    // mount/hydrate happens because key changed
    setTimeout(() => {
      // or better, flip after a microtask post-hydrate
      isQueuePausedRef.current = false;
    }, 0);
    writeEpochRef.current += 1;
  }, [chapter]);

  useEffect(() => {
    if (!story || !chapter) return;
    if (!storyBlocks) return;
    if (!editorRef.current) return;

    loadChapterIntoEditor(editorRef.current, storyBlocks, {
      tag: "CHAPTER_LOAD",
    });
    // refresh the “no-change” hash after a programmatic load
    previousTextHashRef.current = generateTextHash(editorRef.current);
  }, [story, chapter, storyBlocks]);

  const queueParagraphForDeletion = useCallback(
    (chapterID: string, customKey: string) => {
      if (!story) return;
      const deleteBlock: DBOperationBlock = { key_id: customKey };
      const storyID = story.story_id;
      QueueOp(
        DBOperationType.delete,
        storyID,
        chapterID,
        deleteBlock,
        previousTableStatus === "501" && tableStatus === "ok" ? true : false,
        {
          epoch: writeEpochRef.current,
        },
      );
    },
    [story, previousTableStatus, tableStatus],
  );

  const queueParagraphForSave = useCallback(
    (
      chapterID: string,
      customKey: string,
      order: string,
      content: SerializedElementNode<SerializedLexicalNode>,
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
        previousTableStatus === "501" && tableStatus === "ok" ? true : false,
        {
          epoch: writeEpochRef.current,
        },
      );
    },
    [chapter, previousTableStatus, story, tableStatus],
  );

  const queueAllParagraphsForSave = useCallback(
    (storyID: string, chapterID: string) => {
      if (!editorRef || !editorRef.current) {
        console.warn(
          "ThreadWriter - Editor, story, or chapter is not available.",
        );
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
            (node) => node instanceof CustomParagraphNode,
          ) as CustomParagraphNode[];

        paragraphs.forEach((paragraph, index) => {
          const key_id = paragraph.getKeyId();
          if (!key_id) {
            console.warn(
              `ThreadWriter - Paragraph at index ${index} is missing a key_id.`,
            );
            return;
          }

          // Serialize the paragraph
          const serialized = serializeWithChildren(paragraph);
          if (!serialized) {
            console.warn(
              `ThreadWriter - Failed to serialize paragraph with key_id: ${key_id}`,
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
          console.error("error from db queue", error);
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
    [setAlertState, runQueue],
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
          console.log("Initial load: fetching story blocks and associations");
          isProgrammaticChange.current = true; // Start programmatic change
          await getBatchedStoryBlocks("");
          const newHash = generateTextHash(editorRef.current);
          previousTextHashRef.current = newHash;
          isProgrammaticChange.current = false; // End programmatic change
          isInitialLoad.current = false;
        } else {
          console.log("Chapter change: fetching new story blocks");
          isProgrammaticChange.current = true; // Start programmatic change
          await getBatchedStoryBlocks("");
          isProgrammaticChange.current = false; // End programmatic change
        }
      };
      fetchData();
    }
  }, [story?.story_id, chapter?.id, getBatchedStoryBlocks]);

  useEffect(() => {
    // pause the queue processing during chapter change, as this leads to buggy behavior
    // with data from one chapter getting saved to another.
    isQueuePausedRef.current = true;
    if (previousNodeKeysRef.current) {
      previousNodeKeysRef.current.clear();
    }
    setTimeout(() => {
      isQueuePausedRef.current = false;
    }, 2000);
  }, [chapter]);

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
                const tabTextNode = $createTextNode("\t");
                const firstChild = replacement.getFirstChild();
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
              node.replace(replacement);
            }
          },
        );

      // Handle empty CustomParagraphNodes
      const unregisterCustomTransform = editorRef.current.registerNodeTransform(
        CustomParagraphNode,
        (node: CustomParagraphNode) => {
          const existedBefore = !!previousNodeKeysRef.current.get(
            node.getKeyId() ?? "",
          );
          if (node.getTextContent().trim() === "" && existedBefore) {
            // Prevent redundant replacement of already empty nodes
            const index = node.getIndexWithinParent();
            if (index !== null) {
              const id = node.getKeyId();
              if (id) {
                queueParagraphForSave(
                  chapter.id,
                  id,
                  index.toString(),
                  serializeWithChildren(node),
                );
              }
            }
          }
        },
      );
      return () => {
        unregisterParagraphTransform();
        unregisterCustomTransform();
      };
    }
  }, [editorRef, chapter, queueParagraphForSave, documentSettings?.autotab]);

  useEffect(() => {
    const processInterval = setInterval(() => {
      if (!isQueuePausedRef.current) {
        runQueue();
      }
    }, 5000);
    return () => {
      clearInterval(processInterval);
    };
  }, [story?.story_id, setAlertState, runQueue]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      try {
        console.warn("UNLOAD DETECTED");
        ProcessDBQueue(); // force sync
      } catch (err) {
        console.error("Error flushing DB queue on unload", err);
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const onChangeHandler = useCallback(
    (editorState: EditorState) => {
      if (!chapter) return;
      if (isProgrammaticChange.current) {
        console.log(
          "Programmatic change detected, skipping onChange handling.",
        );
        return;
      }
      if (!editorRef.current) return;
      const currentHash = generateTextHash(editorRef.current);
      const previousHash = previousTextHashRef.current;

      if (currentHash === previousHash) {
        console.log("No content changes detected, skipping onChange handling.");
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
              const prevText = previousNodeKeysRef.current.get(id);
              const textHasChanged =
                prevText === undefined || currentText !== prevText;

              // Add to paragraphsToSave if new, pasted, or selected
              const selection = $getSelection();
              const customParagraph = $isRangeSelection(selection)
                ? selection.anchor.getNode().getParent()
                : null;
              const selectedNodeKey =
                customParagraph instanceof CustomParagraphNode
                  ? customParagraph.getKeyId()
                  : null;

              if (
                pastedParagraphKeys.current.has(id) ||
                newParagraphKeys.has(id) ||
                id === selectedNodeKey ||
                textHasChanged
              ) {
                const serialized = serializeWithChildren(node);
                paragraphsToSave.push({
                  key_id: serialized.key_id,
                  order: index.toString(),
                  content: serialized,
                });
                previousNodeKeysRef.current.set(id, currentText);
              }
            }
          }
        });

        // Remaining keys in previousNodeKeysRef are to be deleted
        const deletedKeys = Array.from(
          previousNodeKeysRef.current.keys(),
        ).filter((key) => !currentNodeKeys.has(key));
        deletedKeys.forEach((key) => {
          queueParagraphForDeletion(chapter.id, key);
          previousNodeKeysRef.current.delete(key);
        });
        if (deletedKeys.length || newParagraphKeys.size) {
          orderResyncRequired = true;
        }

        // Step 4: Filter saves – remove any that were just deleted
        const filteredSaves = paragraphsToSave.filter(
          (p) => !deletedKeys.includes(p.key_id),
        );
        filteredSaves.forEach((p) =>
          queueParagraphForSave(chapter.id, p.key_id, p.order, p.content),
        );
        // If order resync is required, queue it
        if (orderResyncRequired) queueParagraphOrderResync();
      });
    },
    [
      chapter,
      queueParagraphForDeletion,
      queueParagraphForSave,
      queueParagraphOrderResync,
    ],
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
          },
        );
      } catch (error) {
        if (axios.isAxiosError(error)) {
          console.error(
            `Error saving association: ${error.response?.status} ${error.message}`,
          );
        } else {
          console.error(`Error saving association: ${error}`);
        }

        setAlertState({
          title: "Save Failure",
          message:
            "We are unable to save your association. Please try again later.",
          severity: AlertToastType.error,
          open: true,
        });
      } finally {
        setAssociations((prevAssociations: SimplifiedAssociation[] = []) =>
          prevAssociations.map((storedAssociation) =>
            storedAssociation.association_id === assoc.association_id
              ? { ...storedAssociation, ...assoc }
              : storedAssociation,
          ),
        );
        hideLoader();
      }
    },
    [story, hideLoader, showLoader, setAlertState, setAssociations],
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
  const loadChapterIntoEditor = (
    editor: LexicalEditor,
    serialized: SerializedEditorState | string,
    opts?: { tag?: string },
  ) => {
    const json =
      typeof serialized === "string" ? serialized : JSON.stringify(serialized);

    // bracket the swap
    isProgrammaticChange.current = true;
    isQueuePausedRef.current = true;
    pastedParagraphKeys.current.clear();
    previousNodeKeysRef.current.clear();

    const next = editor.parseEditorState(json);
    editor.setEditorState(next, { tag: opts?.tag ?? "CHAPTER_LOAD" });

    // seed previousNodeKeys so onChange won’t diff against the old chapter
    editor.update(() => {
      const root = $getRoot();
      root.getChildren().forEach((n) => {
        if (n instanceof CustomParagraphNode) {
          const id = n.getKeyId();
          if (id) previousNodeKeysRef.current.set(id, n.getTextContent());
        }
      });
    });

    // clear history for clean undo
    editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);

    isProgrammaticChange.current = false;
    isQueuePausedRef.current = false;
  };

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
              scrollToTop={true}
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
