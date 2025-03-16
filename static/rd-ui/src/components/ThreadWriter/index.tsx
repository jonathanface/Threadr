import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { $createPoint, $createRangeSelection, $createTextNode, $isRangeSelection, $isTextNode, $setSelection, LexicalEditor, LexicalNode, ParagraphNode, SerializedEditorState, SerializedElementNode, SerializedLexicalNode } from 'lexical';
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
import { ProcessDBQueue } from './queue';
import { DBOperation, DBOperationBlock, DBOperationType } from '../../types/DBOperations';
import { v4 as uuidv4 } from 'uuid';
import { CustomParagraphNode } from './customNodes/CustomParagraphNode';
import { BlockOrderMap } from '../../types/Document';
import { useToaster } from '../../hooks/useToaster';
import { AlertCommandType, AlertFunctionCall, AlertToastType } from '../../types/AlertToasts';
import { AssociationDecoratorPlugin } from './plugins/AssociationDecoratorPlugin';
import { Association, AssociationType, SimplifiedAssociation } from '../../types/Associations';
import { AssociationPanel } from '../AssociationPanel';
import { DocumentMenu } from '../DocumentMenu';
import { useSelections } from '../../hooks/useSelections';
import { useFetchStoryBlocks } from '../../hooks/useFetchStoryBlocks';
import { useAssociations } from '../../hooks/useAssociations';
import { useEditorStateUpdater } from '../../hooks/useEditorStateUpdater';
import { dbEventEmitter, SaveSuccessPayload } from '../../utils/EventEmitter';
import { DbOperationQueue, generateTextHash } from '../../constants/constants';
import { getParagraphIndexByKey, serializeWithChildren } from '../../utils/helpers';
import { ContextMenu, ContextMenuProps } from '../ContextMenu';
import DocumentClickPlugin, { ClickData } from './plugins/DocumentClickPlugin';
import { useDocumentSettings } from '../../hooks/useDocumentSettings';
import { TextTransformPlugin } from './plugins/TextTransformPlugin';
import { useEditorCommands } from '../../hooks/useEditorCommands';
import { AssociationInlineNode } from './customNodes/AssociationInlineNode';

const theme = {
  'custom-paragraph': styles.customParagraph,
  text: {
    bold: styles.bold,
    italic: styles.italic,
    underline: styles.underline,
    strikethrough: styles.strikethrough,
  },
};

