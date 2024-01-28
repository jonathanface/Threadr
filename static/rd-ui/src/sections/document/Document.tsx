import Immutable from "immutable";
import React, { SyntheticEvent, useEffect, useRef, useState } from "react";

import { faAlignCenter, faAlignJustify, faAlignLeft, faAlignRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import AddIcon from "@mui/icons-material/Add";
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import CloseIcon from "@mui/icons-material/Close";
import DeleteIcon from "@mui/icons-material/Delete";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import { IconButton, ListItemIcon, ListItemText, MenuItem as MaterialMenuItem, TextField } from "@mui/material";
import Button from "@mui/material/Button";
import {
  BlockMap,
  CompositeDecorator,
  ContentBlock,
  ContentState,
  DraftHandleValue,
  DraftStyleMap,
  Editor,
  EditorState,
  Modifier,
  RichUtils,
  SelectionState,
  getDefaultKeyBinding,
} from "draft-js";
import "draft-js/dist/Draft.css";
import "primereact/resources/primereact.min.css";
import "primereact/resources/themes/lara-light-indigo/theme.css";

import { DragDropContext, Draggable, DropResult, Droppable } from "react-beautiful-dnd";

import { MenuItem, Menu as SideMenu, Sidebar, useProSidebar } from "react-pro-sidebar";
import { TypedUseSelectorHook, useDispatch, useSelector } from "react-redux";
import "../../css/document.css";
import "../../css/sidebar.css";
import { setAlert } from "../../stores/alertSlice";
import type { AppDispatch, RootState } from "../../stores/store";
import { setSelectedStory } from "../../stores/storiesSlice";
import { setIsLoaderVisible, setIsSubscriptionFormOpen } from "../../stores/uiSlice";
import {
  Chapter,
  DBOperationType,
  Story,
  type Association,
  type BlockOrderMap,
  type BlocksForServer,
  type DBOperation,
  type DocumentBlockStyle,
  type DocumentTab,
} from "../../types";
import { AlertFunctionCall, AlertLink, AlertToast, AlertToastType } from "../../utils/Toaster";
import { MenuItemEntry } from "../ContextMenu/MenuItem";
import ContextMenu from "../ContextMenu/index.js";
import AssociationUI from "./AssociationUI.js";
import EditableText from "./EditableText.js";
import Exporter from "./Exporter.js";
import { FindHighlightable, FindTabs, HighlightSpan, TabSpan } from "./decorators.js";
import {
  FilterAndReduceDBOperations,
  GenerateTabCharacter,
  GetBlockStyleDataByType,
  GetEntityData,
  GetSelectedBlockKeys,
  GetSelectedText,
  InsertTab,
} from "./utilities";

const ASSOCIATION_TYPE_CHARACTER = "character";
const ASSOCIATION_TYPE_EVENT = "event";
const ASSOCIATION_TYPE_PLACE = "place";
const DB_OP_INTERVAL = 5000;

const associations: Association[] = [];

const styleMap: DraftStyleMap = {
  STRIKETHROUGH: {
    textDecoration: "line-through",
  },
  BOLD: {
    fontWeight: "bold",
  },
  ITALIC: {
    fontStyle: "italic",
  },
  UNDERLINE: {
    textDecoration: "underline",
  },
  CENTER: {
    textAlign: "center",
  },
  RIGHT: {
    textAlign: "right",
  },
  JUSTIFY: {
    textAlign: "justify",
  },
};

const prompts = [
  "Don't think, just type.",
  "Once Upon A Time...",
  "It was the best of times, it was the blurst of times.",
  "Failure is made of should-haves.",
  "Type faster!",
];

const getWritingPrompt = () => {
  return prompts[Math.floor(Math.random() * prompts.length)];
};

// TODO type this
const dbOperationQueue: DBOperation[] = [];

const defaultText = getWritingPrompt();

interface DocumentProps {
  story: Story;
}

const Document: React.FC<DocumentProps> = () => {
  const domEditor = useRef<Editor>(null);
  const useAppDispatch: () => AppDispatch = useDispatch;
  const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
  const dispatch = useAppDispatch();

  const urlParams = new URLSearchParams(window.location.search);

  const selectedStory = useAppSelector((state) => state.stories.selectedStory);
  const isLoggedIn = useAppSelector((state) => state.user.isLoggedIn);
  const chapterFromURL = urlParams.get("chapter") !== null ? urlParams.get("chapter") : "";
  const [selectedChapter, setSelectedChapter] = useState<Chapter>({
    id: chapterFromURL ? chapterFromURL : "",
    title: "",
    place: 1,
    story_id: "",
  });
  const [currentRightClickedAssoc, setCurrentRightClickedAssoc] = useState<Association | null>(null);
  const [currentBlockAlignment, setCurrentBlockAlignment] = useState("LEFT");
  const [currentItalicsState, setCurrentItalicsState] = useState(false);
  const [currentBoldState, setCurrentBoldState] = useState(false);
  const [currentUnderscoreState, setCurrentUnderscoreState] = useState(false);
  const [currentStrikethroughState, setCurrentStrikethroughState] = useState(false);
  const [associationWindowOpen, setAssociationWindowOpen] = useState(false);
  const [viewingAssociation, setViewingAssociation] = useState<Association | null>(null);
  const [selectedContextMenuVisible, setSelectedContextMenuVisible] = useState(false);
  const [associationContextMenuVisible, setAssociationContextMenuVisible] = useState(false);
  const [selectedContextMenuX, setSelectedContextMenuX] = useState(0);
  const [selectedContextMenuY, setSelectedContextMenuY] = useState(0);
  const [associationContextMenuX, setAssociationContextMenuX] = useState(0);
  const [associationContextMenuY, setAssociationContextMenuY] = useState(0);
  const [exportMenuValue, setExportMenuValue] = React.useState(false);
  const [associationsLoaded, setAssociationsLoaded] = React.useState(false);
  const [blocksLoaded, setBlocksLoaded] = React.useState(false);
  const { collapseSidebar, collapsed } = useProSidebar();

  let lastRetrievedBlockKey = "";

  const handleAssociationClick = (association: Association, event: MouseEvent) => {
    const newAssociation: Association = { ...association };
    setViewingAssociation(newAssociation);
    setAssociationWindowOpen(true);
  };

  const handleAssociationContextMenu = (name: string, type: string, event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedContextMenuVisible(false);
    setCurrentRightClickedAssoc(formatBlankAssociation(type, name));
    setAssociationContextMenuX(event.clientX);
    setAssociationContextMenuY(event.clientY);
    setAssociationContextMenuVisible(true);
  };

  const createDecorators = () => {
    const decorators = new Array(associations.length);
    associations.forEach((association) => {
      decorators.push({
        strategy: FindHighlightable(association.association_type, association.association_name, associations),
        component: HighlightSpan,
        props: {
          association: association,
          leftClickFunc: handleAssociationClick,
          rightClickFunc: handleAssociationContextMenu,
        },
      });
    });
    decorators.push({
      strategy: FindTabs,
      component: TabSpan,
    });
    return new CompositeDecorator(decorators);
  };

  const [editorState, setEditorState] = React.useState(() => EditorState.createEmpty(createDecorators()));

  const exportDoc = async (type: string) => {
    if (selectedStory) {
      const newAlert: AlertToast = {
        title: "Conversion in progress",
        message: "A download link will be provided when the process is complete.",
        open: true,
        severity: AlertToastType.info,
      };
      dispatch(setAlert(newAlert));
      const exp = new Exporter(selectedStory.story_id);
      const htmlData = await exp.DocToHTML();
      try {
        const response = await fetch("/api/stories/" + selectedStory.story_id + "/export", {
          credentials: "include",
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            story_id: selectedStory.story_id,
            html_by_chapter: htmlData,
            type: type,
            title: selectedStory.title,
          }),
        });
        if (!response.ok) {
          if (response.status === 401) {
            const alertFunction: AlertFunctionCall = {
              func: () => {
                setIsSubscriptionFormOpen(true);
              },
              text: "subscribe",
            };
            const newAlert: AlertToast = {
              title: "Insufficient subscription",
              message: "Free accounts are unable to export their stories.",
              open: true,
              severity: AlertToastType.warning,
              func: alertFunction,
            };
            dispatch(setAlert(newAlert));
            return;
          } else {
            throw new Error("Fetch problem export " + response.status);
          }
        }
        const json = await response.json();
        const alertLink: AlertLink = {
          url: json.url,
          text: "download/open",
        };
        const newAlert: AlertToast = {
          title: "Conversion complete",
          message: "Click the link to access.",
          open: true,
          severity: AlertToastType.success,
          link: alertLink,
          timeout: undefined,
        };
        dispatch(setAlert(newAlert));
      } catch (error) {
        console.error(error);
        const errorAlert: AlertToast = {
          title: "Error",
          message:
            "Unable to export your document at this time. Please try again later, or contact support@richdocter.io.",
          open: true,
          severity: AlertToastType.error,
        };
        dispatch(setAlert(errorAlert));
      }
    }
  };

  const getAllAssociations = async () => {
    if (selectedStory) {
      associations.splice(0);
      return fetch("/api/stories/" + selectedStory.story_id + "/associations", {
        credentials: "include",
      })
        .then((response) => {
          if (response.ok) {
            return response.json();
          }
          throw new Error("Fetch problem associations " + response.status);
        })
        .then((data) => {
          data.forEach((assoc: Association) => {
            if (assoc.association_name.trim().length) {
              associations.push({
                association_id: assoc.association_id,
                association_name: assoc.association_name,
                association_type: assoc.association_type,
                portrait: assoc.portrait,
                short_description: assoc.short_description,
                details: {
                  aliases: assoc.details.aliases,
                  case_sensitive: assoc.details.case_sensitive,
                  extended_description: assoc.details.extended_description,
                },
              });
            }
          });
          setAssociationsLoaded(true);
        })
        .catch((error) => {
          console.error("get story associations", error);
        });
    }
  };

  const showGreeting = () => {
    const newAlert: AlertToast = {
      title: "INFO",
      message:
        "This is a new document.\nYou can create an association by typing some text, selecting any of it, and right-clicking on your highlighted text.\nYou can manage chapters by opening the menu on the right.",
      timeout: 20000,
      severity: AlertToastType.info,
      open: true,
    };
    dispatch(setAlert(newAlert));
  };

  const processDBBlock = (content: ContentState, block: ContentBlock): ContentState => {
    if (block.getData().has("STYLES")) {
      block
        .getData()
        .get("STYLES")
        .forEach((style: DocumentBlockStyle) => {
          const styleSelection: SelectionState = new SelectionState({
            focusKey: block.getKey(),
            anchorKey: block.getKey(),
            focusOffset: style.end,
            anchorOffset: style.start,
          });
          try {
            content = Modifier.applyInlineStyle(content, styleSelection, style.style);
          } catch (error) {
            console.error(error);
          }
        });
    }
    if (block.getData().has("ENTITY_TABS")) {
      block
        .getData()
        .get("ENTITY_TABS")
        .forEach((tab: DocumentTab) => {
          const tabSelection: SelectionState = new SelectionState({
            focusKey: block.getKey(),
            anchorKey: block.getKey(),
            anchorOffset: tab.start,
            focusOffset: tab.end,
          });
          const contentStateWithEntity = content.createEntity("TAB", "IMMUTABLE");
          const entityKey = contentStateWithEntity.getLastCreatedEntityKey();
          content = Modifier.replaceText(
            contentStateWithEntity,
            tabSelection,
            GenerateTabCharacter(),
            undefined,
            entityKey
          );
        });
    }
    return content;
  };

  const getBatchedStoryBlocks = async (startKey: string) => {
    if (selectedStory) {
      return fetch(
        "/api/stories/" + selectedStory.story_id + "/content?key=" + startKey + "&chapter=" + selectedChapter.id,
        {
          credentials: "include",
        }
      )
        .then((response: Response) => {
          if (response.ok) {
            return response.json();
          }
          throw new Error(response.status.toString());
        })
        .then((data) => {
          data.last_evaluated_key && data.last_evaluated_key.key_id
            ? (lastRetrievedBlockKey = data.last_evaluated_key.key_id)
            : (lastRetrievedBlockKey = "");
          const newBlocks: ContentBlock[] = [];
          if (data.items) {
            data.items.forEach((piece: string) => {
              const toJSON = JSON.parse(piece);
              if (toJSON.hasOwnProperty("chunk") && toJSON.chunk.Value) {
                const jsonBlock = JSON.parse(toJSON.chunk.Value);
                const block = new ContentBlock({
                  characterList: jsonBlock.characterList,
                  depth: jsonBlock.depth,
                  key: toJSON.key_id.Value,
                  text: jsonBlock.text,
                  type: jsonBlock.type,
                  data: jsonBlock.data,
                });
                newBlocks.push(block);
              }
            });
            if (newBlocks.length === 1 && !newBlocks[0].getText().length) {
              showGreeting();
            }
          }

          let newContentState: ContentState = ContentState.createFromBlockArray(newBlocks);
          newBlocks.forEach((block) => {
            if (block.getText().length) {
              // apply any styling per block
              newContentState = processDBBlock(newContentState, block);
            }
          });
          setEditorState(EditorState.createWithContent(newContentState, createDecorators()));
          if (domEditor.current && domEditor.current.editorContainer) {
            const editorBox: HTMLElement | null = domEditor.current.editorContainer.parentElement;
            if (editorBox) {
              editorBox.scrollTop = 0;
            }
          }
          setBlocksLoaded(true);
        })
        .catch((error: Error) => {
          console.log("fetch story blocks error", error);
          if (parseInt(error.message) !== 404 && parseInt(error.message) !== 501) {
            console.error("get story blocks", error);
            const newAlert: AlertToast = {
              title: "Error",
              message: "An error occurred trying to retrieve your content.\nPlease report this.",
              severity: AlertToastType.error,
              open: true,
            };
            dispatch(setAlert(newAlert));
          } else {
            showGreeting();
            setEditorState(EditorState.createEmpty(createDecorators()));
          }
          if (domEditor.current && domEditor.current.editorContainer) {
            const editorBox: HTMLElement | null = domEditor.current.editorContainer.parentElement;
            if (editorBox) {
              editorBox.scrollTop = 0;
            }
          }
          setBlocksLoaded(true);
        });
    }
  };

  const processDBQueue = async () => {
    dbOperationQueue.sort((a: DBOperation, b: DBOperation) => a.time - b.time);
    console.log("processing...", dbOperationQueue.length);
    const retryOps: DBOperation[] = [];
    const i = 0;
    while (i < dbOperationQueue.length) {
      const op = dbOperationQueue[i];
      switch (op.type) {
        case DBOperationType.delete: {
          const minifiedBlocks = FilterAndReduceDBOperations(dbOperationQueue, op, i);
          try {
            await deleteBlocksFromServer(minifiedBlocks, op.storyID, op.chapterID);
          } catch (retry) {
            if (retry !== true) {
              console.error(retry);
              dbOperationQueue.splice(i, 1);
              continue;
            }
            retryOps.push(op);
            console.error("server response 501, retrying...");
          }
          break;
        }
        case DBOperationType.save: {
          const minifiedBlocks = FilterAndReduceDBOperations(dbOperationQueue, op, i);
          try {
            await saveBlocksToServer(minifiedBlocks, op.storyID, op.chapterID);
          } catch (retry) {
            if (retry !== true) {
              console.error(retry);
              dbOperationQueue.splice(i, 1);
              continue;
            }
            retryOps.push(op);
            console.error("server response 501, retrying...");
          }
          break;
        }
        case DBOperationType.syncOrder: {
          try {
            if (!op.blockList) {
              throw new Error("invalid block list for sync order request");
            }
            await syncBlockOrderMap(op.blockList);
            dbOperationQueue.splice(i, 1);
          } catch (retry) {
            if (retry !== true) {
              console.error(retry);
              // keep retrying failed block order syncs
              continue;
            }
            console.error("server response 501, retrying...");
          }
          break;
        }
        default:
          console.error("invalid operation:", op);
      }
    }
    dbOperationQueue.push(...retryOps);
  };

  const setFocusAndRestoreCursor = () => {
    const selection = editorState.getSelection();
    const newSelection = selection.merge({
      anchorOffset: selection.getIsBackward() ? selection.getAnchorOffset() : selection.getFocusOffset(),
      focusOffset: selection.getIsBackward() ? selection.getAnchorOffset() : selection.getFocusOffset(),
    });
    if (domEditor.current) {
      domEditor.current.focus();
    }
    return EditorState.forceSelection(editorState, newSelection);
  };

  const handleScroll = (event: SyntheticEvent) => {
    const target: HTMLInputElement = event.target as HTMLInputElement;
    const bottom: boolean = target.scrollHeight - target.scrollTop === target.clientHeight;
    if (bottom && lastRetrievedBlockKey !== null) {
      getBatchedStoryBlocks(lastRetrievedBlockKey);
    }
  };

  useEffect(() => {
    dispatch(setIsLoaderVisible(true));
    const processInterval = setInterval(() => {
      try {
        processDBQueue();
      } catch (e) {
        console.error(e);
      }
    }, DB_OP_INTERVAL);
    window.addEventListener("unload", processDBQueue);

    if (isLoggedIn) {
      if (selectedStory) {
        if (!associationsLoaded) {
          getAllAssociations();
        } else if (!blocksLoaded) {
          getBatchedStoryBlocks("");
        }
        if (associationsLoaded && blocksLoaded) {
          dispatch(setIsLoaderVisible(false));
        }
      }
    }

    return () => {
      clearInterval(processInterval);
      window.removeEventListener("unload", processDBQueue);
    };
  }, [isLoggedIn, selectedStory, lastRetrievedBlockKey, associationsLoaded, blocksLoaded]);

  useEffect(() => {
    setBlocksLoaded(false);
  }, [selectedChapter]);

  const syncBlockOrderMap = (blockList: BlockMap) => {
    return new Promise(async (resolve, reject) => {
      try {
        if (!selectedChapter.id || !blockList.size || !selectedStory) {
          throw new Error("invalid request to syncBlockOrderMap");
        }
        const params: BlockOrderMap = {
          chapter_id: selectedChapter.id,
          blocks: [],
        };
        let index = 0;
        blockList.forEach((block) => {
          if (block) {
            params.blocks.push({ key_id: block.getKey(), place: index.toString() });
            index++;
          }
        });
        const response = await fetch("/api/stories/" + selectedStory.story_id + "/orderMap", {
          credentials: "include",
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(params),
        });
        if (!response.ok) {
          if (response.status === 501) {
            reject(true);
          }
          reject("SERVER ERROR ORDERING BLOCKS: " + response.body);
        }
        resolve(response.json());
      } catch (e) {
        reject("ERROR ORDERING BLOCKS: " + e);
      }
    });
  };

  const deleteBlocksFromServer = (blocks: ContentBlock[], storyID: string, chapterID: string) => {
    return new Promise(async (resolve, reject) => {
      try {
        const params: BlocksForServer = {
          story_id: storyID,
          chapter_id: chapterID,
          blocks: blocks,
        };
        console.log("del", storyID, chapterID, blocks);
        const response = await fetch("/api/stories/" + storyID + "/block", {
          credentials: "include",
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(params),
        });
        if (!response.ok) {
          if (response.status === 501) {
            reject(true);
          }
          reject("SERVER ERROR DELETING BLOCK: " + response.body);
        }
        resolve(response.json());
      } catch (e) {
        reject("ERROR DELETING BLOCK: " + e);
      }
    });
  };

  const saveBlocksToServer = (blocks: ContentBlock[], storyID: string, chapterID: string) => {
    return new Promise(async (resolve, reject) => {
      try {
        const params: BlocksForServer = {
          story_id: storyID,
          chapter_id: chapterID,
          blocks: blocks,
        };
        params.chapter_id = chapterID;
        params.blocks = blocks;
        console.log("saving", blocks);
        const response = await fetch("/api/stories/" + storyID, {
          credentials: "include",
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(params),
        });
        if (!response.ok) {
          if (response.status === 501) {
            reject(true);
          }
          reject("SERVER ERROR SAVING BLOCK: " + response.statusText);
        }
        resolve(response.json());
      } catch (e) {
        reject("ERROR SAVING BLOCK: " + e);
      }
    });
  };

  const updateAssociationsOnServer = (associations: Association[]): Promise<any> => {
    return new Promise(async (resolve, reject) => {
      try {
        if (!selectedStory) {
          throw new Error("no story selected");
        }
        console.log("saving associations", associations);
        const response = await fetch("/api/stories/" + selectedStory.story_id + "/associations", {
          credentials: "include",
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(associations),
        });
        if (!response.ok) {
          reject("SERVER ERROR SAVING BLOCK: " + response.statusText);
        }
        resolve(response.json());
      } catch (e) {
        reject("ERROR SAVING BLOCK: " + e);
      }
    });
  };

  const saveAssociationsToServer = (associations: Association[]): Promise<any> => {
    return new Promise(async (resolve, reject) => {
      try {
        if (!selectedStory) {
          throw new Error("no story selected");
        }
        console.log("creating associations", associations);
        const response = await fetch("/api/stories/" + selectedStory.story_id + "/associations", {
          credentials: "include",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(associations),
        });
        if (!response.ok) {
          if (response.status === 401) {
            const newAlert: AlertToast = {
              title: "Insufficient subscription",
              message: "Free accounts are limited to 10 associations.",
              severity: AlertToastType.warning,
              open: true,
              timeout: 6000,
            };
            dispatch(setAlert(newAlert));
          }
          reject("SERVER ERROR SAVING BLOCK: " + response.statusText);
        }
        resolve(response.json());
      } catch (e) {
        reject("ERROR SAVING BLOCK: " + e);
      }
    });
  };

  const deleteAssociationsFromServer = (associations: Association[]) => {
    return new Promise(async (resolve, reject) => {
      try {
        if (!selectedStory) {
          throw new Error("no story selected");
        }
        const response = await fetch("/api/stories/" + selectedStory.story_id + "/associations", {
          credentials: "include",
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(associations),
        });
        if (!response.ok) {
          reject("SERVER ERROR SAVING BLOCK: " + response.statusText);
        }
        resolve(response.json());
      } catch (e) {
        reject("ERROR SAVING BLOCK: " + e);
      }
    });
  };

  const prepBlocksForSave = (content: ContentState, blocks: ContentBlock[], storyID: string, chapterID: string) => {
    blocks.forEach((block) => {
      const key = block.getKey();
      const index = content
        .getBlockMap()
        .keySeq()
        .findIndex((k) => k === key);
      const selection = SelectionState.createEmpty(key);
      const updatedSelection = selection.merge({
        anchorOffset: 0,
        focusOffset: block.getText().length,
      });
      const newContent = Modifier.applyEntity(content, updatedSelection, null);
      const updatedBlock = newContent.getBlockForKey(key);
      dbOperationQueue.push({
        type: DBOperationType.save,
        storyID: storyID,
        chapterID: chapterID,
        time: Date.now(),
        ops: [{ key_id: key, chunk: updatedBlock, place: index.toString() }],
      });
    });
  };

  const keyBindings = (event: React.KeyboardEvent<HTMLElement>) => {
    if (selectedStory && selectedChapter.id) {
      // tab pressed
      if (event.code.toLowerCase() === "tab") {
        event.preventDefault();
        const selection = editorState.getSelection();
        const newEditorState = InsertTab(editorState, selection);
        const content = newEditorState.getCurrentContent();
        const blocksToPrep: ContentBlock[] = [];
        GetSelectedBlockKeys(newEditorState).forEach((key: string) => {
          blocksToPrep.push(content.getBlockForKey(key));
        });
        setEditorState(newEditorState);
        prepBlocksForSave(content, blocksToPrep, selectedStory.story_id, selectedChapter.id);
      }
    }
    return getDefaultKeyBinding(event);
  };

  const formatBlankAssociation = (type: string, name: string): Association => {
    return {
      association_id: "",
      association_type: type,
      association_name: name,
      short_description: "",
      portrait: "",
      details: {
        aliases: "",
        case_sensitive: true,
        extended_description: "",
      },
    };
  };

  const onAssociationEdit = async (association: Association) => {
    const promiseResults: Promise<any> = await updateAssociationsOnServer([association]);
    const existingIndex = associations.findIndex((assoc) => assoc.association_id === association.association_id);
    promiseResults.then((storedAssociations: Association[]) => {
      storedAssociations[0].portrait = storedAssociations[0].portrait + "?date=" + Date.now();
      associations[existingIndex] = storedAssociations[0];
      setEditorState(EditorState.set(editorState, { decorator: createDecorators() }));
    });
  };

  const handleMenuItemClick = async (event: MouseEvent, type: string) => {
    setSelectedContextMenuVisible(false);
    const text = GetSelectedText(editorState);
    if (text.length) {
      // check if !contains
      const newAssociation = formatBlankAssociation(type, text);
      const withSelection = setFocusAndRestoreCursor();
      try {
        const promiseResults: Promise<any> = await saveAssociationsToServer([newAssociation]);
        promiseResults.then((storedAssociations: Association[]) => {
          newAssociation.portrait = storedAssociations[0].portrait;
          newAssociation.association_id = storedAssociations[0].association_id;
          associations.push(newAssociation);
          const newEditorState = EditorState.set(withSelection, { decorator: createDecorators() });
          setEditorState(newEditorState);
        });
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleDeleteAssociationClick = () => {
    if (currentRightClickedAssoc) {
      const ind = associations.findIndex((assoc) => {
        return (
          assoc.association_type === currentRightClickedAssoc.association_type &&
          assoc.association_name === currentRightClickedAssoc.association_name
        );
      });
      const deleteMe = associations[ind];
      associations.splice(ind, 1);
      const withSelection = setFocusAndRestoreCursor();
      const newEditorState = EditorState.set(withSelection, { decorator: createDecorators() });
      try {
        deleteAssociationsFromServer([deleteMe]);
      } catch (e) {
        console.error(e);
      }
      setCurrentRightClickedAssoc(null);
      setEditorState(newEditorState);
      setAssociationContextMenuVisible(false);
    }
  };

  const handleTextCopy = () => {
    const text = GetSelectedText(editorState);
    navigator.clipboard.writeText(text).then(
      () => {
        /* Resolved - text copied to clipboard successfully */
      },
      () => {
        console.error("Failed to copy");
        /* Rejected - text failed to copy to the clipboard */
      }
    );
    setSelectedContextMenuVisible(false);
  };

  const handleContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setAssociationContextMenuVisible(false);
    const text = GetSelectedText(editorState);
    if (text.length) {
      setSelectedContextMenuX(event.clientX);
      setSelectedContextMenuY(event.clientY);
      setSelectedContextMenuVisible(true);
    }
  };

  const handleStyleClick = (event: MouseEvent, style: string) => {
    event.preventDefault();
    if (selectedStory && selectedChapter.id) {
      const originalSelectionState = editorState.getSelection();
      const newEditorState = RichUtils.toggleInlineStyle(editorState, style);
      let newContent = newEditorState.getCurrentContent();
      const selectedKeys = GetSelectedBlockKeys(newEditorState);
      const updatedBlocks: ContentBlock[] = [];
      selectedKeys.forEach((key: string) => {
        const modifiedBlock = newEditorState.getCurrentContent().getBlockForKey(key);
        const newStyles: DocumentBlockStyle[] = [];
        for (const entry in styleMap) {
          const styleDataByType = GetBlockStyleDataByType(modifiedBlock, entry);
          newStyles.push(...styleDataByType);
        }
        newStyles.forEach((subStyle) => {
          const styleState = new SelectionState({
            anchorKey: key,
            focusKey: key,
            anchorOffset: subStyle.start,
            focusOffset: subStyle.end,
          });
          if (newEditorState.getCurrentInlineStyle().has(subStyle.style)) {
            newContent = Modifier.mergeBlockData(newContent, styleState, Immutable.Map([["STYLES", newStyles]]));
          } else {
            const dataToRemove = Immutable.Map([[subStyle.style, undefined]]);
            const existingData = modifiedBlock.getData();
            const updatedData = existingData.delete("STYLES").mergeDeep({ STYLES: newStyles });
            const blockData = updatedData.merge(dataToRemove);
            const updatedContent = Modifier.mergeBlockData(newContent, originalSelectionState, blockData);
            updatedBlocks.push(updatedContent.getBlockForKey(key));
            newContent = updatedContent;
          }
        });
        if (!newStyles.length) {
          newContent = Modifier.setBlockData(newContent, newEditorState.getSelection(), Immutable.Map());
        }
        updatedBlocks.push(newContent.getBlockForKey(key));
      });
      const updatedEditorState = EditorState.push(newEditorState, newContent, "change-block-data");
      const updatedEditorStateWithSelection = EditorState.forceSelection(updatedEditorState, originalSelectionState);
      setEditorState(updatedEditorStateWithSelection);
      prepBlocksForSave(newContent, updatedBlocks, selectedStory.story_id, selectedChapter.id);
      setNavButtonState(style, false);
    }
  };

  const handleKeyCommand = (command: string, newEditorState: EditorState, timestamp: number): DraftHandleValue => {
    if (command === "backspace" || command === "delete") {
      const selection = editorState.getSelection();
      const postSelection = new SelectionState({
        focusKey: selection.getFocusKey(),
        anchorKey: selection.getAnchorKey(),
        focusOffset: selection.isCollapsed() ? selection.getFocusOffset() - 1 : selection.getFocusOffset(),
        anchorOffset: selection.getAnchorOffset(),
      });
      const selectedKeys = GetSelectedBlockKeys(editorState);
      selectedKeys.forEach((key) => {
        const content = editorState.getCurrentContent();
        const block = content.getBlockForKey(key);
        const tabs = block.getData().getIn(["ENTITY_TABS"]);
        if (tabs && tabs.length) {
          tabs.forEach((tab: DocumentTab) => {
            if (postSelection.hasEdgeWithin(key, tab.start, tab.end)) {
              tabs.splice(tabs.indexOf(tab), 1);
            }
          });
          const contentStateWithNewData = Modifier.mergeBlockData(
            content,
            selection,
            Immutable.Map([["ENTITY_TABS", tabs]])
          );
          newEditorState = EditorState.push(newEditorState, contentStateWithNewData, "insert-characters");
        }
      });
    }
    const updatedState = RichUtils.handleKeyCommand(newEditorState, command);
    if (updatedState) {
      setEditorState(updatedState);
      return "handled";
    }
    return "not-handled";
  };

  const resetNavButtonStates = () => {
    setCurrentBoldState(false);
    setCurrentItalicsState(false);
    setCurrentUnderscoreState(false);
    setCurrentStrikethroughState(false);
    setCurrentBlockAlignment("LEFT");
  };

  const setNavButtonState = (style: string, value?: boolean) => {
    if (!value) {
      value = false;
    }
    switch (style) {
      case "BOLD": {
        setCurrentBoldState(value);
        break;
      }
      case "ITALIC": {
        setCurrentItalicsState(value);
        break;
      }
      case "UNDERSCORE": {
        setCurrentUnderscoreState(value);
        break;
      }
      case "STRIKETHROUGH": {
        setCurrentStrikethroughState(value);
        break;
      }
      case "LEFT":
      case "RIGHT":
      case "CENTER":
      case "JUSTIFY": {
        setCurrentBlockAlignment(style);
        break;
      }
      default:
    }
  };

  const adjustBlockDataPositions = (newEditorState: EditorState, newBlock: ContentBlock): EditorState => {
    let content = newEditorState.getCurrentContent();
    const styleData: DocumentBlockStyle[] = newBlock.getData().getIn(["STYLES"]);
    const uniqueStyles = new Map();
    if (styleData) {
      styleData.forEach((style) => {
        const styleDataByType = GetBlockStyleDataByType(newBlock, style.style);
        styleDataByType.forEach((styleItem) => {
          const key = JSON.stringify(styleItem);

          if (!uniqueStyles.has(key)) {
            uniqueStyles.set(key, styleItem);
          }
        });
      });
      const styles = Array.from(uniqueStyles.values());
      content = Modifier.setBlockData(content, newEditorState.getSelection(), Immutable.Map([["STYLES", styles]]));
      // content = Modifier.mergeBlockData(content, newEditorState.getSelection(), Immutable.Map([["STYLES", styles]]));
    }

    const tabData = newBlock.getData().getIn(["ENTITY_TABS"]);
    if (tabData) {
      const tabs = GetEntityData(newBlock, "TAB", []);
      content = Modifier.mergeBlockData(content, newEditorState.getSelection(), Immutable.Map([["ENTITY_TABS", tabs]]));
    }

    return EditorState.push(newEditorState, content, "change-block-data");
  };

  const updateEditorState = (newEditorState: EditorState, isPasteAction?: boolean) => {
    if (selectedStory && selectedChapter.id) {
      resetNavButtonStates();
      console.log("change");
      setSelectedContextMenuVisible(false);
      setAssociationContextMenuVisible(false);
      const selection = newEditorState.getSelection();
      const block = newEditorState.getCurrentContent().getBlockForKey(selection.getFocusKey());
      for (const entry in styleMap) {
        const styles = GetBlockStyleDataByType(block, entry);
        styles.forEach((style) => {
          if (selection.hasEdgeWithin(block.getKey(), style.start, style.end)) {
            console.log("edge within");
            setNavButtonState(style.style, true);
          } else {
            console.log("edge without");
            setNavButtonState(style.style, false);
          }
        });
      }
      const data = block.getData();
      const alignment = data.getIn(["ALIGNMENT"]) ? data.getIn(["ALIGNMENT"]) : "LEFT";
      setCurrentBlockAlignment(alignment);

      // Cursor has moved but no text changes detected
      if (editorState.getCurrentContent() === newEditorState.getCurrentContent()) {
        setEditorState(newEditorState);
        return;
      }

      const newContent: ContentState = newEditorState.getCurrentContent();
      const newBlockMap: BlockMap = newContent.getBlockMap();
      const oldContent: ContentState = editorState.getCurrentContent();
      const oldBlockMap: BlockMap = oldContent.getBlockMap();
      const selectedKeys = GetSelectedBlockKeys(editorState);

      const blocksToSave: string[] = [];
      const blocksToDelete: string[] = [];
      let resyncRequired = false;
      oldBlockMap.forEach((_?: any, oldBlockKey?: string) => {
        if (oldBlockKey) {
          const newBlock = newBlockMap.get(oldBlockKey);
          // If the old block is not in the new block map, it's been removed
          if (!newBlock) {
            // Remove the block from the selection if it was selected
            if (selectedKeys.includes(oldBlockKey)) {
              selectedKeys.splice(selectedKeys.indexOf(oldBlockKey), 1);
            }
            blocksToDelete.push(oldBlockKey);
            const index = oldContent
              .getBlockMap()
              .keySeq()
              .findIndex((k) => k === oldBlockKey);
            if (index !== oldBlockMap.size - 1) {
              resyncRequired = true;
            }
          }
        }
      });
      newBlockMap.forEach((newBlock?: ContentBlock, newBlockKey?: string) => {
        if (newBlockKey && newBlock) {
          const oldBlock = oldBlockMap.get(newBlockKey);
          // If the new block is not in the old block map, it's a new block
          if (!oldBlock) {
            const index = newContent
              .getBlockMap()
              .keySeq()
              .findIndex((k) => k === newBlockKey);
            if (index !== newBlockMap.size - 1) {
              // If it's not in the last place of blocks, we will need to resync
              // the order of all blocks
              resyncRequired = true;
            }
            newEditorState = InsertTab(newEditorState, SelectionState.createEmpty(newBlockKey));
            blocksToSave.push(newBlockKey);
          }
          const selectionKey = selection.getIsBackward() ? selection.getFocusKey() : selection.getAnchorKey();
          if (selectionKey === newBlockKey && oldBlock) {
            if (newBlock.getText().length !== oldBlock.getText().length) {
              newEditorState = adjustBlockDataPositions(newEditorState, newBlock);
            }
          }
          // If the block is selected, save it to the server
          if (selectedKeys.includes(newBlockKey)) {
            blocksToSave.push(newBlockKey);
          }
        }
      });
      if (isPasteAction) {
        resyncRequired = true;
      }
      setEditorState(newEditorState);

      if (blocksToDelete.length) {
        const deleteOp: DBOperation = {
          type: DBOperationType.delete,
          time: Date.now(),
          storyID: selectedStory.story_id,
          chapterID: selectedChapter.id,
          ops: [],
        };
        blocksToDelete.forEach((blockKey) => {
          deleteOp.ops?.push({ key_id: blockKey, chunk: null, place: null });
        });
        dbOperationQueue.push(deleteOp);
      }

      if (blocksToSave.length) {
        const updatedContent = newEditorState.getCurrentContent();
        const blocksToPrep: ContentBlock[] = [];
        blocksToSave.forEach((key) => {
          blocksToPrep.push(updatedContent.getBlockForKey(key));
        });
        prepBlocksForSave(updatedContent, blocksToPrep, selectedStory.story_id, selectedChapter.id);
      }

      if (resyncRequired) {
        dbOperationQueue.push({
          type: DBOperationType.syncOrder,
          blockList: newBlockMap,
          time: Date.now(),
          storyID: selectedStory.story_id,
          chapterID: selectedChapter.id,
          ops: null,
        });
      }
    }
  };

  const handlePasteAction = (text: string): DraftHandleValue => {
    const blockMap = ContentState.createFromText(text).getBlockMap();

    if (blockMap.size > 100) {
      console.log("Large paste operation detected. Total paragraphs: ", blockMap.size);
      dispatch(setIsLoaderVisible(true));
    }
    const newState = Modifier.replaceWithFragment(
      editorState.getCurrentContent(),
      editorState.getSelection(),
      blockMap
    );
    updateEditorState(EditorState.push(editorState, newState, "insert-fragment"), true);
    dispatch(setIsLoaderVisible(false));
    return "handled";
  };

  const setFocus = () => {
    domEditor.current?.focus();
  };

  const getBlockStyles = (contentBlock: ContentBlock) => {
    const data = contentBlock.getData();
    let classStr = "";
    const alignment = data.getIn(["ALIGNMENT"]) ? data.getIn(["ALIGNMENT"]) : "LEFT";
    classStr += alignment;
    const lineHeight = data.getIn(["LINE_HEIGHT"]) ? data.getIn(["LINE_HEIGHT"]) : "LINEHEIGHT_DOUBLE";
    classStr += " " + lineHeight;
    classStr += " content-block";
    return classStr;
  };

  const updateBlockAlignment = (alignment: string) => {
    if (selectedStory && selectedChapter.id) {
      let newContentState = editorState.getCurrentContent();
      const selectedKeys = GetSelectedBlockKeys(editorState);
      const blocksToPrep: ContentBlock[] = [];
      selectedKeys.forEach((key) => {
        newContentState = Modifier.mergeBlockData(
          newContentState,
          SelectionState.createEmpty(key),
          Immutable.Map([["ALIGNMENT", alignment]])
        );
        blocksToPrep.push(newContentState.getBlockForKey(key));
      });
      setEditorState(EditorState.push(editorState, newContentState, "change-block-data"));
      prepBlocksForSave(newContentState, blocksToPrep, selectedStory.story_id, selectedChapter.id);
      setNavButtonState(alignment, true);
    }
  };

  const onExitDocument = () => {
    processDBQueue();
    dispatch(setSelectedStory(null));
    const history = window.history;
    history.pushState("root", "exited story", "/");
  };

  const onExpandChapterMenu = () => {
    collapseSidebar(!collapsed);
  };

  const onChapterClick = (id: string, title: string, num: number) => {
    if (selectedStory && selectedChapter.id) {
      if (id !== selectedChapter.id) {
        const history = window.history;
        const storyID = selectedStory.story_id;
        history.pushState({ storyID }, "changed chapter", "/story/" + selectedStory.story_id + "?chapter=" + id);
        setSelectedChapter({
          id: id,
          title: title,
          place: num,
          story_id: selectedStory.story_id,
        });
      }
    }
  };

  const onNewChapterClick = () => {
    if (selectedStory) {
      const newChapterNum = selectedStory.chapters.length + 1;
      const newChapterTitle = "Chapter " + newChapterNum;
      fetch("/api/stories/" + selectedStory.story_id + "/chapter", {
        credentials: "include",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ chapter_title: newChapterTitle, chapter_num: newChapterNum }),
      })
        .then(async (response) => {
          if (response.ok) {
            const json = await response.json();
            const newChapters: Chapter[] = [...selectedStory.chapters];
            newChapters.push({
              story_id: selectedStory.story_id,
              id: json.id,
              title: newChapterTitle,
              place: newChapterNum,
            });
            const updatedSelectedStory = { ...selectedStory };
            updatedSelectedStory.chapters = newChapters;
            dispatch(setSelectedStory(updatedSelectedStory));
            onChapterClick(json.id, newChapterTitle, newChapterNum);
          } else {
            throw new Error("Fetch problem creating chapter " + response.status + ", " + response.statusText);
          }
        })
        .catch((error) => {
          console.error(error);
        });
    }
  };

  const onDeleteChapterClick = (event: MouseEvent, chapterID: string, chapterTitle: string) => {
    event.stopPropagation();
    if (selectedStory) {
      if (selectedStory.chapters.length === 1) {
        const newAlert: AlertToast = {
          title: "Nope",
          message: "You cannot delete a story's only chapter.",
          severity: AlertToastType.info,
          open: true,
          timeout: 6000,
        };
        dispatch(setAlert(newAlert));
        return;
      }

      const confirm = window.confirm("Delete " + chapterTitle + " from " + selectedStory.title + "?");
      if (confirm) {
        fetch("/api/stories/" + selectedStory.story_id + "/chapter/" + chapterID, {
          credentials: "include",
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
        })
          .then((response) => {
            console.log("del response", response);
            const chapterIndex = selectedStory.chapters.findIndex((c) => c.id === chapterID);
            if ((response.ok || response.status === 501) && chapterIndex > -1) {
              const newChapters = [...selectedStory.chapters];
              newChapters.splice(chapterIndex);
              const newSelectedStory = { ...selectedStory };
              newSelectedStory.chapters = newChapters;
              dispatch(setSelectedStory(newSelectedStory));
              if (selectedChapter.id === chapterID) {
                const prevChapter = selectedStory.chapters[chapterIndex - 1];
                let newChapterID = "";
                if (prevChapter) {
                  newChapterID = prevChapter.id;
                  setSelectedChapter({
                    id: prevChapter.id,
                    title: prevChapter.title,
                    place: prevChapter.place,
                    story_id: selectedStory.story_id,
                  });
                } else {
                  setEditorState(EditorState.createEmpty(createDecorators()));
                  setSelectedChapter({
                    id: "",
                    title: "",
                    place: 0,
                    story_id: selectedStory.story_id,
                  });
                }
                const history = window.history;
                const storyID = selectedStory.story_id;
                history.pushState({ storyID }, "deleted chapter", "/story/" + storyID + "?chapter=" + newChapterID);
              }
              return;
            } else {
              throw new Error("Fetch problem deleting chapter " + response.status);
            }
          })
          .catch((error) => {
            console.error(error);
          });
      }
    }
  };

  const onStoryTitleEdit = async (event: Event) => {
    const target: HTMLInputElement = event.target as HTMLInputElement;
    if (selectedStory && target) {
      if (target.value !== selectedStory.title && target.value.trim() !== "") {
        const updatedStory: Story = { ...selectedStory };
        updatedStory.title = target.value;
        dispatch(setSelectedStory(updatedStory));
        const formData = new FormData();
        for (const key in updatedStory) {
          if (updatedStory.hasOwnProperty(key)) {
            formData.append(key, updatedStory[key]);
          }
        }
        const response = await fetch("/api/stories/" + updatedStory.story_id + "/details", {
          credentials: "include",
          method: "PUT",
          body: formData,
        });
        if (!response.ok) {
          console.error(response.body);
          const newAlert: AlertToast = {
            title: "Error",
            message: "There was an error updating your title. Please report this.",
            severity: AlertToastType.error,
            open: true,
            timeout: 6000,
          };
          dispatch(setAlert(newAlert));
          return;
        }
      }
    }
  };

  const onChapterTitleEdit = async (event: Event) => {
    const target: HTMLInputElement = event.target as HTMLInputElement;
    if (selectedStory && target) {
      if (target.value !== selectedChapter.title) {
        if (target.value !== selectedChapter.title && target.value.trim() !== "") {
          const updatedChapter = { ...selectedChapter };
          updatedChapter.title = target.value;
          setSelectedChapter(updatedChapter);
          selectedStory.chapters.forEach((chapter, idx) => {
            if (chapter.id === selectedChapter.id) {
              const newStory = { ...selectedStory };
              const newChapters = [...newStory.chapters];
              newChapters[idx] = updatedChapter;
              newStory.chapters = newChapters;
              dispatch(setSelectedStory(newStory));
              return;
            }
          });
          const response = await fetch("/api/stories/" + selectedStory.story_id + "/chapters/" + selectedChapter.id, {
            credentials: "include",
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(updatedChapter),
          });
          if (!response.ok) {
            console.error(response.body);
            const newAlert: AlertToast = {
              title: "Error",
              message: "There was an error updating your chapter. Please report this.",
              severity: AlertToastType.error,
              open: true,
              timeout: 6000,
            };
            dispatch(setAlert(newAlert));
            return;
          }
        }
      }
    }
  };

  const onChapterDragEnd = async (result: DropResult) => {
    if (!result.destination || !selectedStory || !selectedStory.chapters) {
      return;
    }
    const newChapters = Array.from(selectedStory.chapters);
    const [reorderedItem] = newChapters.splice(result.source.index, 1);
    newChapters.splice(result.destination.index, 0, reorderedItem);
    const updatedChapters = newChapters.map((vol, idx) => {
      return { ...vol, chapter_num: idx + 1 };
    });
    const newStory = { ...selectedStory };
    newStory.chapters = updatedChapters;
    dispatch(setSelectedStory(newStory));

    const response = await fetch("/api/stories/" + selectedStory.story_id + "/chapters", {
      credentials: "include",
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updatedChapters),
    });
    if (!response.ok) {
      console.error(response.body);
      const newAlert: AlertToast = {
        title: "Error",
        message: "There was an error updating your chapters. Please report this.",
        severity: AlertToastType.error,
        open: true,
        timeout: 6000,
      };
      dispatch(setAlert(newAlert));
      return;
    }
  };

  const associationContextMenuItems: MenuItemEntry[] = [
    {
      name: "Delete Association",
      command: handleDeleteAssociationClick,
    },
  ];

  const selectedContextMenuItems: MenuItemEntry[] = [
    { name: "Copy", command: handleTextCopy },
    {
      name: "Create Association",
      subItems: [
        {
          name: "Character",
          command: (event: MouseEvent) => {
            handleMenuItemClick(event, ASSOCIATION_TYPE_CHARACTER);
          },
        },
        {
          name: "Place",
          command: (event: MouseEvent) => {
            handleMenuItemClick(event, ASSOCIATION_TYPE_PLACE);
          },
        },
        {
          name: "Event",
          command: (event: MouseEvent) => {
            handleMenuItemClick(event, ASSOCIATION_TYPE_EVENT);
          },
        },
      ],
    },
  ];

  return (
    <div>
      {selectedStory ? (
        <div>
          <AssociationUI
            open={associationWindowOpen}
            association={viewingAssociation}
            story={selectedStory.story_id}
            onEditCallback={onAssociationEdit}
            onClose={() => {
              setAssociationWindowOpen(false);
              setFocusAndRestoreCursor();
            }}
          />
          <div className="title_info">
            <h2>
              <EditableText textValue={selectedStory.title} onTextChange={onStoryTitleEdit} />
            </h2>
            <h3>
              <EditableText textValue={selectedChapter.title} onTextChange={onChapterTitleEdit} />
            </h3>
          </div>
          <nav className="rich-controls">
            <div>
              <span className="controls-row">
                <button
                  className={currentBoldState ? "active" : ""}
                  onMouseDown={(e) => {
                    handleStyleClick(e.nativeEvent, "BOLD");
                  }}>
                  <b>B</b>
                </button>
                <button
                  className={currentItalicsState ? "active" : ""}
                  onMouseDown={(e) => {
                    handleStyleClick(e.nativeEvent, "ITALIC");
                  }}>
                  <i>I</i>
                </button>
                <button
                  className={currentUnderscoreState ? "active" : ""}
                  onMouseDown={(e) => {
                    handleStyleClick(e.nativeEvent, "UNDERLINE");
                  }}>
                  <u>U</u>
                </button>
                <button
                  className={currentStrikethroughState ? "active" : ""}
                  onMouseDown={(e) => {
                    handleStyleClick(e.nativeEvent, "STRIKETHROUGH");
                  }}>
                  <s>S</s>
                </button>
              </span>
              <span className="controls-row">
                <button
                  className={currentBlockAlignment === "LEFT" ? "active" : ""}
                  onMouseDown={(e) => {
                    updateBlockAlignment("LEFT");
                  }}>
                  <FontAwesomeIcon icon={faAlignLeft} />
                </button>
                <button
                  className={currentBlockAlignment === "CENTER" ? "active" : ""}
                  onMouseDown={(e) => {
                    updateBlockAlignment("CENTER");
                  }}>
                  <FontAwesomeIcon icon={faAlignCenter} />
                </button>
                <button
                  className={currentBlockAlignment === "RIGHT" ? "active" : ""}
                  onMouseDown={(e) => {
                    updateBlockAlignment("RIGHT");
                  }}>
                  <FontAwesomeIcon icon={faAlignRight} />
                </button>
                <button
                  className={currentBlockAlignment === "JUSTIFY" ? "active" : ""}
                  onMouseDown={(e) => {
                    updateBlockAlignment("JUSTIFY");
                  }}>
                  <FontAwesomeIcon icon={faAlignJustify} />
                </button>
              </span>
              <span className="right-controls">
                <span>
                  <TextField
                    select
                    label="Save as..."
                    InputLabelProps={{
                      style: { color: "#f0f0f0" },
                    }}
                    SelectProps={{
                      value: "",
                      onChange: (evt) => {
                        setExportMenuValue(!exportMenuValue);
                      },
                      onClose: (evt) => {
                        setTimeout(() => {
                          try {
                            (document.activeElement as HTMLElement).blur();
                          } catch (error) {
                            console.error(error);
                          }
                        }, 0);
                      },
                    }}
                    size="small"
                    sx={{
                      width: "120px",
                    }}>
                    <MaterialMenuItem
                      value="docx"
                      onClick={(e) => {
                        exportDoc("docx");
                      }}>
                      <ListItemIcon>
                        <ArticleOutlinedIcon />
                      </ListItemIcon>
                      <ListItemText primary="DOCX" />
                    </MaterialMenuItem>
                    <MaterialMenuItem
                      value="pdf"
                      onClick={(e) => {
                        exportDoc("pdf");
                      }}>
                      <ListItemIcon>
                        <PictureAsPdfIcon />
                      </ListItemIcon>
                      <ListItemText primary="PDF" />
                    </MaterialMenuItem>
                  </TextField>
                  <span className="close-doc-btn">
                    <IconButton aria-label="exit" component="label" onClick={onExitDocument}>
                      <CloseIcon
                        sx={{
                          color: "#F0F0F0",
                        }}
                      />
                    </IconButton>
                  </span>
                </span>
              </span>
            </div>
          </nav>
          <section
            onContextMenu={(e) => {
              handleContextMenu(e.nativeEvent);
            }}
            className="editor_container"
            onClick={setFocus}
            onScroll={handleScroll}>
            <Editor
              placeholder={defaultText}
              spellCheck={true}
              blockStyleFn={getBlockStyles}
              customStyleMap={styleMap}
              preserveSelectionOnBlur={true}
              editorState={editorState}
              onChange={updateEditorState}
              handlePastedText={handlePasteAction}
              handleKeyCommand={handleKeyCommand}
              keyBindingFn={keyBindings}
              ref={domEditor}
            />
          </section>
          <div className="sidebar-container">
            <div className="handle" onClick={onExpandChapterMenu}>
              chapters
            </div>
            <Sidebar rtl={false} collapsedWidth="0" defaultCollapsed={true}>
              <SideMenu>
                <DragDropContext onDragEnd={onChapterDragEnd}>
                  <Droppable droppableId="droppable">
                    {(provided) => (
                      <div {...provided.droppableProps} ref={provided.innerRef}>
                        {selectedStory.chapters.map((chapter, idx) => {
                          return (
                            <Draggable key={chapter.id} draggableId={chapter.id} index={idx}>
                              {(provided) => (
                                <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}>
                                  {
                                    <MenuItem
                                      key={idx}
                                      className={chapter.id === selectedChapter.id ? "active" : ""}
                                      onClick={() => {
                                        onChapterClick(chapter.id, chapter.title, chapter.place);
                                      }}>
                                      <span className="chapter-text">{chapter.title}</span>
                                      {selectedStory.chapters.length > 1 ? (
                                        <IconButton
                                          className="menu-icon"
                                          edge="end"
                                          size="small"
                                          aria-label="delete chapter"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            onDeleteChapterClick(event.nativeEvent, chapter.id, chapter.title);
                                          }}>
                                          <DeleteIcon fontSize="small" className={"menu-icon"} />
                                        </IconButton>
                                      ) : (
                                        ""
                                      )}
                                    </MenuItem>
                                  }
                                </div>
                              )}
                            </Draggable>
                          );
                        })}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>
                <div className="button-container">
                  <Button
                    className="sidebar-add-new"
                    onClick={onNewChapterClick}
                    variant="outlined"
                    sx={{ color: "#FFF" }}
                    startIcon={<AddIcon sx={{ marginLeft: "5px" }} />}>
                    New
                  </Button>
                </div>
              </SideMenu>
            </Sidebar>
          </div>
          <ContextMenu
            items={selectedContextMenuItems}
            visible={selectedContextMenuVisible}
            x={selectedContextMenuX}
            y={selectedContextMenuY}
          />
          <ContextMenu
            items={associationContextMenuItems}
            visible={associationContextMenuVisible}
            x={associationContextMenuX}
            y={associationContextMenuY}
          />
        </div>
      ) : (
        ""
      )}
    </div>
  );
};

export default Document;
