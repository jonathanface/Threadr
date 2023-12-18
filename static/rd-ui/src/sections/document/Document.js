import Immutable from "immutable";
import React, { useEffect, useRef, useState } from "react";

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
  CompositeDecorator,
  ContentBlock,
  ContentState,
  Editor,
  EditorState,
  Modifier,
  RichUtils,
  SelectionState,
  convertFromRaw,
  getDefaultKeyBinding,
} from "draft-js";
import "draft-js/dist/Draft.css";
import { ContextMenu } from "primereact/contextmenu";
import "primereact/resources/primereact.min.css";
import "primereact/resources/themes/lara-light-indigo/theme.css";

import { DragDropContext, Draggable, Droppable } from "react-beautiful-dnd";

import { PrimeReactProvider } from "primereact/api";

import { MenuItem, Menu as SideMenu, Sidebar, useProSidebar } from "react-pro-sidebar";
import { useDispatch, useSelector } from "react-redux";
import "../../css/document.css";
import "../../css/sidebar.css";
import {
  setAlertLink,
  setAlertMessage,
  setAlertOpen,
  setAlertSeverity,
  setAlertTimeout,
  setAlertTitle,
} from "../../stores/alertSlice.js";
import { setSelectedStory } from "../../stores/storiesSlice.js";
import { setIsLoaderVisible } from "../../stores/uiSlice.js";
import AssociationUI from "./AssociationUI.js";
import EditableText from "./EditableText.js";
import Exporter from "./Exporter.js";
import { FindHighlightable, FindTabs, HighlightSpan, TabSpan } from "./decorators";
import {
  FilterAndReduceDBOperations,
  GenerateTabCharacter,
  GetBlockStyleDataByType,
  GetEntityData,
  GetSelectedBlockKeys,
  GetSelectedText,
  InsertTab,
} from "./utilities.js";

const ASSOCIATION_TYPE_CHARACTER = "character";
const ASSOCIATION_TYPE_EVENT = "event";
const ASSOCIATION_TYPE_PLACE = "place";
const DB_OP_INTERVAL = 5000;

const associations = [];

