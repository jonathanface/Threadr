import React, {useRef, useEffect, useState} from 'react';
import Immutable from 'immutable';
import {convertFromRaw, Editor, EditorState, ContentBlock, RichUtils, getDefaultKeyBinding, Modifier, SelectionState, ContentState, CompositeDecorator} from 'draft-js';
import {GetSelectedText, InsertTab, FilterAndReduceDBOperations, GetBlockStyleDataByType, GetEntityData, GetSelectedBlockKeys, GenerateTabCharacter} from './utilities.js';
import AssociationUI from './AssociationUI.js';
import 'draft-js/dist/Draft.css';
import '../../css/document.css';
import {Menu, Item, Submenu, useContextMenu} from 'react-contexify';
import 'react-contexify/ReactContexify.css';
import {useSelector, useDispatch} from 'react-redux';
import {setDBOperationInterval} from '../../stores/dbOperationIntervalSlice';
import {FindHighlightable, HighlightSpan, FindTabs, TabSpan} from './decorators';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faAlignLeft} from '@fortawesome/free-solid-svg-icons';
import {faAlignCenter} from '@fortawesome/free-solid-svg-icons';
import {faAlignRight} from '@fortawesome/free-solid-svg-icons';
import {faAlignJustify} from '@fortawesome/free-solid-svg-icons';
import CloseIcon from '@mui/icons-material/Close';
import { IconButton } from '@mui/material';
import { setSelectedSeries } from '../../stores/selectedSeriesSlice.js';
import { setSelectedStoryTitle } from '../../stores/selectedStorySlice.js';
import { Sidebar, Menu as SideMenu, MenuItem, SubMenu, useProSidebar } from 'react-pro-sidebar';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import Button from '@mui/material/Button';
import '../../css/sidebar.css';

const ASSOCIATION_TYPE_CHARACTER = 'character';
const ASSOCIATION_TYPE_EVENT = 'event';
const ASSOCIATION_TYPE_PLACE = 'place';
const DB_OP_INTERVAL = 5000;


const associations = [];

const styleMap = {
  'STRIKETHROUGH': {
    textDecoration: 'line-through',
  },
  'BOLD': {
    fontWeight: 'bold',
  },
  'ITALIC': {
    fontStyle: 'italic'
  },
  'UNDERLINE': {
    textDecoration: 'underline'
  }
};

const dbOperationQueue = [];

