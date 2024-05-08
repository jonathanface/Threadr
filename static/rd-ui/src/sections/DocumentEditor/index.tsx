import Immutable from "immutable";
import React, { useEffect, useRef, useState } from "react";

import {
  BlockMap,
  CharacterMetadata,
  CompositeDecorator,
  ContentBlock,
  ContentState,
  DraftHandleValue,
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

import { useProSidebar } from "react-pro-sidebar";
import { TypedUseSelectorHook, useDispatch, useSelector } from "react-redux";
import "../../css/sidebar.css";
import { setAlert } from "../../stores/alertSlice";
import { AppDispatch, RootState } from "../../stores/store";
import { setSelectedStory } from "../../stores/storiesSlice";
import { setIsLoaderVisible, setIsSubscriptionFormOpen } from "../../stores/uiSlice";
import {
  APIError,
  Association,
  AssociationType,
  BlockOrderMap,
  BlocksForServer,
  Chapter,
  CharMetadata,
  DBOperation,
  DBOperationTask,
  DBOperationType,
  DocumentBlockStyle,
  DocumentTab,
  Story,
} from "../../types";
import { AlertToastType } from "../../utils/Toaster";
import ContextMenu from "../ContextMenu";
import AssociationUI from "./AssociationUI";
import DocumentSidebar from "./DocumentSidebar";
import DocumentToolbar, { BlockAlignmentType, DocumentToolbarRef } from "./DocumentToolbar";
import EditableText from "./EditableText";
import { FindHighlightable, FindTabs, HighlightSpan, TabSpan } from "./decorators";
import docStyles from "./document-editor.module.css";
import {
  GenerateTabCharacter,
  GetBlockStyleDataByType,
  GetEntityData,
  GetSelectedBlockKeys,
  GetSelectedText,
  InsertTab,
  ReplaceCharacters,
  documentStyleMap,
  filterAndReduceDBOperations,
} from "./utilities";

const DB_OP_INTERVAL = 5000;

const associations: Association[] = [];

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

const defaultText = getWritingPrompt();

interface DocumentEditorProps {}

const dbOperationQueue: DBOperation[] = [];

const DocumentEditor = (props: DocumentEditorProps) => {
  const domEditor = useRef<Editor>(null);
  const navbarRef = useRef<DocumentToolbarRef>(null);
  const useAppDispatch: () => AppDispatch = useDispatch;
  const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
  const dispatch = useAppDispatch();

  const urlParams = new URLSearchParams(window.location.search);

  const selectedStory = useAppSelector((state) => state.stories.selectedStory);
  const isLoggedIn = useAppSelector((state) => state.user.isLoggedIn);

  const [selectedChapter, setSelectedChapter] = useState<Chapter>({
    id: urlParams.get("chapter") ? (urlParams.get("chapter") as string) : "",
    title: "",
    place: 1,
    story_id: selectedStory?.story_id ? selectedStory.story_id : "",
  });

  const [currentRightClickedAssoc, setCurrentRightClickedAssoc] = useState<Association | null>(null);
  const [associationWindowOpen, setAssociationWindowOpen] = useState(false);
  const [viewingAssociation, setViewingAssociation] = useState<Association | null>(null);
  const [selectedContextMenuVisible, setSelectedContextMenuVisible] = useState(false);
  const [associationContextMenuVisible, setAssociationContextMenuVisible] = useState(false);
  const [selectedContextMenuX, setSelectedContextMenuX] = useState(0);
  const [selectedContextMenuY, setSelectedContextMenuY] = useState(0);
  const [associationContextMenuX, setAssociationContextMenuX] = useState(0);
  const [associationContextMenuY, setAssociationContextMenuY] = useState(0);
  const [isSpellcheckOn, setIsSpellcheckOn] = useState(true);
  const [activeFont, setActiveFont] = useState("inherit");

  const [associationsLoaded, setAssociationsLoaded] = useState(false);
  const [blocksLoaded, setBlocksLoaded] = useState(false);
  const { collapseSidebar, collapsed } = useProSidebar();

  let lastRetrievedBlockKey: string | null = null;

  const handleAssociationClick = (association: Association, event: React.MouseEvent) => {
    const newAssociation = { ...association };
    setViewingAssociation(newAssociation);
    setAssociationWindowOpen(true);
  };

  const handleAssociationContextMenu = (name: string, type: AssociationType, event: React.MouseEvent) => {
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

  const getAllAssociations = async () => {
    if (selectedStory) {
      associations.splice(0);
      return fetch("/api/stories/" + selectedStory.story_id + "/associations")
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
          const newEditorState = EditorState.set(editorState, { decorator: createDecorators() });
          setEditorState(newEditorState);
        })
        .catch((error) => {
          console.error("get story associations", error);
        });
    }
  };

  const showGreeting = () => {
    const newAlert = {
      title: "INFO",
      message:
        "This is a new document.\nYou can create an association by typing some text, selecting any of it, and right-clicking on your highlighted text.\nYou can manage chapters by opening the menu on the right.",
      timeout: 20000,
      severity: AlertToastType.info,
      open: true,
    };
    dispatch(setAlert(newAlert));
  };

  const processBlockData = (content: ContentState, block: ContentBlock) => {
    const blockData = block.getData();
    if (blockData.has("STYLES")) {
      blockData.getIn(["STYLES"]).forEach((style: DocumentBlockStyle) => {
        try {
          const name = style.style ? style.style : style.name;
          const styleSelection = new SelectionState({
            focusKey: block.getKey(),
            anchorKey: block.getKey(),
            focusOffset: style.end,
            anchorOffset: style.start,
          });
          content = Modifier.applyInlineStyle(content, styleSelection, name);
        } catch (error) {
          console.error(error);
        }
      });
    }
    if (blockData.has("ENTITY_TABS")) {
      const tabText = GenerateTabCharacter();
      blockData.getIn(["ENTITY_TABS"]).forEach((tab: DocumentTab) => {
        const tabSelection = new SelectionState({
          focusKey: block.getKey(),
          anchorKey: block.getKey(),
          anchorOffset: tab.start,
          focusOffset: tab.end,
        });
        const contentStateWithEntity = content.createEntity("TAB", "IMMUTABLE");
        const entityKey = contentStateWithEntity.getLastCreatedEntityKey();
        content = Modifier.replaceText(contentStateWithEntity, tabSelection, tabText, undefined, entityKey);
      });
    }
    return content;
  };

  const getBatchedStoryBlocks = async (startKey: string) => {
    if (selectedStory) {
      return fetch(
        "/api/stories/" + selectedStory.story_id + "/content?key=" + startKey + "&chapter=" + selectedChapter.id
      )
        .then((response) => {
          if (response.ok) {
            return response.json();
          }
          throw new Error(response.status.toString());
        })
        .then((data) => {
          data.last_evaluated_key && data.last_evaluated_key.key_id.Value
            ? (lastRetrievedBlockKey = data.last_evaluated_key.key_id.Value)
            : (lastRetrievedBlockKey = null);
          const newBlocks: ContentBlock[] = [];
          if (data.items) {
            data.items.forEach((piece: any) => {
              if (piece.chunk && piece.chunk.Value) {
                const jsonBlock = JSON.parse(piece.chunk.Value);
                const characterListImmutable = Immutable.List(
                  jsonBlock.characterList.map((char: CharMetadata) => {
                    // Convert each character metadata object to a DraftJS CharacterMetadata
                    return CharacterMetadata.create({
                      style: Immutable.OrderedSet(char.style),
                      entity: char.entity,
                    });
                  })
                );
                const block = new ContentBlock({
                  characterList: characterListImmutable,
                  depth: jsonBlock.depth,
                  key: piece.key_id.Value,
                  text: jsonBlock.text ? jsonBlock.text : "",
                  type: jsonBlock.type,
                  data: jsonBlock.data ? Immutable.Map(jsonBlock.data) : Immutable.Map(),
                });
                newBlocks.push(block);
              }
            });
            if (newBlocks.length === 1 && !newBlocks[0].getText().length) {
              showGreeting();
            }
          }

          const newContentState = ContentState.createFromBlockArray(newBlocks);
          let contentStateWithStyles = newContentState;
          newContentState.getBlocksAsArray().forEach((block) => {
            contentStateWithStyles = processBlockData(contentStateWithStyles, block);
          });
          setEditorState(EditorState.createWithContent(newContentState, createDecorators()));
          if (domEditor.current) {
            const editorBox = domEditor.current.editorContainer?.parentElement;
            if (editorBox) {
              editorBox.scrollTop = 0;
              window.scrollTo(0, 0);
            }
          }
          setBlocksLoaded(true);
        })
        .catch((error) => {
          console.error("fetch story blocks error", error);
          if (parseInt(error.message) !== 404 && parseInt(error.message) !== 501) {
            console.error("get story blocks", error, error);
            const newAlert = {
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
          if (domEditor.current) {
            const editorBox = domEditor.current.editorContainer?.parentElement;
            if (editorBox) {
              editorBox.scrollTop = 0;
            }
          }
          setBlocksLoaded(true);
        });
    }
  };

  const isAPIError = (error: any): boolean => {
    return "statusCode" in error && "statusText" in error && "retry" in error;
  };

  let retryCount = 0;
  const processDBQueue = async () => {
    dbOperationQueue.sort((a, b) => a.time - b.time);
    console.log("processing...", dbOperationQueue.length);
    const retryArray: DBOperation[] = [];
    const i = 0;
    while (i < dbOperationQueue.length) {
      const op = dbOperationQueue[i];
      switch (op.type) {
        case DBOperationType.delete: {
          const minifiedOps = filterAndReduceDBOperations(dbOperationQueue, op.type, i);
          try {
            await deleteBlocksFromServer(minifiedOps, op.storyID, op.chapterID);
            retryCount = 0;
          } catch (error: any) {
            if (isAPIError(error)) {
              if (error.retry) {
                console.error("server response " + error.statusCode + ", retrying...");
                const retryOp: DBOperation = {
                  type: DBOperationType.delete,
                  ops: minifiedOps,
                  storyID: op.storyID,
                  chapterID: op.chapterID,
                  time: new Date().getTime(),
                };
                retryArray.push(retryOp);
                retryCount++;
              }
            }
          }
          break;
        }
        case DBOperationType.save: {
          const minifiedOps = filterAndReduceDBOperations(dbOperationQueue, op.type, i);
          try {
            await saveBlocksToServer(minifiedOps, op.storyID, op.chapterID);
            retryCount = 0;
          } catch (error: any) {
            if (isAPIError(error)) {
              if (error.retry) {
                console.error("server response " + error.statusCode + ", retrying...");
                const retryOp: DBOperation = {
                  type: DBOperationType.save,
                  ops: minifiedOps,
                  storyID: op.storyID,
                  chapterID: op.chapterID,
                  time: new Date().getTime(),
                };
                retryCount++;
                retryArray.push(retryOp);
              }
            }
          }
          break;
        }
        case DBOperationType.syncOrder: {
          try {
            if (op.blockList) {
              await syncBlockOrderMap(op.blockList);
              dbOperationQueue.splice(i, 1);
              retryCount = 0;
            }
          } catch (error: any) {
            if (error as APIError) {
              if (error.retry) {
                console.error("server response " + error.statusCode + ", retrying...");
                retryArray.push(dbOperationQueue[i]);
                retryCount++;
              }
              dbOperationQueue.splice(i, 1);
            }
          }
          break;
        }
        default:
          console.error("invalid operation:", op);
      }
    }
    dbOperationQueue.push(...retryArray);
    if (retryCount === 10) {
      console.warn("ERROR SAVING");
      const newAlert = {
        title: "Unable to sync",
        message:
          "We are experiencing difficulty contacting the server. We'll keep attempting to save your work as long as you leave this window open, however we suggest you save a local copy of your current work.",
        severity: AlertToastType.warning,
        open: true,
        timeout: 6000,
      };
      dispatch(setAlert(newAlert));
    }
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

  const handleScroll = (e: React.UIEvent<HTMLElement>) => {
    const bottom = e.currentTarget.scrollHeight - e.currentTarget.scrollTop === e.currentTarget.clientHeight;
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
    console.log("main effect", isLoggedIn, selectedStory, associationsLoaded, blocksLoaded);
    if (isLoggedIn) {
      if (selectedStory) {
        if (!associationsLoaded && blocksLoaded) {
          getAllAssociations();
        }
        if (!blocksLoaded) {
          getBatchedStoryBlocks("");
        }
      }
    }

    return () => {
      clearInterval(processInterval);
      window.removeEventListener("unload", processDBQueue);
    };
  }, [isLoggedIn, selectedStory?.story_id, lastRetrievedBlockKey, blocksLoaded]);

  useEffect(() => {
    if (associationsLoaded && blocksLoaded) {
      dispatch(setIsLoaderVisible(false));
    }
  }, [associationsLoaded, blocksLoaded]);

  useEffect(() => {
    getChapterDetails();
    setBlocksLoaded(false);
  }, [selectedChapter.id, selectedStory?.story_id]);

  const syncBlockOrderMap = (blockList: BlockMap) => {
    return new Promise(async (resolve, reject) => {
      try {
        if (selectedStory) {
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
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(params),
          });
          if (!response.ok) {
            const error: APIError = {
              statusCode: response.status,
              statusText: response.statusText,
              retry: true,
            };
            reject(error);
            return;
          }
          resolve(response.json());
        }
      } catch (e) {
        console.error("ERROR ORDERING BLOCKS: " + e);
        reject(e);
      }
    });
  };

  const deleteBlocksFromServer = (ops: DBOperationTask[], storyID: string, chapterID: string) => {
    return new Promise(async (resolve, reject) => {
      try {
        const params: BlocksForServer = {
          story_id: storyID,
          chapter_id: chapterID,
          blocks: ops,
        };
        const response = await fetch("/api/stories/" + storyID + "/block", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(params),
        });

        if (!response.ok) {
          const error: APIError = {
            statusCode: response.status,
            statusText: response.statusText,
            retry: true,
          };
          reject(error);
          return;
        }
        resolve(response.json());
      } catch (e) {
        console.error("ERROR DELETING BLOCK: " + e);
        reject(e);
      }
    });
  };

  const saveBlocksToServer = (ops: DBOperationTask[], storyID: string, chapterID: string) => {
    return new Promise(async (resolve, reject) => {
      try {
        const params: BlocksForServer = {
          story_id: storyID,
          chapter_id: chapterID,
          blocks: ops,
        };
        console.log("saving", ops);
        const response = await fetch("/api/stories/" + storyID, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(params),
        });
        if (!response.ok) {
          const error: APIError = {
            statusCode: response.status,
            statusText: response.statusText,
            retry: true,
          };
          reject(error);
          return;
        }
        resolve(response.json());
      } catch (e) {
        console.error("ERROR SAVING BLOCK: " + e);
        reject(e);
      }
    });
  };

  const updateAssociationsOnServer = (associations: Association[]): Promise<Association[]> => {
    return new Promise(async (resolve, reject) => {
      try {
        if (selectedStory) {
          console.log("saving associations", associations);
          const response = await fetch("/api/stories/" + selectedStory.story_id + "/associations", {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(associations),
          });
          if (!response.ok) {
            reject("SERVER ERROR SAVING BLOCK: " + response);
          }
          resolve(response.json());
        }
      } catch (e) {
        reject("ERROR SAVING BLOCK: " + e);
      }
    });
  };

  const saveAssociationsToServer = (associations: Association[]): Promise<Association[]> => {
    return new Promise(async (resolve, reject) => {
      try {
        if (selectedStory) {
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
              const alertFunction = {
                func: () => {
                  setIsSubscriptionFormOpen(true);
                },
                text: "subscribe",
              };
              const newAlert = {
                title: "Insufficient subscription",
                message: "Free accounts are limited to 10 associations.",
                severity: AlertToastType.warning,
                open: true,
                timeout: 6000,
                func: alertFunction,
              };
              dispatch(setAlert(newAlert));
            }
            reject("SERVER ERROR SAVING BLOCK: " + response);
          }
          resolve(response.json());
        }
      } catch (e) {
        reject("ERROR SAVING BLOCK: " + e);
      }
    });
  };

  const deleteAssociationsFromServer = (associations: Association[]) => {
    return new Promise(async (resolve, reject) => {
      try {
        if (selectedStory) {
          const response = await fetch("/api/stories/" + selectedStory.story_id + "/associations", {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(associations),
          });
          if (!response.ok) {
            reject("SERVER ERROR SAVING BLOCK: " + response);
          }
          resolve(response.json());
        }
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

  const keyBindings = (event: React.KeyboardEvent) => {
    event.stopPropagation();
    console.log(`Key event fired: ${Date.now()}`);
    // tab pressed
    if (event.code.toLowerCase() === "tab") {
      if (selectedStory && selectedChapter.id) {
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

  const formatBlankAssociation = (type: AssociationType, name: string): Association => {
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
    const storedAssociation: Association[] = await updateAssociationsOnServer([association]);
    if (storedAssociation) {
      const existingIndex = associations.findIndex((assoc) => assoc.association_id === association.association_id);
      storedAssociation[0].portrait = storedAssociation[0].portrait + "?date=" + Date.now();
      associations[existingIndex] = storedAssociation[0];
      setEditorState(EditorState.set(editorState, { decorator: createDecorators() }));
    }
  };

  const handleMenuItemClick = async (event: React.MouseEvent, type: AssociationType) => {
    setSelectedContextMenuVisible(false);
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

  const handleContextMenu = (event: React.MouseEvent) => {
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

  const handleStyleClick = (event: React.MouseEvent, style: string) => {
    event.preventDefault();
    if (selectedStory) {
      const originalSelectionState = editorState.getSelection();
      const newEditorState = RichUtils.toggleInlineStyle(editorState, style);
      let newContent = newEditorState.getCurrentContent();
      const selectedKeys = GetSelectedBlockKeys(newEditorState);
      const updatedBlocks: ContentBlock[] = [];
      selectedKeys.forEach((key: string) => {
        const modifiedBlock = newEditorState.getCurrentContent().getBlockForKey(key);
        const newStyles: DocumentBlockStyle[] = [];
        for (const entry in documentStyleMap) {
          const styleDataByType: DocumentBlockStyle[] = GetBlockStyleDataByType(modifiedBlock, entry);
          newStyles.push(...styleDataByType);
        }
        newStyles.forEach((subStyle) => {
          const styleState = new SelectionState({
            anchorKey: key,
            focusKey: key,
            anchorOffset: subStyle.start,
            focusOffset: subStyle.end,
          });
          const styleName = subStyle.style ? subStyle.style : subStyle.name;
          if (newEditorState.getCurrentInlineStyle().has(styleName)) {
            newContent = Modifier.mergeBlockData(newContent, styleState, Immutable.Map([["STYLES", newStyles]]));
          } else {
            const dataToRemove = Immutable.Map([[styleName, undefined]]);
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
    }
  };

  const handleKeyCommand = (command: string): DraftHandleValue => {
    let newEditorState = editorState;
    if (command === "backspace" || command === "delete") {
      const selectedKeys = GetSelectedBlockKeys(editorState);
      if (selectedKeys.length) {
        const selection = editorState.getSelection();
        const postSelection = new SelectionState({
          focusKey: selection.getFocusKey(),
          anchorKey: selection.getAnchorKey(),
          focusOffset: selection.isCollapsed() ? selection.getFocusOffset() - 1 : selection.getFocusOffset(),
          anchorOffset: selection.getAnchorOffset(),
        });
        selectedKeys.forEach((key: string) => {
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
            newEditorState = EditorState.push(newEditorState, contentStateWithNewData, "change-block-data");
          }
        });
      }
    }

    const keyCommandState = RichUtils.handleKeyCommand(newEditorState, command);
    if (keyCommandState) {
      setEditorState(keyCommandState);
      return "handled";
    }
    if (editorState !== newEditorState) {
      setEditorState(newEditorState);
      return "handled";
    }
    return "not-handled";
  };

  const adjustBlockDataPositions = (newEditorState: EditorState, newBlock: ContentBlock) => {
    let content = newEditorState.getCurrentContent();
    const styleData = newBlock.getData().getIn(["STYLES"]);
    const uniqueStyles = new Map();
    if (styleData) {
      styleData.forEach((style: DocumentBlockStyle) => {
        const styleName = style.style ? style.style : style.name;
        const styleDataByType = GetBlockStyleDataByType(newBlock, styleName);
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
    if (!selectedStory) {
      return;
    }
    if (navbarRef.current) {
      navbarRef.current.resetNavButtons();
    }

    newEditorState = ReplaceCharacters(newEditorState);

    setSelectedContextMenuVisible(false);
    setAssociationContextMenuVisible(false);
    const selection = newEditorState.getSelection();
    const block = newEditorState.getCurrentContent().getBlockForKey(selection.getFocusKey());
    if (block && navbarRef.current) {
      const navbar = navbarRef.current;
      for (const entry in documentStyleMap) {
        const styles = GetBlockStyleDataByType(block, entry);
        styles.forEach((style) => {
          const styleName = style.style ? style.style : style.name;
          if (selection.hasEdgeWithin(block.getKey(), style.start, style.end)) {
            navbar.updateNavButtons(styleName, true);
          } else {
            navbar.updateNavButtons(styleName, false);
          }
        });
      }
    }
    const data = block.getData();
    if (navbarRef.current) {
      const alignment = data.has("ALIGNMENT") ? data.getIn(["ALIGNMENT"]).toLowerCase() : "left";
      if (alignment !== navbarRef.current.getCurrentBlockAlignment()) {
        navbarRef.current.updateNavButtons("alignment", alignment);
      }
    }

    // Cursor has moved but no text changes detected
    if (editorState.getCurrentContent() === newEditorState.getCurrentContent()) {
      setEditorState(newEditorState);
      return;
    }

    const newContent = newEditorState.getCurrentContent();
    const newBlockMap = newContent.getBlockMap();
    const oldContent = editorState.getCurrentContent();
    const oldBlockMap = oldContent.getBlockMap();
    const selectedKeys = GetSelectedBlockKeys(editorState);

    const blocksToSave: string[] = [];
    const blocksToDelete: any[] = [];
    let resyncRequired = false;
    oldBlockMap.forEach((_, oldBlockKey) => {
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
    newBlockMap.forEach((newBlock, newBlockKey) => {
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
        const block = newEditorState.getCurrentContent().getBlockForKey(blockKey);
        deleteOp.ops.push({ key_id: blockKey, chunk: block, place: "0" });
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
        ops: [],
        storyID: selectedStory.story_id,
        chapterID: selectedChapter.id,
      });
    }
  };

  const handlePasteAction = (text: string): DraftHandleValue => {
    const blockMap = ContentState.createFromText(text).getBlockMap();

    if (blockMap.size > 100) {
      const newAlert = {
        title: "Oh, jeez",
        message: "You're pasting a lot of paragraphs. This may take awhile to process...",
        severity: AlertToastType.warning,
        open: true,
        timeout: 10000,
      };
      dispatch(setAlert(newAlert));
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
    if (domEditor.current) {
      domEditor.current.focus();
    }
  };

  const getBlockStyles = (contentBlock: ContentBlock) => {
    const data = contentBlock.getData();
    let classStr = "";
    const alignment = data.has("ALIGNMENT") ? data.get("ALIGNMENT").toLowerCase() : "left";
    classStr += alignment;
    const lineHeight = data.getIn(["LINE_HEIGHT"]) ? data.getIn(["LINE_HEIGHT"]) : "LINEHEIGHT_DOUBLE";
    classStr += " " + lineHeight;
    classStr += " content-block";
    return classStr;
  };

  const saveBlockAlignment = (alignment: BlockAlignmentType) => {
    if (selectedStory) {
      let newContentState = editorState.getCurrentContent();
      const selectedKeys = GetSelectedBlockKeys(editorState);
      const blocksToPrep: ContentBlock[] = [];
      selectedKeys.forEach((key: string) => {
        newContentState = Modifier.mergeBlockData(
          newContentState,
          SelectionState.createEmpty(key),
          Immutable.Map([["ALIGNMENT", alignment]])
        );
        blocksToPrep.push(newContentState.getBlockForKey(key));
      });
      setEditorState(EditorState.push(editorState, newContentState, "change-block-data"));
      prepBlocksForSave(newContentState, blocksToPrep, selectedStory.story_id, selectedChapter.id);
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

  const blankEditor = () => setEditorState(EditorState.createEmpty(createDecorators()));

  const onStoryTitleEdit = async (event: React.SyntheticEvent) => {
    if (selectedStory) {
      const target = event.target as HTMLInputElement;
      if (target.value !== selectedStory.title && target.value.trim() !== "") {
        const updatedStory = { ...selectedStory };
        updatedStory.title = target.value;
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
          const newAlert = {
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

  const onChapterTitleEdit = async (event: React.SyntheticEvent) => {
    if (selectedStory) {
      const target = event.target as HTMLInputElement;
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
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(updatedChapter),
          });
          if (!response.ok) {
            console.error(response.body);
            const newAlert = {
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

  const getChapterDetails = async () => {
    if (selectedStory) {
      const response = await fetch("/api/stories/" + selectedStory.story_id + "/chapters/" + selectedChapter.id, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) {
        console.error(response.body);
        const newAlert = {
          title: "Error",
          message: "There was an error retrieving your chapter. Please report this.",
          severity: AlertToastType.error,
          open: true,
          timeout: 6000,
        };
        dispatch(setAlert(newAlert));
        return;
      } else {
        const responseJSON = (await response.json()) as Chapter;
        setSelectedChapter({
          id: selectedChapter.id,
          title: responseJSON.title,
          place: responseJSON.place,
          story_id: selectedStory.story_id,
        });
      }
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

  return (
    <div>
      <AssociationUI
        open={associationWindowOpen}
        association={viewingAssociation as Association}
        storyID={selectedStory?.story_id as string}
        onEditCallback={onAssociationEdit}
        onCloseCallback={() => {
          setAssociationWindowOpen(false);
          setFocusAndRestoreCursor();
        }}
      />
      <div className={docStyles.titleInfo}>
        <h2>
          <EditableText textValue={selectedStory?.title as string} onTextChange={onStoryTitleEdit} />
        </h2>
        <h3>
          <EditableText textValue={selectedChapter.title} onTextChange={onChapterTitleEdit} />
        </h3>
      </div>
      <DocumentToolbar
        story={selectedStory}
        chapterID={selectedChapter.id}
        exitFunction={onExitDocument}
        updateAlignment={saveBlockAlignment}
        updateStyle={handleStyleClick}
        updateSpellcheck={setIsSpellcheckOn}
        updateFont={setActiveFont}
        ref={navbarRef}
      />
      <section
        onContextMenu={(e) => {
          handleContextMenu(e);
        }}
        className={docStyles.editorContainer}
        style={{ fontFamily: activeFont }}
        onClick={setFocus}
        onScroll={handleScroll}>
        <Editor
          placeholder={defaultText}
          spellCheck={isSpellcheckOn}
          blockStyleFn={getBlockStyles}
          customStyleMap={documentStyleMap}
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
        <DocumentSidebar
          story={selectedStory as Story}
          chapter={selectedChapter}
          onSetChapter={setSelectedChapter}
          setDocumentToBlank={blankEditor}
        />
      </div>
      <ContextMenu
        name="selection"
        items={selectedContextMenuItems}
        visible={selectedContextMenuVisible}
        x={selectedContextMenuX}
        y={selectedContextMenuY}
      />
      <ContextMenu
        name="association"
        items={associationContextMenuItems}
        visible={associationContextMenuVisible}
        x={associationContextMenuX}
        y={associationContextMenuY}
      />
    </div>
  );
};

export default DocumentEditor;
function replaceCharacters(newEditorState: EditorState): EditorState {
  throw new Error("Function not implemented.");
}
