import { useCallback, useEffect, useRef, useState } from 'react';
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { $createRangeSelection, $createTextNode, $isRangeSelection, $isTextNode, $setSelection, KEY_TAB_COMMAND, LexicalEditor, LexicalNode, ParagraphNode, PASTE_COMMAND, SerializedEditorState } from 'lexical';
import {
  $getRoot,
  $getSelection,
  $isElementNode,
  ElementNode,
} from 'lexical';
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary';
import styles from "./threadwriter.module.css";
import { useLoader } from '../../../hooks/useLoader';
import { v4 as uuidv4 } from 'uuid';
import { CustomParagraphNode, CustomSerializedParagraphNode } from './customNodes/CustomParagraphNode';
import { useToaster } from '../../../hooks/useToaster';
import { AlertToastType } from '../../../types/AlertToasts';
import { AssociationDecoratorPluginDemo } from './plugins/AssociationDecoratorPluginDemo';
import { ClickableDecoratorNode } from './customNodes/ClickableDecoratorNode';
import { Association, AssociationType, SimplifiedAssociation } from '../../../types/Associations';
import { AssociationPanelDemo } from '../AssociationPanelDemo';
import { useSelections } from '../../../hooks/useSelections';
import { useEditorStateUpdater } from '../../../hooks/useEditorStateUpdater';
import { ContextMenu, ContextMenuProps } from '../../ContextMenu';
import DocumentClickPlugin, { ClickData } from './plugins/DocumentClickPlugin';
import { ToolbarDemo } from '../ThreadWriterToolbarDemo';

const theme = {
  'custom-paragraph': styles.customParagraph,
  text: {
    bold: styles.bold,
    italic: styles.italic,
    underline: styles.underline,
    strikethrough: styles.strikethrough,
  },
};

