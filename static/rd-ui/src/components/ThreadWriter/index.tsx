import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { $createTextNode, $isRangeSelection, $isTextNode, KEY_TAB_COMMAND, ParagraphNode, PASTE_COMMAND, SerializedEditorState, SerializedElementNode, SerializedLexicalNode } from 'lexical';
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
import { AlertToastType } from '../../types/AlertToasts';
import { AssociationDecoratorPlugin } from './plugins/AssociationDecoratorPlugin';
import { ClickableDecoratorNode } from './customNodes/ClickableDecoratorNode';
import { Association, AssociationType, SimplifiedAssociation } from '../../types/Associations';
import { AssociationPanel } from '../AssociationPanel';
import { SettingsMenu } from '../SettingsMenu';
import { useSelections } from '../../hooks/useSelections';
import { useFetchStoryBlocks } from '../../hooks/useFetchStoryBlocks';
import { useFetchAssociations } from '../../hooks/useFetchAssociations';
import { useEditorStateUpdater } from '../../hooks/useEditorStateUpdater';
import { dbEventEmitter, SaveSuccessPayload } from '../../utils/EventEmitter';
import { DbOperationQueue, generateTextHash } from '../../constants/constants';
import { getParagraphIndexByKey, serializeWithChildren } from '../../utils/helpers';
import { ContextMenu, ContextMenuProps } from '../ContextMenu';
import LexicalRightClickPlugin, { RightClickData } from './plugins/ContextMenuPlugin';


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
      ClickableDecoratorNode
    ],
    onError: (error: Error) => {
      console.error('Lexical error:', error);
    },
  };

  // refs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null);
  const isProgrammaticChange = useRef(false);
  const previousNodeKeysRef = useRef<Set<string>>(new Set());
  const previousTextHashRef = useRef<string | null>(null);
  const pastedParagraphKeys = useRef(new Set<string>());
  const isInitialLoad = useRef(true);

  // hooks
  const { setAlertState } = useToaster();
  const { story, chapter } = useSelections();
  const { showLoader, hideLoader } = useLoader();

  // states
  const [storyBlocks, setStoryBlocks] = useState<SerializedEditorState | null>(null);
  const [associations, setAssociations] = useState<SimplifiedAssociation[] | null>(null);
  const defaultContextData: ContextMenuProps = {
    visible: false,
    name: "",
    x: 0,
    y: 0,
    items: []
  }
  const [contextMenuData, setContextMenuData] = useState<ContextMenuProps>(defaultContextData);

  // Fetchers
  const { getBatchedStoryBlocks, previousTableStatus, setPreviousTableStatus } = useFetchStoryBlocks(
    story?.story_id || '',
    chapter?.id || '',
    setStoryBlocks,
    previousNodeKeysRef
  );
  const { getAllAssociations } = useFetchAssociations(
    story?.story_id || '',
    setAssociations
  );

  const getSelectedText = () => {
    let selectedText = '';
    // Update the editor state to read the current selection.
    editorRef.current.update(() => {
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
      setAlertState({
        title: "Error saving association",
        message: "There was an error saving your association. Please try again later.",
        severity: AlertToastType.error,
        open: true,
        timeout: 6000,
      });
    } finally {
      hideLoader();
    }
  };

  const handleMenuItemClick = async (event: React.MouseEvent, type: AssociationType) => {
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
        associations ? setAssociations([...associations, newAssociation]) : setAssociations([newAssociation]);
      }
    }
  };

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

  // queue operations
  const queueParagraphOrderResync = useCallback(() => {
    if (!story || !chapter) return;
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
    const saveBlock: DBOperationBlock = { key_id: customKey, chunk: content, place: order };
    const storyID = story.story_id;
    const chapterID = chapter.id;
    const op: DBOperation = {
      type: DBOperationType.save,
      storyID,
      chapterID,
      blocks: [saveBlock],
      time: Date.now(),
      tableStatus: previousTableStatus
    };
    DbOperationQueue.push(op);
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

    console.log("starging queue all")
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

      ProcessDBQueue();
      setAlertState({
        title: "Chapter ready",
        message:
          "Your chapter assets are complete and your content was saved",
        severity: AlertToastType.success,
        open: true,
        timeout: 6000,
      });


    });
  }, [setAlertState]);


  useEditorStateUpdater(editorRef, storyBlocks, isProgrammaticChange);

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
        if (isInitialLoad.current) {
          console.log("Initial load: fetching story blocks and associations");
          isProgrammaticChange.current = true; // Start programmatic change
          await getBatchedStoryBlocks("");
          await getAllAssociations();
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
  }, [story?.story_id, chapter?.id, story, chapter, getAllAssociations, getBatchedStoryBlocks]);

  useEffect(() => {
    if (editorRef.current) {
      // Transform default ParagraphNode to CustomParagraphNode
      editorRef.current.registerNodeTransform(ParagraphNode, (node: ParagraphNode) => {
        if (!(node instanceof CustomParagraphNode) || !node.getKeyId()) {
          const replacement = new CustomParagraphNode(uuidv4());
          replacement.append(...node.getChildren());
          node.replace(replacement);
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
    });
    return () => {
      clearInterval(processInterval);
      window.removeEventListener("unload", () => { });
    };
  }, [story?.story_id, setAlertState]);

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
                    const customKey = (parent as CustomParagraphNode).getKeyId();
                    if (customKey)
                      pastedParagraphKeys.current.add(customKey);
                  } else if (index === 0) {
                    // Insert text at the current selection for the first paragraph
                    selection.insertText(paragraphText);
                    lastInsertedNode = selection.anchor.getNode(); // Update reference
                    const customKey = (parent as CustomParagraphNode).getKeyId()
                    if (customKey)
                      pastedParagraphKeys.current.add(customKey);
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
  }, [setAlertState]);

  const onChangeHandler = useCallback((editorState: EditorState) => {
    if (isProgrammaticChange.current) {
      console.log("Programmatic change detected, skipping onChange handling.");
      return;
    }

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
      hideLoader();
    }
  }, [associations, story, hideLoader, showLoader, setAlertState]);

  const handleRightClick = (data: RightClickData) => {
    const contextData: ContextMenuProps = {
      name: data.text,
      visible: true,
      y: data.y,
      x: data.x,
      items: selectedContextMenuItems
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
              contentEditable={<ContentEditable className={styles.editorInput} />}
              ErrorBoundary={LexicalErrorBoundary}
            />
            <AssociationDecoratorPlugin associations={associations} isProgrammaticChange={isProgrammaticChange} scrollToTop={true} />
            <OnChangePlugin onChange={onChangeHandler} />
            <HistoryPlugin />
            <LexicalRightClickPlugin onRightClick={handleRightClick} />
            <AssociationPanel associations={associations} onEditCallback={onAssociationEditCallback} />
            <ContextMenu name={contextMenuData.name} visible={contextMenuData.visible} x={contextMenuData.x} y={contextMenuData.y} items={contextMenuData.items} />
          </div>
          <SettingsMenu />
        </div>
      </LexicalComposer>
    </div>
  );
};