export const ThreadWriter = () => {

  const initialConfig = {
    namespace: 'ThreadWriterEditor',
    theme,
    nodes: [
      CustomParagraphNode,
      AssociationInlineNode
    ],
    onError: (error: Error) => {
      console.error('Lexical error:', error);
    },
  };

  // refs
  const editorRef = useRef<LexicalEditor>(null);
  const isProgrammaticChange = useRef(false);
  const previousNodeKeysRef = useRef<Set<string>>(new Set());
  const previousTextHashRef = useRef<string | null>(null);
  const pastedParagraphKeys = useRef(new Set<string>());
  const isInitialLoad = useRef(true);
  const selectedAssociation = useRef<string | null>(null);


  // hooks
  const { setAlertState } = useToaster();
  const { story, chapter } = useSelections();
  const { showLoader, hideLoader } = useLoader();
  const { documentSettings } = useDocumentSettings();

  // states
  const [storyBlocks, setStoryBlocks] = useState<SerializedEditorState | null>(null);
  const defaultContextData: ContextMenuProps = {
    visible: false,
    name: "",
    x: 0,
    y: 0,
    items: []
  }
  const [contextMenuData, setContextMenuData] = useState<ContextMenuProps>(defaultContextData);
  const [isAssociationPanelOpen, setIsAssociationPanelOpen] = useState(false);

  useEditorCommands(editorRef, pastedParagraphKeys);

  // Fetchers
  const { getBatchedStoryBlocks, previousTableStatus, setPreviousTableStatus } = useFetchStoryBlocks(
    story?.story_id || '',
    chapter?.id || '',
    setStoryBlocks,
    previousNodeKeysRef
  );
  const { associations, setAssociations } = useAssociations();

  const getSelectedText = () => {
    let selectedText = '';
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
      }
    );
    setContextMenuData(defaultContextData);
  };

  const saveAssociationsToServer = async (associations: SimplifiedAssociation[]) => {
    if (!story?.story_id) return;
    try {
      showLoader();
      const response = await fetch("/api/stories/" + story.story_id + "/associations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(associations),
      });
      if (!response.ok) {
        throw response;
      }
      return await response.json();
    } catch (error: unknown) {
      console.error(error);
      const apiError = error as Response;
      if (apiError.status === 401) {
        const subscribeFunc: AlertFunctionCall = {
          type: AlertCommandType.subscribe,
          text: "subscribe",
        };
        setAlertState({
          title: "Insufficient subscription",
          message: "Free accounts are limited to 5 associations per story.",
          open: true,
          severity: AlertToastType.warning,
          timeout: null,
          callback: subscribeFunc,
        });
      } else {
        setAlertState({
          title: "Error saving association",
          message: "There was an error saving your association. Please try again later.",
          severity: AlertToastType.error,
          open: true
        });
      }
    } finally {
      hideLoader();
    }
  };

  const handleMenuItemClick = async (_event: React.MouseEvent, type: AssociationType) => {
    setContextMenuData(defaultContextData);
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
        case_sensitive: true
      }
      const storedAssociation = await saveAssociationsToServer([newAssociation]);
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

  const deleteAssociationsFromServer = async (associations: SimplifiedAssociation[]) => {
    if (!story) return;
    try {
      showLoader();
      const response = await fetch("/api/stories/" + story.story_id + "/associations", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(associations),
      });
      if (!response.ok) {
        throw response;
      }
    } catch (error: unknown) {
      console.error(`Error deleting association: ${(error as Response).statusText}`)
    } finally {
      hideLoader();
    }
  };


  const handleDeleteAssociationClick = async () => {
    setContextMenuData(defaultContextData);
    if (selectedAssociation.current?.length && associations) {
      const ind = associations.findIndex((assoc) => {
        return assoc.association_id === selectedAssociation.current;
      });
      selectedAssociation.current = '';
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
        timeout: null
      });
    }
  }, [setAlertState]);

  const queueParagraphOrderResync = useCallback(() => {
    if (!story || !chapter || !editorRef.current) return;
    editorRef.current.read(() => {
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
        storyID: story.story_id,
        chapterID: chapter.id,
      });
    });
  }, [chapter, story]);

  const queueParagraphForDeletion = useCallback((customKey: string) => {
    if (!story || !chapter) return;
    const deleteBlock: DBOperationBlock = { key_id: customKey };
    const storyID = story.story_id;
    const chapterID = chapter.id;
    const op: DBOperation = { type: DBOperationType.delete, storyID, chapterID, blocks: [deleteBlock], time: Date.now() };
    DbOperationQueue.push(op);
  }, [chapter, story]);

  const queueParagraphForSave = useCallback((customKey: string, order: string, content: SerializedElementNode<SerializedLexicalNode>) => {
    if (!story || !chapter) return;
    // Check if there's an existing save operation for this paragraph
    const existingOpIndex = DbOperationQueue.findIndex(op =>
      op.type === DBOperationType.save &&
      op.blocks.some(block => block.key_id === customKey)
    );

    if (existingOpIndex !== -1) {
      // Update the existing operation
      const existingOp = DbOperationQueue[existingOpIndex];
      existingOp.blocks = existingOp.blocks.map(block =>
        block.key_id === customKey ? { key_id: customKey, chunk: content, place: order } : block
      );
      // Optionally, update the timestamp so that the server knows this is a newer change
      existingOp.time = Date.now();
    } else {
      // Otherwise, push a new operation
      const saveBlock: DBOperationBlock = { key_id: customKey, chunk: content, place: order };
      const storyID = story.story_id;
      const chapterID = chapter.id;
      const newOp: DBOperation = {
        type: DBOperationType.save,
        storyID,
        chapterID,
        blocks: [saveBlock],
        time: Date.now(),
        tableStatus: previousTableStatus
      };
      DbOperationQueue.push(newOp);
    }
  }, [chapter, previousTableStatus, story]);

  const queueAllParagraphsForSave = useCallback((storyID: string, chapterID: string) => {
    if (!editorRef || !editorRef.current) {
      console.warn("ThreadWriter - Editor, story, or chapter is not available.");
      return;
    }

    const orderMap: BlockOrderMap = {
      chapter_id: chapterID,
      blocks: []
    }
    editorRef.current.read(() => {
      const root = $getRoot();
      const paragraphs = root.getChildren().filter(
        (node) => node instanceof CustomParagraphNode
      ) as CustomParagraphNode[];

      paragraphs.forEach((paragraph, index) => {
        const key_id = paragraph.getKeyId();
        if (!key_id) {
          console.warn(`ThreadWriter - Paragraph at index ${index} is missing a key_id.`);
          return;
        }

        // Serialize the paragraph
        const serialized = serializeWithChildren(paragraph);
        if (!serialized) {
          console.warn(`ThreadWriter - Failed to serialize paragraph with key_id: ${key_id}`);
          return;
        }

        // Create a save operation block
        const saveBlock: DBOperationBlock = {
          key_id,
          chunk: serialized,
          place: index.toString(), // Assuming 'place' represents the order
        };

        // Create a save operation
        const saveOperation: DBOperation = {
          type: DBOperationType.save,
          storyID: storyID,
          chapterID: chapterID,
          blocks: [saveBlock],
          time: Date.now(),
        };

        // Enqueue the save operation
        DbOperationQueue.push(saveOperation);
        orderMap.blocks.push({ key_id, place: index.toString() });

      });

      DbOperationQueue.push({
        type: DBOperationType.syncOrder,
        orderList: orderMap,
        blocks: [],
        time: Date.now(),
        storyID: storyID,
        chapterID: chapterID,
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
  }, [setAlertState, runQueue]);


  useEditorStateUpdater(editorRef, storyBlocks, isProgrammaticChange);

  // all of this messy effect is just to make the cursor move as expected on mobile
  useEffect(() => {
    if (!editorRef.current) return;

    const handleTouchEnd = (event: TouchEvent) => {
      const editor: LexicalEditor | null = editorRef.current;
      if (!editor) return;

      // Get the tapped position
      const touch = event.changedTouches[0];
      const target = document.elementFromPoint(touch.clientX, touch.clientY);
      if (!target || !editor.getRootElement()?.contains(target)) return;

      editor.update(() => {
        const root = $getRoot();

        let closestTextNode: LexicalNode | null = null;
        let charOffset = 0;

        // Get all text nodes
        const textNodes: LexicalNode[] = [];
        const traverseNodes = (node: LexicalNode) => {
          if ($isTextNode(node)) {
            textNodes.push(node);
          } else if ($isElementNode(node)) {
            node.getChildren().forEach(traverseNodes);
          }
        };
        root.getChildren().forEach(traverseNodes);

        // **Step 1: Use caret position to find exact text offset**
        let range: Range | null = null;
        const doc = document as unknown as {
          caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
          caretRangeFromPoint?: (x: number, y: number) => Range | null;
        } & Document;

        if (doc.caretPositionFromPoint) {
          const caretPos = doc.caretPositionFromPoint(touch.clientX, touch.clientY);
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

        // **Step 2: Find the closest text node based on the caret range**
        if (range) {
          for (const node of textNodes) {
            const domNode = editor.getElementByKey(node.getKey());
            if (domNode && domNode.contains(range.startContainer)) {
              closestTextNode = node;
              break;
            }
          }
        }
        // **Step 3: Set cursor exactly where the user tapped**
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
    // this effect will wait for tables with previous statuses (stati?) of 501 (assets not ready yet)
    // are now deployed and you should synch all current data nodes with the cloud now
    const handleSaveSuccess = (event: Event) => {
      const customEvent = event as CustomEvent<SaveSuccessPayload>;
      const payload = customEvent.detail;
      setPreviousTableStatus('ok');
      queueAllParagraphsForSave(payload.storyID, payload.chapterID);
    };
    dbEventEmitter.addEventListener('saveSuccess', handleSaveSuccess);
    return () => {
      dbEventEmitter.removeEventListener('saveSuccess', handleSaveSuccess);
    }
  }, [queueAllParagraphsForSave, setPreviousTableStatus]);

  // Merged useEffect to handle both story and chapter changes
  useEffect(() => {
    if (story?.story_id && chapter?.id) {
      console.log("Story or Chapter changed:", { story, chapter });
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
          previousNodeKeysRef.current.clear(); // Clear previous keys to prevent DELETEs
          await getBatchedStoryBlocks("");
          isProgrammaticChange.current = false; // End programmatic change
        }
      };
      startTransition(() => {
        fetchData();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.story_id, chapter?.id, getBatchedStoryBlocks]);

  useEffect(() => {
    if (editorRef.current) {
      // Transform default ParagraphNode to CustomParagraphNode
      editorRef.current.registerNodeTransform(ParagraphNode, (node: ParagraphNode) => {
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
      });

      // Handle empty CustomParagraphNodes
      editorRef.current.registerNodeTransform(CustomParagraphNode, (node: CustomParagraphNode) => {
        if (node.getTextContent().trim() === "") {
          // Prevent redundant replacement of already empty nodes
          editorRef.current?.update(() => {
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
  }, [editorRef, queueParagraphForSave, documentSettings?.autotab]);

  useEffect(() => {
    if (editorRef.current) {
      isProgrammaticChange.current = true;
      editorRef.current.update(() => {
        const root = $getRoot();
        const children = root.getChildren();
        children.forEach((child) => {
          if (child.getType() === "paragraph" && !(child instanceof CustomParagraphNode)) {
            console.error(`Existing ParagraphNode found: ${child.getKey()}`);
            const replacement = new CustomParagraphNode(uuidv4());
            replacement.append(...(child as ElementNode).getChildren<ElementNode>());
            child.replace(replacement);
          }
        });
      });
      isProgrammaticChange.current = false;
    }
  }, [editorRef]);

  useEffect(() => {
    const processInterval = setInterval(() => {
      runQueue();
    }, 5000);
    window.addEventListener("unload", () => {
    });
    return () => {
      clearInterval(processInterval);
      window.removeEventListener("unload", () => { });
    };
  }, [story?.story_id, setAlertState, runQueue]);

  const onChangeHandler = useCallback((editorState: EditorState) => {
    if (isProgrammaticChange.current) {
      console.log("Programmatic change detected, skipping onChange handling.");
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
      const root = $getRoot();
      const children = root.getChildren();
      const currentNodeKeys = new Set<string>();
      const newParagraphKeys = new Set<string>();
      const paragraphsToSave: { key_id: string, order: string, content: SerializedElementNode<SerializedLexicalNode> }[] = [];
      const paragraphsToDelete: string[] = [];
      let orderResyncRequired = false;

      children.forEach((node, index) => {
        if (node instanceof CustomParagraphNode) {
          const id = node.getKeyId();
          if (id) {
            currentNodeKeys.add(id);

            if (!previousNodeKeysRef.current.has(id)) {
              newParagraphKeys.add(id);
              if (index !== children.length - 1) {
                orderResyncRequired = true;
              }
            }
            const selection = $getSelection();
            const customParagraph = $isRangeSelection(selection) ? selection.anchor.getNode().getParent() : null;
            const selectedNodeKey = customParagraph instanceof CustomParagraphNode ? customParagraph.getKeyId() : null;
            if (pastedParagraphKeys.current.has(id) || newParagraphKeys.has(id) || id === selectedNodeKey) {
              const serialized = serializeWithChildren(node);
              paragraphsToSave.push({ key_id: serialized.key_id, order: index.toString(), content: serialized });
            }
            previousNodeKeysRef.current.delete(id);
          }
        }
      });

      // Remaining keys in previousNodeKeysRef are to be deleted
      const deletedKeys = Array.from(previousNodeKeysRef.current);
      paragraphsToDelete.push(...deletedKeys);

      // Reset previousNodeKeysRef to current keys
      previousNodeKeysRef.current = currentNodeKeys;

      // Queue deletions
      paragraphsToDelete.forEach(key => queueParagraphForDeletion(key));

      // Queue saves
      paragraphsToSave.forEach(paragraph => queueParagraphForSave(paragraph.key_id, paragraph.order, paragraph.content));

      // If order resync is required, queue it
      if (orderResyncRequired) queueParagraphOrderResync();
    });
  }, [queueParagraphForDeletion, queueParagraphForSave, queueParagraphOrderResync]);


  const onAssociationEditCallback = useCallback(async (assoc: Association) => {
    if (!story) return;
    try {
      showLoader();
      const response = await fetch("/api/stories/" + story.story_id + "/associations", {
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
        open: true
      });
    } finally {
      setAssociations((prevAssociations: SimplifiedAssociation[] = []) =>
        prevAssociations.map((storedAssociation) =>
          storedAssociation.association_id === assoc.association_id
            ? { ...storedAssociation, ...assoc }
            : storedAssociation
        )
      );
      hideLoader();
    }
  }, [story, hideLoader, showLoader, setAlertState, setAssociations]);

  const handleDocumentLeftClick = (event: MouseEvent | TouchEvent) => {
    setContextMenuData(defaultContextData);
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
          if ($isTextNode(node)) {
            textNodes.push(node);
          } else if ($isElementNode(node)) {
            node.getChildren().forEach(traverseNodes);
          }
        };
        root.getChildren().forEach(traverseNodes);

        // **Find exact text offset using caret position**
        let range: Range | null = null;
        const doc = document as unknown as {
          caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
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
      items: selectedContextMenuItems
    }
    setContextMenuData(contextData);
  }

  const handleAssociationLeftClick = (data: ClickData) => {
    if (!data.id) return;
    selectedAssociation.current = data.id;
    setIsAssociationPanelOpen(true);
  }

  const handleAssociationRightClick = (data: ClickData) => {
    if (!data.id) return;
    selectedAssociation.current = data.id;
    const contextData: ContextMenuProps = {
      name: data.text ? data.text : "",
      visible: true,
      y: data.y,
      x: data.x,
      items: associationContextMenuItems
    }
    setContextMenuData(contextData);
  }

  if (!story || !story.story_id || !chapter || !chapter.id) {
    console.warn("Story and chapter not loaded yet.");
    return;
  }

  return (

    <div className={styles.outerWrapper}>
      <LexicalComposer
        initialConfig={{
          ...initialConfig,
          editorState: (editor) => {
            editorRef.current = editor;
          },
        }}
      >
        <Toolbar />
        <div className={styles.editorRow}>
          <div className={styles.editorArea}>
            <RichTextPlugin
              contentEditable={<ContentEditable tabIndex={0} className={styles.editorInput} spellCheck={documentSettings?.spellcheck} />}
              ErrorBoundary={LexicalErrorBoundary}
            />
            <AssociationDecoratorPlugin isProgrammaticChange={isProgrammaticChange} scrollToTop={true} customLeftClick={handleAssociationLeftClick} customRightClick={handleAssociationRightClick} />
            <OnChangePlugin onChange={onChangeHandler} />
            <HistoryPlugin />
            <TextTransformPlugin />
            <DocumentClickPlugin onLeftClick={handleDocumentLeftClick} onRightClick={handleDocumentRightClick} />
            <AssociationPanel onEditCallback={onAssociationEditCallback} isAssociationPanelOpen={isAssociationPanelOpen} setIsAssociationPanelOpen={setIsAssociationPanelOpen} selectedAssociationID={selectedAssociation.current} />
            <ContextMenu name={contextMenuData.name} visible={contextMenuData.visible} x={contextMenuData.x} y={contextMenuData.y} items={contextMenuData.items} />
          </div>
          <DocumentMenu onAssociationClick={handleAssociationLeftClick} />
        </div>
      </LexicalComposer>
    </div>
  );
};