export const ThreadWriterDemo = () => {

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
  const editorRef = useRef<LexicalEditor>(null);
  const isProgrammaticChange = useRef(false);
  const previousNodeKeysRef = useRef<Set<string>>(new Set());
  const pastedParagraphKeys = useRef(new Set<string>());
  const isInitialLoad = useRef(true);
  const selectedAssociation = useRef<string | null>(null);

  // hooks
  const { setAlertState } = useToaster();
  const { story, chapter } = useSelections();
  const { showLoader, hideLoader } = useLoader();

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
  const [associations, setAssociations] = useState<SimplifiedAssociation[]>([]);

  const generateAssociations = (): SimplifiedAssociation[] => {
    return [
      {
        association_id: "123",
        association_name: "Seth Walker",
        association_type: AssociationType.character,
        short_description: 'A young, resourceful survivor who has grown up quickly in the aftermath of the zombie apocalypse. He lives on a remote family farm in Montana with his younger sister, Melinda.',
        portrait: 'https://richdocter-custom-portraits.s3.us-east-1.amazonaws.com/jonathanjface-gmail.com_the-remnants_seth_character.jpg',
        aliases: 'Seth',
        case_sensitive: true
      },
      {
        association_id: "124",
        association_name: "Melinda Walker",
        association_type: AssociationType.character,
        short_description: "Melinda, Seth’s seven-year-old sister, is frail from hunger and trauma. She clings to her brother Seth for safety, quietly enduring nightmares in a harsh, dangerous new world.",
        portrait: "https://richdocter-custom-portraits.s3.us-east-1.amazonaws.com/jonathanjface-gmail.com_the-remnants_melinda_character.jpg",
        aliases: "Melinda",
        case_sensitive: true
      },
      {
        association_id: "125",
        association_name: "Tommy",
        association_type: AssociationType.character,
        short_description: "A grizzled survivor with perm-curled gray hair, a glum expression, and a ruthless streak. Wears a leather jacket, cracks jokes, but kills without hesitation. Practical, selfish, and dangerous.",
        portrait: "./demo-data/rocker.jpg",
        aliases: "Rocker",
        case_sensitive: true
      },
      {
        association_id: "126",
        association_name: "Riley",
        association_type: AssociationType.character,
        short_description: "A wiry man with a prominent Adam’s apple and a battered hat. A tough but anxious survivor, clinging to old-world manners.",
        portrait: "./demo-data/cowboy.jpg",
        aliases: "Cowboy",
        case_sensitive: true
      },
      {
        association_id: "127",
        association_name: "Kevin",
        association_type: AssociationType.character,
        short_description: "A rigid, disciplined man with a stiff, sculpted flattop haircut. Wears military gear and keeps a wary eye on his surroundings. Focused, methodical, and always expecting trouble.",
        portrait: "./demo-data/flattop.jpg",
        aliases: "Flattop",
        case_sensitive: true
      },
      {
        association_id: "128",
        association_name: "The Walker Farm",
        association_type: AssociationType.place,
        short_description: "A frost-covered, abandoned Montana farm with a broken-windowed house, a worn barn with an open hayloft, and dead crops in melting snow. Wild grass creeps in, reclaiming the silent land.",
        portrait: "./demo-data/farm.jpg",
        aliases: "the farm",
        case_sensitive: false
      },
      {
        association_id: "129",
        association_name: "Bowie knife",
        association_type: AssociationType.item,
        short_description: "A rugged Bowie knife with a broad, sharp steel blade and a well-worn wooden handle.",
        portrait: "./demo-data/bowie.jpg",
        aliases: "",
        case_sensitive: false
      }
    ];
  }

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

  const getBatchedStoryBlocks = async () => {
    try {
      showLoader();
      const response = await fetch(`./demo-data/demoContent.json`);
      if (!response.ok) throw response;
      const data = await response.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const remappedStoryBlocks = data.items?.map((item: { chunk: any; key_id: any }) => {
        const key = item.key_id?.Value || '';
        previousNodeKeysRef.current.add(key);
        const fixed: CustomSerializedParagraphNode = item.chunk?.Value
          ? JSON.parse(item.chunk.Value)
          : generateBlankLine();
        fixed.key_id = key;

        if (fixed.type !== CustomParagraphNode.getType()) {
          fixed.type = CustomParagraphNode.getType();
        }
        return fixed;
      }) || [];

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
      console.error("Error retrieving story content:", error);
    } finally {
      hideLoader();
    }
  };

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

  const handleMenuItemClick = async (_event: React.MouseEvent, type: AssociationType) => {
    setContextMenuData(defaultContextData);
    const text = getSelectedText();
    if (text.length) {
      // check if !contains
      const newAssociation: SimplifiedAssociation = {
        association_id: uuidv4(),
        association_name: text,
        association_type: type,
        short_description: "",
        portrait: "",
        aliases: "",
        case_sensitive: true
      }
      setAssociations([...associations, newAssociation]);
    }
  };

  const handleDeleteAssociationClick = async () => {
    setContextMenuData(defaultContextData);
    if (selectedAssociation.current?.length && associations) {
      const ind = associations.findIndex((assoc) => {
        return assoc.association_id === selectedAssociation.current;
      });
      selectedAssociation.current = '';
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
        console.log("offset", charOffset)
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

  // Merged useEffect to handle both story and chapter changes
  useEffect(() => {

    console.log("Story or Chapter changed:", { story, chapter });
    const fetchData = async () => {
      if (isInitialLoad.current && editorRef.current) {
        setAssociations(generateAssociations());
        isInitialLoad.current = false;
        console.log("Initial load: fetching story blocks and associations");
        isProgrammaticChange.current = true; // Start programmatic change
        await getBatchedStoryBlocks();
        isProgrammaticChange.current = false; // End programmatic change
      }
    };
    fetchData();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getBatchedStoryBlocks]);

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
    }
  }, []);

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

            editorRef.current?.update(() => {
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

  const onAssociationEditCallback = useCallback(async (assoc: Association) => {
    console.log("callback")
    setAssociations((prevAssociations: SimplifiedAssociation[] = []) =>
      prevAssociations.map((storedAssociation) =>
        storedAssociation.association_id === assoc.association_id
          ? { ...storedAssociation, ...assoc }
          : storedAssociation
      )
    );
  }, [setAssociations]);

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
          //return;
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
        <ToolbarDemo />
        <div className={styles.editorRow}>
          <div className={styles.editorArea}>
            <RichTextPlugin
              contentEditable={<ContentEditable className={styles.editorInput} spellCheck={false} />}
              ErrorBoundary={LexicalErrorBoundary}
            />
            <AssociationDecoratorPluginDemo associations={associations} isProgrammaticChange={isProgrammaticChange} scrollToTop={true} customLeftClick={handleAssociationLeftClick} customRightClick={handleAssociationRightClick} />
            <HistoryPlugin />
            <DocumentClickPlugin onLeftClick={handleDocumentLeftClick} onRightClick={handleDocumentRightClick} />
            <AssociationPanelDemo associations={associations} onEditCallback={onAssociationEditCallback} isAssociationPanelOpen={isAssociationPanelOpen} setIsAssociationPanelOpen={setIsAssociationPanelOpen} selectedAssociationID={selectedAssociation.current} />
            <ContextMenu name={contextMenuData.name} visible={contextMenuData.visible} x={contextMenuData.x} y={contextMenuData.y} items={contextMenuData.items} />
          </div>
        </div>
      </LexicalComposer>
    </div >
  );
};