const styleMap = {
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

const dbOperationQueue = [];

const defaultText = getWritingPrompt();

const isUserUsingMobile = () => {
  // User agent string method
  let isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  // Screen resolution method
  if (!isMobile) {
    const screenWidth = window.screen.width;
    const screenHeight = window.screen.height;
    isMobile = screenWidth < 768 || screenHeight < 768;
  }

  // Touch events method
  if (!isMobile) {
    isMobile = "ontouchstart" in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0;
  }

  // CSS media queries method
  if (!isMobile) {
    const bodyElement = document.getElementsByTagName("body")[0];
    isMobile = window.getComputedStyle(bodyElement).getPropertyValue("content").indexOf("mobile") !== -1;
  }
  return isMobile;
};

const isMobile = isUserUsingMobile();

const Document = () => {
  const domEditor = useRef(null);
  const selectedTextCMRef = useRef(null);
  const associationClickCMRef = useRef(null);
  const dispatch = useDispatch();

  const urlParams = new URLSearchParams(window.location.search);

  const selectedStory = useSelector((state) => state.stories.selectedStory);
  const isLoggedIn = useSelector((state) => state.user.isLoggedIn);
  const [selectedChapter, setSelectedChapter] = useState({
    id: urlParams.get("chapter") ? urlParams.get("chapter") : "",
    chapter_title: "",
    chapter_num: 1,
  });
  const [currentRightClickedAssoc, setCurrentRightClickedAssoc] = useState(null);
  const [currentBlockAlignment, setCurrentBlockAlignment] = useState("LEFT");
  const [currentItalicsState, setCurrentItalicsState] = useState(false);
  const [currentBoldState, setCurrentBoldState] = useState(false);
  const [currentUnderscoreState, setCurrentUnderscoreState] = useState(false);
  const [currentStrikethroughState, setCurrentStrikethroughState] = useState(false);
  const [associationWindowOpen, setAssociationWindowOpen] = useState(false);
  const [viewingAssociation, setViewingAssociation] = useState(null);
  const [exportMenuValue, setExportMenuValue] = React.useState(false);
  const [associationsLoaded, setAssociationsLoaded] = React.useState(false);
  const [blocksLoaded, setBlocksLoaded] = React.useState(false);
  const { collapseSidebar, collapsed } = useProSidebar();

  let lastRetrievedBlockKey = "";

  const handleAssociationClick = (association, event) => {
    const newAssociation = { ...association };
    setViewingAssociation(newAssociation);
    setAssociationWindowOpen(true);
  };

  const handleAssociationContextMenu = (name, type, event) => {
    setCurrentRightClickedAssoc(formatBlankAssociation(type, name));
    associationClickCMRef.current.show(event);
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

  const exportDoc = async (type) => {
    const exp = new Exporter(selectedStory.story_id);
    const htmlData = await exp.DocToHTML();
    try {
      const response = await fetch("/api/stories/" + selectedStory.story_id + "/export", {
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
          dispatch(setAlertTitle("Insufficient subscription"));
          dispatch(setAlertMessage("Free accounts are unable to export their stories."));
          dispatch(setAlertLink({ location: "subscribe" }));
          dispatch(setAlertSeverity("error"));
          dispatch(setAlertTimeout(null));
          dispatch(setAlertOpen(true));
          return;
        } else {
          throw new Error("Fetch problem export " + response.status);
        }
      }
      const json = await response.json();

      window.open(json.url, "_blank");
    } catch (error) {
      console.error(error);
      dispatch(
        setAlertMessage(
          "Unable to export your document at this time. Please try again later, or contact support@richdocter.io."
        )
      );
      dispatch(setAlertSeverity("error"));
      dispatch(setAlertTimeout(null));
      dispatch(setAlertOpen(true));
    }
  };

  const getAllAssociations = async () => {
    associations.splice(0);
    return fetch("/api/stories/" + selectedStory.story_id + "/associations")
      .then((response) => {
        if (response.ok) {
          return response.json();
        }
        throw new Error("Fetch problem associations " + response.status);
      })
      .then((data) => {
        data.forEach((assoc) => {
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
  };

  const showGreeting = () => {
    dispatch(setAlertTitle("INFO"));
    dispatch(
      setAlertMessage(
        "This is a new document.\nYou can create an association by typing some text, selecting any of it, and right-clicking on your highlighted text.\nYou can manage chapters by opening the menu on the right."
      )
    );
    dispatch(setAlertSeverity("info"));
    dispatch(setAlertTimeout(20000));
    dispatch(setAlertOpen(true));
  };

  const processDBBlock = (content, block) => {
    if (block.getData().STYLES) {
      block.getData().STYLES.forEach((style) => {
        const styleSelection = new SelectionState({
          focusKey: block.key,
          anchorKey: block.key,
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
    if (block.getData().ENTITY_TABS) {
      block.getData().ENTITY_TABS.forEach((tab) => {
        const tabSelection = new SelectionState({
          focusKey: block.getKey(),
          anchorKey: block.getKey(),
          anchorOffset: tab.start,
          focusOffset: tab.end,
        });
        const contentStateWithEntity = content.createEntity("TAB", "IMMUTABLE");
        const entityKey = contentStateWithEntity.getLastCreatedEntityKey();
        content = Modifier.replaceText(contentStateWithEntity, tabSelection, GenerateTabCharacter(), null, entityKey);
      });
    }
    return content;
  };

  const getBatchedStoryBlocks = async (startKey) => {
    return fetch(
      "/api/stories/" + selectedStory.story_id + "/content?key=" + startKey + "&chapter=" + selectedChapter.id
    )
      .then((response) => {
        if (response.ok) {
          return response.json();
        }
        throw new Error(response.status);
      })
      .then((data) => {
        data.last_evaluated_key && data.last_evaluated_key.key_id.Value
          ? (lastRetrievedBlockKey = data.last_evaluated_key.key_id.Value)
          : (lastRetrievedBlockKey = null);
        const newBlocks = [];
        if (data.items) {
          data.items.forEach((piece) => {
            if (piece.chunk && piece.chunk.Value) {
              const jsonBlock = JSON.parse(piece.chunk.Value);
              const block = new ContentBlock({
                characterList: jsonBlock.characterList,
                depth: jsonBlock.depth,
                key: piece.key_id.Value,
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

        const contentState = {
          entityMap: {},
          blocks: newBlocks,
        };
        let newContentState = convertFromRaw(contentState);
        newBlocks.forEach((block) => {
          if (block.getText().length) {
            newContentState = processDBBlock(newContentState, block);
          }
        });
        setEditorState(EditorState.createWithContent(newContentState, createDecorators()));
        setBlocksLoaded(true);
      })
      .catch((error) => {
        console.log("fetch error", error);
        if (parseInt(error.message) !== 404 && parseInt(error.message !== 501)) {
          console.error("get story blocks", error);
          dispatch(setAlertMessage("An error occurred trying to retrieve your content.\nPlease report this."));
          dispatch(setAlertSeverity("error"));
          dispatch(setAlertOpen(true));
        } else {
          showGreeting();
          setEditorState(EditorState.createEmpty(createDecorators()));
        }
        setBlocksLoaded(true);
      });
  };

  const processDBQueue = async () => {
    dbOperationQueue.sort((a, b) => parseInt(a.time) > parseInt(b.time));
    console.log("processing...", dbOperationQueue.length);
    const retryArray = [];
    const i = 0;
    while (i < dbOperationQueue.length) {
      const op = dbOperationQueue[i];
      switch (op.type) {
        case "delete": {
          const minifiedOps = FilterAndReduceDBOperations(dbOperationQueue, op, i);
          try {
            await deleteBlocksFromServer(minifiedOps, op.storyID, op.chapterID);
          } catch (retry) {
            if (retry !== true) {
              console.error(retry);
              dbOperationQueue.splice(i, 1);
              continue;
            }
            retryArray.push({ story: op.story, chapter: op.chapter, type: op.type, ops: minifiedOps, time: op.time });
            console.error("server response 501, retrying...");
          }
          break;
        }
        case "save": {
          const minifiedOps = FilterAndReduceDBOperations(dbOperationQueue, op, i);
          try {
            await saveBlocksToServer(minifiedOps, op.story, op.chapter);
          } catch (retry) {
            if (retry !== true) {
              console.error(retry);
              dbOperationQueue.splice(i, 1);
              continue;
            }
            retryArray.push({ story: op.story, chapter: op.chapter, type: op.type, ops: minifiedOps, time: op.time });
            console.error("server response 501, retrying...");
          }
          break;
        }
        case "syncOrder": {
          try {
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
    dbOperationQueue.push(...retryArray);
  };

  const setFocusAndRestoreCursor = () => {
    const selection = editorState.getSelection();
    const newSelection = selection.merge({
      anchorOffset: selection.getIsBackward() ? selection.getAnchorOffset() : selection.getFocusOffset(),
      focusOffset: selection.getIsBackward() ? selection.getAnchorOffset() : selection.getFocusOffset(),
    });
    domEditor.current.focus();
    return EditorState.forceSelection(editorState, newSelection);
  };

  const handleScroll = (e) => {
    const bottom = e.target.scrollHeight - e.target.scrollTop === e.target.clientHeight;
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
          selectedStory.chapters.forEach((chapter) => {
            if (chapter.id === selectedChapter.id) {
              setSelectedChapter(chapter);
              return;
            }
          });
        }
      }
    }

    return () => {
      clearInterval(processInterval);
      window.removeEventListener("unload", processDBQueue);
    };
  }, [isLoggedIn, selectedStory, selectedChapter.id, lastRetrievedBlockKey, associationsLoaded, blocksLoaded]);

  const syncBlockOrderMap = (blockList) => {
    return new Promise(async (resolve, reject) => {
      try {
        const params = {};
        params.chapter_id = selectedChapter.id;
        params.blocks = [];
        let index = 0;
        blockList.forEach((block) => {
          params.blocks.push({ key_id: block.getKey(), place: index.toString() });
          index++;
        });
        const response = await fetch("/api/stories/" + selectedStory.story_id + "/orderMap", {
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
          reject("SERVER ERROR ORDERING BLOCKS: ", response.body);
        }
        resolve(response.json());
      } catch (e) {
        reject("ERROR ORDERING BLOCKS: ", e);
      }
    });
  };

  const deleteBlocksFromServer = (blocks, storyID, chapterID) => {
    return new Promise(async (resolve, reject) => {
      try {
        const params = {};
        params.chapter_id = chapterID;
        params.blocks = blocks;
        console.log("del", storyID, chapterID, blocks);
        const response = await fetch("/api/stories/" + storyID + "/block", {
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
          reject("SERVER ERROR DELETING BLOCK: ", response.body);
        }
        resolve(response.json());
      } catch (e) {
        reject("ERROR DELETING BLOCK: ", e);
      }
    });
  };

  const saveBlocksToServer = (blocks, story, chapter) => {
    return new Promise(async (resolve, reject) => {
      try {
        const params = {};
        params.story_id = story;
        params.chapter_id = chapter;
        params.blocks = blocks;
        console.log("saving", blocks);
        const response = await fetch("/api/stories/" + story, {
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
          //   if (response.status === 401) {
          //     dispatch(setAlertMessage("Your story has exceeded the limit for unpaid subscribers."));
          //     dispatch(setAlertLink({ location: "subscribe" }));
          //     dispatch(setAlertSeverity("error"));
          //     dispatch(setAlertTimeout(null));
          //     dispatch(setAlertOpen(true));
          //   }
          reject("SERVER ERROR SAVING BLOCK: ", response);
        }
        resolve(response.json());
      } catch (e) {
        reject("ERROR SAVING BLOCK: ", e);
      }
    });
  };

  const updateAssociationsOnServer = (associations) => {
    return new Promise(async (resolve, reject) => {
      try {
        console.log("saving associations", associations);
        const response = await fetch("/api/stories/" + selectedStory.story_id + "/associations", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(associations),
        });
        if (!response.ok) {
          reject("SERVER ERROR SAVING BLOCK: ", response);
        }
        resolve(response.json());
      } catch (e) {
        reject("ERROR SAVING BLOCK: ", e);
      }
    });
  };

  const saveAssociationsToServer = (associations) => {
    return new Promise(async (resolve, reject) => {
      try {
        console.log("creating associations", associations);
        const response = await fetch("/api/stories/" + selectedStory.story_id + "/associations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(associations),
        });
        if (!response.ok) {
          if (response.status === 401) {
            dispatch(setAlertTitle("Insufficient account"));
            dispatch(setAlertMessage("Free accounts are limited to 10 associations."));
            dispatch(setAlertLink({ location: "subscribe" }));
            dispatch(setAlertSeverity("error"));
            dispatch(setAlertTimeout(null));
            dispatch(setAlertOpen(true));
          }
          reject("SERVER ERROR SAVING BLOCK: ", response);
        }
        resolve(response.json());
      } catch (e) {
        reject("ERROR SAVING BLOCK: ", e);
      }
    });
  };

  const deleteAssociationsFromServer = (associations) => {
    return new Promise(async (resolve, reject) => {
      try {
        const response = await fetch("/api/stories/" + selectedStory.story_id + "/associations", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(associations),
        });
        if (!response.ok) {
          reject("SERVER ERROR SAVING BLOCK: ", response);
        }
        resolve(response.json());
      } catch (e) {
        reject("ERROR SAVING BLOCK: ", e);
      }
    });
  };

  const prepBlocksForSave = (content, blocks, story, chapter) => {
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
        type: "save",
        story: story,
        chapter: chapter,
        time: Date.now(),
        ops: [{ key_id: key, chunk: updatedBlock, place: index.toString() }],
      });
    });
  };

  const keyBindings = (event) => {
    // tab pressed
    if (event.keyCode === 9) {
      event.preventDefault();
      const selection = editorState.getSelection();
      const newEditorState = InsertTab(editorState, selection);
      const content = newEditorState.getCurrentContent();
      const blocksToPrep = [];
      GetSelectedBlockKeys(newEditorState).forEach((key) => {
        blocksToPrep.push(content.getBlockForKey(key));
      });
      setEditorState(newEditorState);
      prepBlocksForSave(content, blocksToPrep, selectedStory.story_id, selectedChapter.id);
    }
    return getDefaultKeyBinding(event);
  };

  const formatBlankAssociation = (type, name) => {
    return {
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

  const onAssociationEdit = async (association) => {
    const storedAssociation = await updateAssociationsOnServer([association]);
    const existingIndex = associations.findIndex((assoc) => assoc.association_id === association.association_id);
    storedAssociation[0].portrait = storedAssociation[0].portrait + "?date=" + Date.now();
    associations[existingIndex] = storedAssociation[0];
    setEditorState(EditorState.set(editorState, { decorator: createDecorators() }));
  };

  const handleMenuItemClick = async (event, type) => {
    event.originalEvent.preventDefault();
    const text = GetSelectedText(editorState);
    if (text.length) {
      // check if !contains
      const newAssociation = formatBlankAssociation(type, text);
      const withSelection = setFocusAndRestoreCursor();
      try {
        const storedAssociation = await saveAssociationsToServer([newAssociation]);
        newAssociation.portrait = storedAssociation[0].portrait;
        newAssociation.association_id = storedAssociation[0].association_id;
        associations.push(newAssociation);
        const newEditorState = EditorState.set(withSelection, { decorator: createDecorators() });
        setEditorState(newEditorState);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleDeleteAssociationClick = ({ event }) => {
    const ind = associations.findIndex((assoc) => {
      return (
        assoc.association_type === currentRightClickedAssoc.association_type &&
        assoc.association_name === currentRightClickedAssoc.association_name
      );
    });
    console.log("ind", ind);
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
  };

  const handleTextCopy = (event) => {
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
  };

  const handleContextMenu = (event) => {
    event.preventDefault();
    const text = GetSelectedText(editorState);
    if (text.length) {
      selectedTextCMRef.current.show(event);
    }
  };

  const handleStyleClick = (event, style) => {
    event.preventDefault();
    const originalSelectionState = editorState.getSelection();
    const newEditorState = RichUtils.toggleInlineStyle(editorState, style);
    let newContent = newEditorState.getCurrentContent();
    const selectedKeys = GetSelectedBlockKeys(newEditorState);
    const updatedBlocks = [];
    selectedKeys.forEach((key) => {
      const modifiedBlock = newEditorState.getCurrentContent().getBlockForKey(key);
      const newStyles = [];
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
    setNavButtonState(style);
  };

  const handleKeyCommand = (command) => {
    let newEditorState = editorState;
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
          tabs.forEach((tab) => {
            if (postSelection.hasEdgeWithin(key, tab.start, tab.end)) {
              tabs.splice(tabs.indexOf(tab), 1);
            }
          });
          const contentStateWithNewData = Modifier.mergeBlockData(
            content,
            selection,
            Immutable.Map([["ENTITY_TABS", tabs]])
          );
          newEditorState = EditorState.push(newEditorState, contentStateWithNewData);
        }
      });
    }
    setEditorState(RichUtils.handleKeyCommand(newEditorState, command));
  };

  const resetNavButtonStates = () => {
    setCurrentBoldState(false);
    setCurrentItalicsState(false);
    setCurrentUnderscoreState(false);
    setCurrentStrikethroughState(false);
    setCurrentBlockAlignment("LEFT");
  };

  const setNavButtonState = (style, value) => {
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

  const adjustBlockDataPositions = (newEditorState, newBlock) => {
    let content = newEditorState.getCurrentContent();
    const styleData = newBlock.getData().getIn(["STYLES"]);
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

  const updateEditorState = (newEditorState, isPasteAction) => {
    resetNavButtonStates();
    const selection = newEditorState.getSelection();
    const block = newEditorState.getCurrentContent().getBlockForKey(selection.getFocusKey());
    for (const entry in styleMap) {
      const styles = GetBlockStyleDataByType(block, entry);
      styles.forEach((style) => {
        if (selection.hasEdgeWithin(block.getKey(), style.start, style.end)) {
          setNavButtonState(style.style, true);
        } else {
          setNavButtonState(style.style, false);
        }
      });
    }
    const data = block.getData();
    const alignment = data.getIn(["ALIGNMENT"]) ? data.getIn(["ALIGNMENT"]) : "LEFT";
    setCurrentBlockAlignment(alignment);

    // Cursor has moved but no text changes detected
    if (editorState.getCurrentContent() === newEditorState.getCurrentContent()) {
      console.log("cursor action");
      setEditorState(newEditorState);
      return;
    }

    const newContent = newEditorState.getCurrentContent();
    const newBlockMap = newContent.getBlockMap();
    const oldContent = editorState.getCurrentContent();
    const oldBlockMap = oldContent.getBlockMap();
    const selectedKeys = GetSelectedBlockKeys(editorState);

    const blocksToSave = [];
    const blocksToDelete = [];
    let resyncRequired = false;
    oldBlockMap.forEach((oldBlock, oldBlockKey) => {
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
    });
    newBlockMap.forEach((newBlock, newBlockKey) => {
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
    });
    if (isPasteAction) {
      resyncRequired = true;
    }
    setEditorState(newEditorState);

    if (blocksToDelete.length) {
      const deleteOp = {};
      deleteOp.type = "delete";
      deleteOp.time = Date.now();
      deleteOp.storyID = selectedStory.story_id;
      deleteOp.chapterID = selectedChapter.id;
      deleteOp.ops = [];
      blocksToDelete.forEach((blockKey) => {
        deleteOp.ops.push({ key_id: blockKey });
      });
      dbOperationQueue.push(deleteOp);
    }

    if (blocksToSave.length) {
      const updatedContent = newEditorState.getCurrentContent();
      const blocksToPrep = [];
      blocksToSave.forEach((key) => {
        blocksToPrep.push(updatedContent.getBlockForKey(key));
      });
      prepBlocksForSave(updatedContent, blocksToPrep, selectedStory.story_id, selectedChapter.id);
    }

    if (resyncRequired) {
      dbOperationQueue.push({ type: "syncOrder", blockList: newBlockMap, time: Date.now() });
    }
  };

  const handlePasteAction = (text) => {
    const blockMap = ContentState.createFromText(text).getBlockMap();
    /*
    if (blockMap.size > 100) {
      console.error('Pasting more than 100 paragraphs at a time is not allowed.');
      return true;
    }*/
    const newState = Modifier.replaceWithFragment(
      editorState.getCurrentContent(),
      editorState.getSelection(),
      blockMap
    );
    updateEditorState(EditorState.push(editorState, newState, "insert-fragment"), true);
    return true;
  };

  const setFocus = () => {
    domEditor.current.focus();
  };

  const getBlockStyles = (contentBlock) => {
    const data = contentBlock.getData();
    let classStr = "";
    const alignment = data.getIn(["ALIGNMENT"]) ? data.getIn(["ALIGNMENT"]) : "LEFT";
    classStr += alignment;
    const lineHeight = data.getIn(["LINE_HEIGHT"]) ? data.getIn(["LINE_HEIGHT"]) : "LINEHEIGHT_DOUBLE";
    classStr += " " + lineHeight;
    classStr += " content-block";
    return classStr;
  };

  const updateBlockAlignment = (event, alignment) => {
    let newContentState = editorState.getCurrentContent();
    const selectedKeys = GetSelectedBlockKeys(editorState);
    const blocksToPrep = [];
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
    setNavButtonState(alignment);
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

  const onChapterClick = (id, title, num) => {
    if (id !== selectedChapter.id) {
      setBlocksLoaded(false);
      setSelectedChapter({
        id: id,
        chapter_title: title,
        chapter_num: num,
      });
      const history = window.history;
      const storyID = selectedStory.story_id;
      history.pushState({ storyID }, "changed chapter", "/story/" + selectedStory.story_id + "?chapter=" + id);
      if (domEditor.current) {
        const editorBox = domEditor.current.editorContainer.parentElement;
        editorBox.scrollTop = 0;
      }
      onExpandChapterMenu();
    }
  };

  const onNewChapterClick = () => {
    const newChapterNum = selectedStory.chapters.length + 1;
    const newChapterTitle = "Chapter " + newChapterNum;
    fetch("/api/stories/" + selectedStory.story_id + "/chapter", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ chapter_title: newChapterTitle, chapter_num: newChapterNum }),
    })
      .then(async (response) => {
        if (response.ok) {
          const json = await response.json();
          const newChapters = [...selectedStory.chapters];
          newChapters.push({ id: json.id, chapter_title: newChapterTitle, chapter_num: newChapterNum });
          const updatedSelectedStory = { ...selectedStory };
          updatedSelectedStory.chapters = newChapters;
          setSelectedChapter({
            id: json.id,
            chapter_title: newChapterTitle,
            chapter_num: newChapterNum,
          });
          dispatch(setSelectedStory(updatedSelectedStory));
          const history = window.history;
          const storyID = selectedStory.story_id;
          history.pushState(
            { storyID },
            "created chapter",
            "/story/" + selectedStory.story_id + "?chapter=" + newChapterNum
          );
          setEditorState(EditorState.createEmpty(createDecorators()));
        } else {
          throw new Error("Fetch problem creating chapter " + response.status, response.statusText);
        }
      })
      .catch((error) => {
        console.error(error);
      });
  };

  const onDeleteChapterClick = (event, chapterID, chapterTitle) => {
    event.stopPropagation();
    if (selectedStory.chapters.length === 1) {
      dispatch(setAlertMessage("You cannot delete a story's only chapter."));
      dispatch(setAlertSeverity("info"));
      dispatch(setAlertOpen(true));
      return;
    }

    const confirm = window.confirm("Delete " + chapterTitle + " from " + selectedStory.title + "?");
    if (confirm) {
      fetch("/api/stories/" + selectedStory.story_id + "/chapter/" + chapterID, {
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
                  chapter_title: prevChapter.chapter_title,
                  chapter_num: prevChapter.chapter_num,
                });
              } else {
                setEditorState(EditorState.createEmpty(createDecorators()));
                setSelectedChapter({
                  id: null,
                  chapter_title: "",
                  chapter_num: null,
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
  };

  const onStoryTitleEdit = async (event) => {
    if (event.target.value !== selectedStory.title && event.target.value.trim() !== "") {
      const updatedStory = { ...selectedStory };
      updatedStory.title = event.target.value;
      dispatch(setSelectedStory(updatedStory));
      const formData = new FormData();
      for (const key in updatedStory) {
        if (updatedStory.hasOwnProperty(key)) {
          formData.append(key, updatedStory[key]);
        }
      }
      const response = await fetch("/api/stories/" + updatedStory.story_id + "/details", {
        method: "PUT",
        body: formData,
      });
      if (!response.ok) {
        console.error(response.body);
        dispatch(setAlertMessage("There was an error updating your title."));
        dispatch(setAlertSeverity("error"));
        dispatch(setAlertOpen(true));
        return;
      }
    }
  };

  const onChapterTitleEdit = async (event) => {
    if (event.target.value !== selectedChapter.chapter_title) {
      if (event.target.value !== selectedChapter.chapter_title && event.target.value.trim() !== "") {
        const updatedChapter = { ...selectedChapter };
        updatedChapter.chapter_title = event.target.value;
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
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updatedChapter),
        });
        if (!response.ok) {
          console.error(response.body);
          dispatch(setAlertMessage("There was an error updating your chapter."));
          dispatch(setAlertSeverity("error"));
          dispatch(setAlertOpen(true));
          return;
        }
      }
    }
  };

  const onChapterDragEnd = async (result) => {
    if (!result.destination) {
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
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updatedChapters),
    });
    if (!response.ok) {
      console.error(response.body);
      dispatch(setAlertMessage("There was an error updating your chapters."));
      dispatch(setAlertSeverity("error"));
      dispatch(setAlertOpen(true));
      return;
    }
  };

  const textSelectedContextItems = [
    {
      label: "Copy",
      command: handleTextCopy,
    },
    {
      label: "Create Association",
      items: [
        {
          label: "Character",
          command: (event) => {
            handleMenuItemClick(event, ASSOCIATION_TYPE_CHARACTER);
          },
        },
        {
          label: "Place",
          command: (event) => {
            handleMenuItemClick(event, ASSOCIATION_TYPE_PLACE);
          },
        },
        {
          label: "Event",
          command: (event) => {
            handleMenuItemClick(event, ASSOCIATION_TYPE_EVENT);
          },
        },
      ],
    },
  ];

  const associationHoveredContextItems = [
    {
      label: "Delete Association",
      command: handleDeleteAssociationClick,
    },
  ];

  return (
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
          <EditableText textValue={selectedChapter.chapter_title} onTextChange={onChapterTitleEdit} />
        </h3>
      </div>
      <nav className="rich-controls">
        <div>
          <span className="controls-row">
            <button
              className={currentBoldState ? "active" : ""}
              onMouseDown={(e) => {
                handleStyleClick(e, "BOLD");
              }}>
              <b>B</b>
            </button>
            <button
              className={currentItalicsState ? "active" : ""}
              onMouseDown={(e) => {
                handleStyleClick(e, "ITALIC");
              }}>
              <i>I</i>
            </button>
            <button
              className={currentUnderscoreState ? "active" : ""}
              onMouseDown={(e) => {
                handleStyleClick(e, "UNDERLINE");
              }}>
              <u>U</u>
            </button>
            <button
              className={currentStrikethroughState ? "active" : ""}
              onMouseDown={(e) => {
                handleStyleClick(e, "STRIKETHROUGH");
              }}>
              <s>S</s>
            </button>
          </span>
          <span className="controls-row">
            <button
              className={currentBlockAlignment === "LEFT" ? "active" : ""}
              onMouseDown={(e) => {
                updateBlockAlignment(e, "LEFT");
              }}>
              <FontAwesomeIcon icon={faAlignLeft} />
            </button>
            <button
              className={currentBlockAlignment === "CENTER" ? "active" : ""}
              onMouseDown={(e) => {
                updateBlockAlignment(e, "CENTER");
              }}>
              <FontAwesomeIcon icon={faAlignCenter} />
            </button>
            <button
              className={currentBlockAlignment === "RIGHT" ? "active" : ""}
              onMouseDown={(e) => {
                updateBlockAlignment(e, "RIGHT");
              }}>
              <FontAwesomeIcon icon={faAlignRight} />
            </button>
            <button
              className={currentBlockAlignment === "JUSTIFY" ? "active" : ""}
              onMouseDown={(e) => {
                updateBlockAlignment(e, "JUSTIFY");
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
                      document.activeElement.blur();
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
              <IconButton aria-label="exit" component="label" onClick={onExitDocument}>
                <CloseIcon
                  sx={{
                    color: "#F0F0F0",
                  }}
                />
              </IconButton>
            </span>
          </span>
        </div>
      </nav>
      <section
        onContextMenu={(e) => {
          handleContextMenu(e);
        }}
        onDoubleClick={(e) => {
          if (isMobile) {
            handleContextMenu(e);
          }
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
      <PrimeReactProvider>
        <ContextMenu
          className="custom-context"
          children="true"
          ref={selectedTextCMRef}
          model={textSelectedContextItems}
        />
        <ContextMenu
          className="custom-context"
          children="true"
          ref={associationClickCMRef}
          model={associationHoveredContextItems}
        />
      </PrimeReactProvider>
      <div className="sidebar-container">
        <div className="handle" onClick={onExpandChapterMenu}>
          chapters
        </div>
        <Sidebar rtl={true} collapsedWidth={0} defaultCollapsed={true}>
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
                                  onClick={() =>
                                    onChapterClick(chapter.id, chapter.chapter_title, chapter.chapter_num)
                                  }>
                                  {chapter.chapter_title}
                                  {selectedStory.chapters.length > 1 ? (
                                    <IconButton
                                      className="menu-icon"
                                      edge="end"
                                      size="small"
                                      aria-label="delete chapter"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        onDeleteChapterClick(event, chapter.id, chapter.chapter_title);
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
            <MenuItem key="add_chapter_btn">
              <Button
                onClick={onNewChapterClick}
                variant="outlined"
                sx={{ color: "#FFF" }}
                startIcon={<AddIcon sx={{ marginLeft: "5px" }} />}>
                New
              </Button>
            </MenuItem>
          </SideMenu>
        </Sidebar>
        ;
      </div>
    </div>
  );
};

export default Document;