const Document = () => {
  const domEditor = useRef(null);

  const urlParams = new URLSearchParams(window.location.search);

  const selectedStoryTitle = useSelector((state) => state.selectedStoryTitle.value);
  const isLoggedIn = useSelector((state) => state.isLoggedIn.value);
  const [selectedChapterNumber, setSelectedChapterNumber] = useState(urlParams.get('chapter') !== '' ? parseInt(urlParams.get('chapter')) : 1);
  const [selectedChapterTitle, setSelectedChapterTitle] = useState('');
  const [chapters, setChapters] = useState([]);
  const [currentRightClickedAssoc, setCurrentRightClickedAssoc] = useState(null);
  const [currentBlockAlignment, setCurrentBlockAlignment] = useState('LEFT');
  const [currentItalicsState, setCurrentItalicsState] = useState(false);
  const [currentBoldState, setCurrentBoldState] = useState(false);
  const [currentUnderscoreState, setCurrentUnderscoreState] = useState(false);
  const [currentStrikethroughState, setCurrentStrikethroughState] = useState(false);
  const [associationWindowOpen, setAssociationWindowOpen] = useState(false);
  const [viewingAssociation, setViewingAssociation] = useState(null);

  const {collapseSidebar, collapsed} = useProSidebar();
  const dispatch = useDispatch();

  let lastRetrievedBlockKey = '';
  const createDecorators = () => {
    const decorators = new Array(associations.length);
    associations.forEach((association) => {
      decorators.push({
        strategy: FindHighlightable(association.association_type, association.association_name, associations),
        component: HighlightSpan,
        props: {
          association: association,
          leftClickFunc: handleAssociationClick,
          rightClickFunc: handleAssociationContextMenu

        }
      });
    });
    decorators.push({
      strategy: FindTabs,
      component: TabSpan
    });
    return new CompositeDecorator(decorators);
  };

  const [editorState, setEditorState] = React.useState(
      () => EditorState.createEmpty(createDecorators())
  );

  const getAllAssociations = async() => {
    associations.splice(0);
    return fetch('/api/stories/' + selectedStoryTitle + '/associations')
      .then((response) => {
        if (response.ok) {
          return response.json();
        }
        throw new Error('Fetch problem associations ' + response.status);
      })
      .then((data) => {
        data.forEach((assoc) => {
          if (assoc.association_name.trim().length) {
            associations.push(
                {
                  association_name: assoc.association_name,
                  association_type: assoc.association_type,
                  portrait: assoc.portrait,
                  short_description: assoc.short_description,
                  details: {
                    aliases: '',
                    case_sensitive: assoc.details.case_sensitive,
                    extended_description: assoc.details.extended_description
                  }
                }
            );
          }
        });
      }).catch((error) => {
        console.error('get story associations', error);
      });
  };

  const processDBBlock = (content, block) => {
    if (block.getData().STYLES) {
      block.getData().STYLES.forEach((style) => {
        const styleSelection = new SelectionState({
          focusKey: block.key,
          anchorKey: block.key,
          focusOffset: style.end,
          anchorOffset: style.start
        });
        content = Modifier.applyInlineStyle(content, styleSelection, style.style);
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
        const contentStateWithEntity = content.createEntity(
            'TAB',
            'IMMUTABLE'
        );
        const entityKey = contentStateWithEntity.getLastCreatedEntityKey();
        content = Modifier.replaceText(
            contentStateWithEntity,
            tabSelection,
            GenerateTabCharacter(),
            null,
            entityKey
        );
      });
    }
    return content;
  };

  const getBatchedStoryBlocks = async(startKey) => {
    return fetch('/api/stories/' + selectedStoryTitle + '/content?key=' + startKey + '&chapter=' + selectedChapterNumber).then((response) => {
      if (response.ok) {
        return response.json();
      }
      throw new Error(response.status);
    }).then((data) => {
      data.last_evaluated_key && data.last_evaluated_key.key_id.Value ? lastRetrievedBlockKey = data.last_evaluated_key.key_id.Value : lastRetrievedBlockKey = null;
      // data.items.sort((a, b) => parseInt(a.place.Value) > parseInt(b.place.Value));
      const newBlocks = [];
      data.items.forEach((piece) => {
        if (piece.chunk) {
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
      const contentState = {
        entityMap: {},
        blocks: newBlocks
      };
      let newContentState = convertFromRaw(contentState);
      newBlocks.forEach((block) => {
        if (block.getText().length) {
          newContentState = processDBBlock(newContentState, block);
        }
      });
      setEditorState(EditorState.createWithContent(newContentState, createDecorators()));
    }).catch((error) => {
      if (parseInt(error.message) !== 404) {
        console.error('get story blocks', error);
      } else {
        setEditorState(EditorState.createEmpty(createDecorators()));
      }
    });
  };

  const processDBQueue = async () => {
    dbOperationQueue.sort((a, b) => parseInt(a.time) > parseInt(b.time));
    console.log('processing...', dbOperationQueue.length);
    const i = 0;
    while (i < dbOperationQueue.length) {
      const op = dbOperationQueue[i];
      switch (op.type) {
        case 'delete': {
          try {
            deleteBlocksFromServer(FilterAndReduceDBOperations(dbOperationQueue, op, i), op.story, op.chapter);
          } catch (e) {
            console.error(e);
            if (e.indexOf('SERVER') > -1) {
              dbOperationQueue.splice(i, 1);
              continue;
            }
          }
          break;
        }
        case 'save': {
          try {
            console.log('try', op);
            saveBlocksToServer(FilterAndReduceDBOperations(dbOperationQueue, op, i), op.story, op.chapter);
          } catch (e) {
            console.error(e);
            if (e.indexOf('SERVER') > -1) {
              dbOperationQueue.splice(i, 1);
              continue;
            }
          }
          break;
        }
        case 'syncOrder': {
          try {
            syncBlockOrderMap(op.blockList);
            dbOperationQueue.splice(i, 1);
          } catch (e) {
            console.error(e);
            if (e.indexOf('SERVER') > -1) {
              dbOperationQueue.splice(i, 1);
              continue;
            }
          }
          break;
        }
        default:
          console.error('invalid operation:', op);
      }
    }
  };

  const setFocusAndRestoreCursor = () => {
    const selection = editorState.getSelection();
    const newSelection = selection.merge({
      anchorOffset: selection.getIsBackward() ? selection.getAnchorOffset() : selection.getFocusOffset(),
      focusOffset: selection.getIsBackward() ? selection.getAnchorOffset() : selection.getFocusOffset()
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

  const getStoryDetails = async() => {
    return fetch('/api/stories/' + selectedStoryTitle).then((response) => {
      if (response.ok) {
        return response.json();
      }
      throw new Error(response.status);
    }).then((data) => {
      setChapters(data.chapters);
      setSelectedChapterTitle(data.chapters.find(chapter => chapter.chapter_num === selectedChapterNumber).chapter_title);
    });
  }

  const getBaseData = async() => {
    await getStoryDetails();
    await getAllAssociations();
    await getBatchedStoryBlocks('');
  }

  useEffect(() => {
    if (isLoggedIn && selectedStoryTitle) {
      setFocusAndRestoreCursor();
      getBaseData();
    }
    setDBOperationInterval(setInterval(() => {
      try {
        processDBQueue();
      } catch (e) {
        console.error(e);
      }
    }, DB_OP_INTERVAL));
    
  }, [isLoggedIn, selectedStoryTitle, selectedChapterNumber, lastRetrievedBlockKey]);

  const syncBlockOrderMap = (blockList) => {
    return new Promise(async (resolve, reject) => {
      try {
        const params = {};
        params.title = selectedStoryTitle;
        params.chapter = selectedChapterNumber;
        params.blocks = [];
        let index = 0;
        blockList.forEach((block) => {
          params.blocks.push({key_id: block.getKey(), place: index.toString()});
          index++;
        });
        const response = await fetch('/api/stories/' + selectedStoryTitle + '/orderMap', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(params)
        });
        if (!response.ok) {
          reject('SERVER ERROR ORDERING BLOCKS: ', response.body);
        }
        resolve(response.json());
      } catch (e) {
        reject('ERROR ORDERING BLOCKS: ', e);
      }
    });
  };

  const deleteBlocksFromServer = (blocks, story, chapter) => {
    return new Promise(async (resolve, reject) => {
      try {
        const params = {};
        params.title = story;
        params.chapter = parseInt(chapter);
        params.blocks = blocks;
        console.log('del', blocks);
        const response = await fetch('/api/stories/' + selectedStoryTitle + '/block', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(params)
        });
        if (!response.ok) {
          reject('SERVER ERROR DELETING BLOCK: ', response.body);
        }
        resolve(response.json());
      } catch (e) {
        reject('ERROR DELETING BLOCK: ', e);
      }
    });
  };

  const saveBlocksToServer = (blocks, story, chapter) => {
    return new Promise(async (resolve, reject) => {
      try {
        const params = {};
        params.title = story;
        params.chapter = parseInt(chapter);
        params.blocks = blocks;
        console.log('saving', blocks);
        const response = await fetch('/api/stories/' + story, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(params)
        });
        if (!response.ok) {
          reject('SERVER ERROR SAVING BLOCK: ', response);
        }
        resolve(response.json());
      } catch (e) {
        reject('ERROR SAVING BLOCK: ', e);
      }
    });
  };

  const saveAssociationsToServer = (associations) => {
    return new Promise(async (resolve, reject) => {
      try {
        console.log('saving associations', associations);
        const response = await fetch('/api/stories/' + selectedStoryTitle + '/associations', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(associations)
        });
        if (!response.ok) {
          reject('SERVER ERROR SAVING BLOCK: ', response);
        }
        resolve(response.json());
      } catch (e) {
        reject('ERROR SAVING BLOCK: ', e);
      }
    });
  };

  const deleteAssociationsFromServer = (associations) => {
    return new Promise(async (resolve, reject) => {
      try {
        const response = await fetch('/api/stories/' + selectedStoryTitle + '/associations', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(associations)
        });
        if (!response.ok) {
          reject('SERVER ERROR SAVING BLOCK: ', response);
        }
        resolve(response.json());
      } catch (e) {
        reject('ERROR SAVING BLOCK: ', e);
      }
    });
  };

  const prepBlocksForSave = (content, blocks, story, chapter) => {
    blocks.forEach((block) => {
      const key = block.getKey();
      const index = content.getBlockMap().keySeq().findIndex((k) => k === key);
      const selection = SelectionState.createEmpty(key);
      const updatedSelection = selection.merge({
        anchorOffset: 0,
        focusOffset: block.getText().length,
      });
      const newContent = Modifier.applyEntity(content, updatedSelection, null);
      const updatedBlock = newContent.getBlockForKey(key);
      dbOperationQueue.push({type: 'save', story: story, chapter: chapter, time: Date.now(), ops:
        [{key_id: key, chunk: updatedBlock, place: index.toString()}]});
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
      prepBlocksForSave(content, blocksToPrep, selectedStoryTitle, selectedChapterNumber);
    }
    return getDefaultKeyBinding(event);
  };

  const formatBlankAssociation = (type, name) => {
    return {
      association_type: type,
      association_name: name,
      short_description: '',
      portrait: '',
      details: {
        aliases: '',
        case_sensitive: true,
        extended_description: '',
      }
    };
  };

  const onAssociationEdit = async(association) => {
    console.log('editing', association);
    const storedAssociation = await saveAssociationsToServer([association]);
    const existingAssoc = associations.find(assoc => assoc.association_name === association.association_name &&
                                                    assoc.type === association.association_type);
    associations[associations.indexOf(existingAssoc)] = storedAssociation;
    setEditorState(EditorState.set(editorState, { decorator: createDecorators()}));
  };

  const handleMenuItemClick = async ({id, event}) => {
    const text = GetSelectedText(editorState);
    if (text.length) {
      event.preventDefault();
      // check if !contains
      const newAssociation = formatBlankAssociation(id, text);
      const withSelection = setFocusAndRestoreCursor();
      try {
        const storedAssociation = await saveAssociationsToServer([newAssociation]);
        newAssociation.portrait = storedAssociation[0].portrait;
        associations.push(newAssociation);
        const newEditorState = EditorState.set(withSelection, {decorator: createDecorators()});
        setEditorState(newEditorState);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleDeleteAssociationClick = ({event}) => {
    associations.splice(associations.findIndex((assoc) => assoc === currentRightClickedAssoc));
    const withSelection = setFocusAndRestoreCursor();
    const newEditorState = EditorState.set(withSelection, {decorator: createDecorators()});
    try {
      deleteAssociationsFromServer([currentRightClickedAssoc]);
    } catch (e) {
      console.error(e);
    }
    setCurrentRightClickedAssoc(null);
    setEditorState(newEditorState);
  };

  const {show} = useContextMenu();

  const handleTextualContextMenu = (event) => {
    event.preventDefault();
    const text = GetSelectedText(editorState);
    // regex check for separated word?
    if (text.length) {
      show({
        id: 'plaintext_context',
        event,
        props: {
          editorState: editorState
        }
      });
    }
  };

  const handleAssociationClick = (association, event) => {
    setViewingAssociation(association);
    setAssociationWindowOpen(true);
  };

  const handleAssociationContextMenu = (name, type, event) => {
    setCurrentRightClickedAssoc(formatBlankAssociation(type, name));
    show({
      id: 'association_context',
      event: event,
      props: {
        editorState: editorState,
        name: name,
        type: type
      }
    });
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
          newContent = Modifier.mergeBlockData(newContent, styleState, Immutable.Map([['STYLES', newStyles]]));
        } else {
          const dataToRemove = Immutable.Map([[subStyle.style, undefined]]);
          const existingData = modifiedBlock.getData();
          const updatedData = existingData.delete('STYLES').mergeDeep({ 'STYLES': newStyles });
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
    const updatedEditorState = EditorState.push(newEditorState, newContent, 'change-block-data');
    const updatedEditorStateWithSelection = EditorState.forceSelection(updatedEditorState, originalSelectionState);
    setEditorState(updatedEditorStateWithSelection);
    prepBlocksForSave(newContent, updatedBlocks, selectedStoryTitle, selectedChapterNumber);
    setNavButtonState(style);
  };

  const handleKeyCommand = (command) => {
    console.log('cmd', command);
    let newEditorState = editorState;
    if (command === 'backspace' || command === 'delete') {
      const selection = editorState.getSelection();
      const postSelection = new SelectionState({
        focusKey: selection.getFocusKey(),
        anchorKey: selection.getAnchorKey(),
        focusOffset: selection.isCollapsed() ? selection.getFocusOffset()-1 : selection.getFocusOffset(),
        anchorOffset: selection.getAnchorOffset()
      });
      const selectedKeys = GetSelectedBlockKeys(editorState);
      selectedKeys.forEach((key) => {
        const content = editorState.getCurrentContent();
        const block = content.getBlockForKey(key);
        const tabs = block.getData().getIn(['ENTITY_TABS']);
        if (tabs && tabs.length) {
          tabs.forEach((tab) => {
            if (postSelection.hasEdgeWithin(key, tab.start, tab.end)) {
              tabs.splice(tabs.indexOf(tab), 1);
            }
          });
          const contentStateWithNewData = Modifier.mergeBlockData(
              content,
              selection,
              Immutable.Map([['ENTITY_TABS', tabs]])
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
    setCurrentBlockAlignment('LEFT');
  };

  const setNavButtonState = (style, value) => {
    switch (style) {
      case 'BOLD': {
        setCurrentBoldState(value);
        break;
      }
      case 'ITALIC': {
        setCurrentItalicsState(value);
        break;
      }
      case 'UNDERSCORE': {
        setCurrentUnderscoreState(value);
        break;
      }
      case 'STRIKETHROUGH': {
        setCurrentStrikethroughState(value);
        break;
      }
      case 'LEFT':
      case 'RIGHT':
      case 'CENTER':
      case 'JUSTIFY': {
        setCurrentBlockAlignment(style);
        break;
      }
      default:
    }
  };

  const adjustBlockDataPositions = (newEditorState, newBlock) => {
    let content = newEditorState.getCurrentContent();
    const styleData = newBlock.getData().getIn(['STYLES']);
    const styles = [];
    if (styleData) {
      styleData.forEach((style) => {
        const styleDataByType = GetBlockStyleDataByType(newBlock, style.style);
        styles.push(...styleDataByType);
      });
      content = Modifier.mergeBlockData(content, newEditorState.getSelection(), Immutable.Map([['STYLES', styles]]));
    }

    const tabData = newBlock.getData().getIn(['ENTITY_TABS']);
    if (tabData) {
      const tabs = GetEntityData(newBlock, 'TAB', []);
      content = Modifier.mergeBlockData(content, newEditorState.getSelection(), Immutable.Map([['ENTITY_TABS', tabs]]));
    }

    return EditorState.push(newEditorState, content, 'change-block-data');
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
    const alignment = data.getIn(['ALIGNMENT']) ? data.getIn(['ALIGNMENT']) : 'LEFT';
    setCurrentBlockAlignment(alignment);

    // Cursor has moved but no text changes detected
    if (editorState.getCurrentContent() === newEditorState.getCurrentContent()) {
      console.log('cursor action');
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
        const index = oldContent.getBlockMap().keySeq().findIndex((k) => k === oldBlockKey);
        if (index !== oldBlockMap.size-1) {
          resyncRequired = true;
        }
      }
    });
    newBlockMap.forEach((newBlock, newBlockKey) => {
      const oldBlock = oldBlockMap.get(newBlockKey);
      // If the new block is not in the old block map, it's a new block
      if (!oldBlock) {
        const index = newContent.getBlockMap().keySeq().findIndex((k) => k === newBlockKey);
        if (index !== newBlockMap.size-1) {
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
      deleteOp.type = 'delete';
      deleteOp.time = Date.now();
      deleteOp.story=selectedStoryTitle;
      deleteOp.chapter=selectedChapterNumber;
      deleteOp.ops = [];
      blocksToDelete.forEach((blockKey) => {
        deleteOp.ops.push({key_id: blockKey});
      });
      dbOperationQueue.push(deleteOp);
    }

    if (blocksToSave.length) {
      const updatedContent = newEditorState.getCurrentContent();
      const blocksToPrep = [];
      blocksToSave.forEach((key) => {
        blocksToPrep.push(updatedContent.getBlockForKey(key));
      });
      prepBlocksForSave(updatedContent, blocksToPrep, selectedStoryTitle, selectedChapterNumber);
    }

    if (resyncRequired) {
      dbOperationQueue.push({type: 'syncOrder', blockList: newBlockMap, time: Date.now()});
    }
  };

  const handlePasteAction = (text) => {
    const blockMap = ContentState.createFromText(text).getBlockMap();
    if (blockMap.size > 100) {
      console.error('Pasting more than 100 paragraphs at a time is not allowed.');
      return true;
    }
    const newState = Modifier.replaceWithFragment(editorState.getCurrentContent(), editorState.getSelection(), blockMap);
    updateEditorState(EditorState.push(editorState, newState, 'insert-fragment'), true);
    return true;
  };

  const setFocus = () => {
    domEditor.current.focus();
  };

  const getBlockStyles = (contentBlock) => {
    const data = contentBlock.getData();
    let classStr = '';
    const alignment = data.getIn(['ALIGNMENT']) ? data.getIn(['ALIGNMENT']) : 'LEFT';
    classStr += alignment;
    const lineHeight = data.getIn(['LINE_HEIGHT']) ? data.getIn(['LINE_HEIGHT']) : 'LINEHEIGHT_DOUBLE';
    classStr += ' ' + lineHeight;
    return classStr;
  };

  const updateBlockAlignment = (event, alignment) => {
    let newContentState = editorState.getCurrentContent();
    const selectedKeys = GetSelectedBlockKeys(editorState);
    const blocksToPrep = [];
    selectedKeys.forEach((key) => {
      newContentState = Modifier.mergeBlockData(newContentState, SelectionState.createEmpty(key), Immutable.Map([['ALIGNMENT', alignment]]));
      blocksToPrep.push(newContentState.getBlockForKey(key));
    });
    setEditorState(EditorState.push(editorState, newContentState, 'change-block-data'));
    prepBlocksForSave(newContentState, blocksToPrep, selectedStoryTitle, selectedChapterNumber);
    setNavButtonState(alignment);
  };

  const onExitDocument = () => {
    dispatch(setSelectedSeries(null));
    dispatch(setSelectedStoryTitle(null));
    const history = window.history;
    history.pushState("root", 'exited story', '/');
  };

  const onExpandChapterMenu = () => {
    console.log("exp", collapsed);
    collapseSidebar(!collapsed)
  }

  const onChapterClick = (title, num) => {
    setSelectedChapterNumber(num);
    setSelectedChapterTitle(title);
    const history = window.history;
    history.pushState({selectedStoryTitle}, 'changed chapter', '/story/' + encodeURIComponent(selectedStoryTitle) + '?chapter=' + num);
  }

  const onNewChapterClick = () => {
    const newChapterNum = chapters.length+1;
    const newChapterTitle = "Chapter " + newChapterNum;
    fetch('/api/stories/' + selectedStoryTitle + '/chapter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({chapter_title: newChapterTitle, chapter_num: newChapterNum})
    }).then((response) => {
      if (response.ok) {
        const newChapters = [...chapters]
        newChapters.push({chapter_title: newChapterTitle, chapter_num: newChapterNum});
        setChapters(newChapters);
        setSelectedChapterNumber(newChapterNum);
        setSelectedChapterTitle(newChapterTitle);
        const history = window.history;
        history.pushState({selectedStoryTitle}, 'created chapter', '/story/' + encodeURIComponent(selectedStoryTitle) + '?chapter=' + newChapterNum);
      }
      throw new Error('Fetch problem creating chapter ' + response.status);
    }).catch((error) => {
      console.error(error);
    });
  }

  const onDeleteChapterClick = (event, chapterTitle) => {

    const chapterIndex = chapters.findIndex((e) => e.chapter_title === chapterTitle);
    const deleteChapter = chapters[chapterIndex];
    const params = [];
    params[0] = {'chapter_title': chapterTitle, 'chapter_num': deleteChapter.chapter_num};
    fetch('/api/stories/' + selectedStoryTitle + '/chapter', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    }).then((response) => {
      if (response.ok) {
        const newChapters = [...chapters]
        newChapters.splice(chapterIndex);
        setChapters(newChapters);
        if (selectedChapterNumber === deleteChapter.chapter_num) {
          const prevChapter = chapters[chapterIndex-1];
          setSelectedChapterNumber(prevChapter.chapter_num);
          setSelectedChapterTitle(prevChapter.chapter_title);
          const history = window.history;
          history.pushState({selectedStoryTitle}, 'deleted chapter', '/story/' + encodeURIComponent(selectedStoryTitle) + '?chapter=' + prevChapter.chapter_num);
        }
        return;
      }
      throw new Error('Fetch problem deleting chapter ' + response.status);
    }).catch((error) => {
      console.error(error);
    });
  };

  const onChapterTitleDClick = () => {
    console.log("edit chap");
  }

  return (
    <div>
      <AssociationUI open={associationWindowOpen} association={viewingAssociation} story={selectedStoryTitle} onEditCallback={onAssociationEdit} onClose={()=>{setAssociationWindowOpen(false);}} />
      <div className="title_info">
        <h2>{decodeURIComponent(selectedStoryTitle)}</h2>
        <h3>{selectedChapterTitle}</h3>
      </div>
      <nav className="rich-controls">
        <div>
          <span className="controls-row">
            <button className={currentBoldState ? 'active': ''} onMouseDown={(e) => {handleStyleClick(e, 'BOLD');}}><b>B</b></button>
            <button className={currentItalicsState ? 'active': ''} onMouseDown={(e) => {handleStyleClick(e, 'ITALIC');}}><i>I</i></button>
            <button className={currentUnderscoreState ? 'active': ''} onMouseDown={(e) => {handleStyleClick(e, 'UNDERLINE');}}><u>U</u></button>
            <button className={currentStrikethroughState ? 'active': ''} onMouseDown={(e) => {handleStyleClick(e, 'STRIKETHROUGH');}}><s>S</s></button>
          </span>
          <span className="controls-row">
            <button className={currentBlockAlignment === 'LEFT' ? 'active': ''} onMouseDown={(e) => {updateBlockAlignment(e, 'LEFT');}}><FontAwesomeIcon icon={faAlignLeft} /></button>
            <button className={currentBlockAlignment === 'CENTER' ? 'active': ''} onMouseDown={(e) => {updateBlockAlignment(e, 'CENTER');}}><FontAwesomeIcon icon={faAlignCenter} /></button>
            <button className={currentBlockAlignment === 'RIGHT' ? 'active': ''} onMouseDown={(e) => {updateBlockAlignment(e, 'RIGHT');}}><FontAwesomeIcon icon={faAlignRight} /></button>
            <button className={currentBlockAlignment === 'JUSTIFY' ? 'active': ''} onMouseDown={(e) => {updateBlockAlignment(e, 'JUSTIFY');}}><FontAwesomeIcon icon={faAlignJustify} /></button>
          </span>
          <span className="exit-btn">
            <IconButton aria-label="exit" component="label" onClick={onExitDocument}>
              <CloseIcon sx={{
                color:'#F0F0F0'
              }}/>
            </IconButton>
          </span>
        </div>
      </nav>
      <section className="editor_container" onContextMenu={handleTextualContextMenu} onClick={setFocus} onScroll={handleScroll} >
        <Editor
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
      <Menu id="plaintext_context">
        <Submenu label="Create Association">
          <Item id={ASSOCIATION_TYPE_CHARACTER} onClick={handleMenuItemClick}>Character</Item>
          <Item id={ASSOCIATION_TYPE_PLACE} onClick={handleMenuItemClick}>Place</Item>
          <Item id={ASSOCIATION_TYPE_EVENT} onClick={handleMenuItemClick}>Event</Item>
        </Submenu>
      </Menu>
      <Menu id="association_context">
        <Item onClick={handleDeleteAssociationClick}>Delete Association</Item>
      </Menu>
      <div className="sidebar-container">
        <div className="handle" onClick={onExpandChapterMenu}>chapters</div>
        <Sidebar rtl={true} collapsedWidth={0} defaultCollapsed={true}>
          <SideMenu>
            {
              chapters.map((chapter, idx) => {
                return <MenuItem onDoubleClick={onChapterTitleDClick} key={idx} className={chapter.chapter_num === selectedChapterNumber ? "active":""} onClick={
                  ()=>onChapterClick(chapter.chapter_title, chapter.chapter_num)
                }>{chapter.chapter_title}
                <IconButton className="menu-icon" edge="end" size="small" aria-label="delete chapter" onClick={(event)=>{onDeleteChapterClick(event, chapter.chapter_title)}}>
                  <DeleteIcon fontSize="small" className={'menu-icon'}/>
                </IconButton>
                </MenuItem>
              })
            }
            <MenuItem key="add_chapter_btn" onClick={onNewChapterClick}>
              <Button onClick={onNewChapterClick} variant="outlined" sx={{color:'#FFF'}} startIcon={
                <AddIcon sx={{marginLeft:'5px'}}/>
              }>New</Button>
            </MenuItem>
          </SideMenu>
        </Sidebar>;
      </div>
    </div>);
};

export default Document;
