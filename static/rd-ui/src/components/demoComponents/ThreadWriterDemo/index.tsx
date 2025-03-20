import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { $createPoint, $createRangeSelection, $createTextNode, $isRangeSelection, $isTextNode, $setSelection, LexicalEditor, LexicalNode, ParagraphNode, SerializedEditorState } from 'lexical';
import {
  $getRoot,
  $getSelection,
  $isElementNode,
  ElementNode,
} from 'lexical';
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary';
import styles from "./threadwriter.module.css";
import { ToolbarDemo } from '../ThreadWriterToolbarDemo';
import { useLoader } from '../../../hooks/useLoader';
import { v4 as uuidv4 } from 'uuid';
import { CustomParagraphNode, CustomSerializedParagraphNode } from './customNodes/CustomParagraphNode';
import { AssociationDecoratorPluginDemo } from './plugins/AssociationDecoratorPluginDemo'
import { Association, AssociationType, SimplifiedAssociation } from '../../../types/Associations';
import { AssociationPanelDemo } from '../AssociationPanelDemo';
import { useEditorStateUpdater } from '../../../hooks/useEditorStateUpdater';
import { ContextMenu, ContextMenuProps } from '../../ContextMenu';
import DocumentClickPluginDemo, { ClickData } from './plugins/DocumentClickPluginDemo';
import { TextTransformPluginDemo } from './plugins/TextTransformPluginDemo'
import { useEditorCommandsDemo } from '../hooks/useEditorCommandsDemo';
import { AssociationInlineNodeDemo } from './customNodes/AssociationInlineNodeDemo';

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
      AssociationInlineNodeDemo
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
  useEditorCommandsDemo(editorRef, pastedParagraphKeys);

  const storedAssociations = useMemo((): SimplifiedAssociation[] => {
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
  }, []);

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
    const fetchData = async () => {
      if (isInitialLoad.current && editorRef.current) {
        setAssociations(storedAssociations);
        isInitialLoad.current = false;
        console.log("Initial load: fetching story blocks and associations");

        // Wait for the editor to finish any processing
        isProgrammaticChange.current = true;
        await getBatchedStoryBlocks();
        isProgrammaticChange.current = false;
        const container = document.querySelector(`.${styles.outerWrapper}`)?.parentElement;
        if (container) {
          setTimeout(() => container.scrollTop = 0, 250);
        }

      }
    };

    fetchData();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getBatchedStoryBlocks, editorRef.current]);

  const onAssociationEditCallback = useCallback(async (assoc: Association) => {
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
    const rootElement = editorRef.current?.getRootElement();
    if (!rootElement) return;
    selectedAssociation.current = data.id;
    const containerRect = rootElement.parentElement?.parentElement?.parentElement?.parentElement?.parentElement?.getBoundingClientRect();
    const xInContainer = containerRect ? data.x - containerRect.left : data.x;
    const yInContainer = containerRect ? data.y - containerRect.top : data.y;
    const contextData: ContextMenuProps = {
      name: data.text ? data.text : "",
      visible: true,
      y: yInContainer,
      x: xInContainer,
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
              contentEditable={<ContentEditable tabIndex={0} className={styles.editorInput} spellCheck={true} />}
              ErrorBoundary={LexicalErrorBoundary}
            />
            <AssociationDecoratorPluginDemo associations={associations} isProgrammaticChange={isProgrammaticChange} scrollToTop={true} customLeftClick={handleAssociationLeftClick} customRightClick={handleAssociationRightClick} />
            <HistoryPlugin />
            <TextTransformPluginDemo />
            <DocumentClickPluginDemo onLeftClick={handleDocumentLeftClick} onRightClick={handleDocumentRightClick} />
            <AssociationPanelDemo associations={associations} onEditCallback={onAssociationEditCallback} isAssociationPanelOpen={isAssociationPanelOpen} setIsAssociationPanelOpen={setIsAssociationPanelOpen} selectedAssociationID={selectedAssociation.current} />
            <ContextMenu name={contextMenuData.name} visible={contextMenuData.visible} x={contextMenuData.x} y={contextMenuData.y} items={contextMenuData.items} />
          </div>
        </div>
      </LexicalComposer>
    </div>
  );
};
