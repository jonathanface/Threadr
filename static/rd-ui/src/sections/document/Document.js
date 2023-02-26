import React, {useRef, useEffect} from 'react';
import Immutable from 'immutable';
import {convertFromRaw, Editor, EditorState, ContentBlock, RichUtils, getDefaultKeyBinding, Modifier, SelectionState, ContentState} from 'draft-js';
import {CreateDecorators} from './decorators.js'
import 'draft-js/dist/Draft.css';
import '../../css/document.css';
import { Menu, Item, Submenu, useContextMenu } from 'react-contexify';
import 'react-contexify/ReactContexify.css';
import { useSelector} from 'react-redux'
import dbOperationIntervalSlice, { setDBOperationInterval } from '../../stores/dbOperationIntervalSlice';

const ASSOCIATION_TYPE_CHARACTER = "character";
const ASSOCIATION_TYPE_EVENT = "event";
const ASSOCIATION_TYPE_PLACE = "place";
const tabLength = 5;

const associations = [];
associations.push({type:ASSOCIATION_TYPE_CHARACTER, name:"lo", details:{aliases:""}})

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

const getSelectedText = (editorState) => {
  const selection = editorState.getSelection();
  const anchorKey = selection.getAnchorKey();
  const currentContent = editorState.getCurrentContent();
  const currentBlock = currentContent.getBlockForKey(anchorKey);

  const start = selection.getStartOffset();
  const end = selection.getEndOffset();
  const selectedText = currentBlock.getText().slice(start, end);
  return selectedText;
}

const generateTabCharacter = () => {
  let tab = '';
  for (let i=0; i < tabLength; i++) {
    tab += ' ';
  }
  return tab;
}

const forceStateUpdate = (editorState) => {
  return EditorState.set(editorState, {decorator: CreateDecorators(associations)});
}

const insertTab = (editorState, key) => {
  const selection = new SelectionState({
    anchorKey: key,
    focusKey: key,
    anchorOffset: 0,
    focusOffset: 0
  });
  const currentContent = editorState.getCurrentContent();
  const contentStateWithEntity = currentContent.createEntity('TAB', 'IMMUTABLE');
  const entityKey = contentStateWithEntity.getLastCreatedEntityKey();
  const textWithEntity = Modifier.insertText(currentContent, selection, generateTabCharacter(), null, entityKey);
  const newState = EditorState.push(editorState, textWithEntity, 'apply-entity');
  return EditorState.forceSelection(newState, textWithEntity.getSelectionAfter());
}

const dbOperationQueue = [];

const filterAndReduceDBOperations = (op, i) => {
  const keyIDMap = {};
  let j = i;
  while (j < dbOperationQueue.length) {
    const obj = dbOperationQueue[j];
    if (obj.type === op.type) {
      obj.ops.forEach(op => {
        keyIDMap[op.keyID] = keyIDMap[op.keyID] === undefined ? [] : keyIDMap[op.keyID];
        keyIDMap[op.keyID].push(op);
      });
      dbOperationQueue.splice(j, 1);
    } else {
      j++;
    }
  }
  const toRun = [];
  for (let keyID in keyIDMap) {
    if (keyIDMap.hasOwnProperty(keyID)) {
      toRun.push(keyIDMap[keyID].pop());
      delete keyIDMap[keyID];
    }
  }
  return toRun;
}

const Document = () => {
  const domEditor = useRef(null);
  const currentStoryID = useSelector((state) => state.currentStoryID.value);
  const isLoggedIn = useSelector((state) => state.isLoggedIn.value);

  const [editorState, setEditorState] = React.useState(
    () => EditorState.createEmpty(CreateDecorators(associations))
  );

  const getAllStoryBlocks = () => {
    fetch(process.env.REACT_APP_SERVER_URL + '/api/stories/' + currentStoryID)
    .then((response) => {
        if (response.ok) {
            return response.json();
          }
          throw new Error('Fetch problem blocks ' + response.status);
    })
    .then((data) => {
      data.sort((a, b) => parseInt(a.place.Value) > parseInt(b.place.Value));
      const newBlocks = [];
      data.forEach(piece => {
        const jsonBlock = JSON.parse(piece.chunk.Value);
        const block = new ContentBlock({
          characterList: jsonBlock.characterList,
          depth: jsonBlock.depth,
          key: piece.keyID.Value,
          text: jsonBlock.text,
          type: jsonBlock.type,
          data: jsonBlock.data,
          
        });
        newBlocks.push(block);
      });
      const contentState = {
        entityMap: {},
        blocks: newBlocks
      };
      let newContentState = convertFromRaw(contentState);
      newBlocks.forEach(block => {
        if (block.getData(["styles"]) && block.getData(["styles"]).styles) {
          block.getData(["styles"]).styles.forEach(style => {
            const styleSelection = new SelectionState({
              focusKey: block.key,
              anchorKey: block.key,
              focusOffset: style.end,
              anchorOffset: style.start
            })
            newContentState = Modifier.applyInlineStyle(newContentState, styleSelection, style.style)
          })
        }
      })
      setEditorState(EditorState.createWithContent(newContentState, CreateDecorators(associations)));
    }).catch(error => {
      console.error("get story blocks", error);
    })
  }

  useEffect(() => {
    if (isLoggedIn && currentStoryID) {
      setFocusAndRestoreCursor(editorState);
      getAllStoryBlocks();
      setDBOperationInterval(setInterval(() => {
        processDBQueue();
      }, process.env.REACT_APP_DB_OP_INTERVAL));
    }
  }, [isLoggedIn, currentStoryID]);

  const processDBQueue = async() => {
    dbOperationQueue.sort((a, b) => parseInt(a.time) > parseInt(b.time));
    console.log("processing...", dbOperationQueue.length);
    let i = 0;
    while (i < dbOperationQueue.length) {
      const op = dbOperationQueue[i];
      switch(op.type) {
        case "delete": {
          try {
            await deleteBlocksFromServer(filterAndReduceDBOperations(op, i));
          } catch(e) {
              console.error(e)
              if (e.indexOf("SERVER") > -1) {
                dbOperationQueue.splice(i, 1);
                continue;
              }
            }
            break;
          }
        case "save": {
          try {
            await saveBlocksToServer(filterAndReduceDBOperations(op, i));
          } catch(e) {
            console.error(e)
            if (e.indexOf("SERVER") > -1) {
              dbOperationQueue.splice(i, 1);
              continue;
            }
          }
          break;
        }
        case "syncOrder": {
          try {
            syncBlockOrderMap(op.blockList);
            dbOperationQueue.splice(dbOperationQueue.indexOf(op), 1);
          } catch(e) {
            console.error(e)
          }
          break;
        }
        default:
          console.error("invalid operation:", op);
      }
    }
  };

  const setFocusAndRestoreCursor = (editorState) => {
    const selection = editorState.getSelection();
      const newSelection = selection.merge({
        anchorOffset: selection.getIsBackward() ? selection.getAnchorOffset() : selection.getFocusOffset(),
        focusOffset: selection.getIsBackward() ? selection.getAnchorOffset() : selection.getFocusOffset()
      })
      domEditor.current.focus();
      return EditorState.forceSelection(editorState, newSelection);
  }

  const syncBlockOrderMap = (blockList) => {
    return new Promise(async(resolve, reject) => {
      try {
        const params = {}
        params.title = currentStoryID;
        params.blocks = [];
        let index = 0;
        blockList.forEach((block) => {
          params.blocks.push({keyID:block.getKey(), place:index.toString()})
          index++;
        })
        const response = await fetch(process.env.REACT_APP_SERVER_URL + '/api/stories/' + currentStoryID + '/orderMap', {
          method: "PUT",
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(params)
        });
        if (!response.ok) {
          reject("SERVER ERROR ORDERING BLOCKS: ", response.body);
        }
        resolve(response.json());
      } catch (e) {
        reject("ERROR ORDERING BLOCKS: ", e);
      }
    });
  }

  const deleteBlocksFromServer = (blocks) => {
    return new Promise(async(resolve, reject) => {
      try {
        console.log("del", blocks);
        const response = await fetch(process.env.REACT_APP_SERVER_URL + '/api/stories/' + currentStoryID + '/block', {
          method: "DELETE",
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(blocks)
        });
        if (!response.ok) {
          reject("SERVER ERROR DELETING BLOCK: ", response.body);
        }
        resolve(response.json());
      } catch (e) {
        reject("ERROR DELETING BLOCK: ", e);
      }
    });
  }

  const getStyleData = (block, type, list) => {
    block.findStyleRanges(
      (character) => {
        return character.hasStyle(type);
      },
      (start, end) => {
        list.push({
          start: start,
          end: end,
          style: type
        });
      }
    );
    return list;
  }

  const saveBlocksToServer = (blocks) => {
    console.log("blockstoisave", blocks);
    return new Promise(async(resolve, reject) => {
      try {
        console.log("saving", blocks);
        const response = await fetch(process.env.REACT_APP_SERVER_URL + '/api/stories/' + currentStoryID, {
          method: "PUT",
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(blocks)
        });
        if (!response.ok) {
          reject("SERVER ERROR SAVING BLOCK: ", response);
        }
        resolve(response.json());
      } catch (e) {
        reject("ERROR SAVING BLOCK: ", e);
      }
    });
    
  }

  const keyBindings = (event) => {
    // tab pressed
    if (event.keyCode === 9) {
      event.preventDefault();
      setEditorState(insertTab(editorState, editorState.getSelection().getFocusKey()));
    }
    return getDefaultKeyBinding(event);
  }

  const { show } = useContextMenu({
    id: "custom_context",
  });

  const handleMenuItemClick = ({ id, event}) => {
    const text = getSelectedText(editorState);
    if (text.length) { 
      event.preventDefault();
      // check if !contains
      associations.push({type:id, name:text, details:{aliases:""}});
      const withSelection = setFocusAndRestoreCursor(editorState)
      const newEditorState = forceStateUpdate(withSelection);
      setEditorState(newEditorState);
    }
  };

  const handleContextMenu = (event) => {
    const text = getSelectedText(editorState);
    // regex check for separated word?
    if (text.length) {
      show({
        event,
        props: {
            editorState: editorState
        }
      })
    }
  }

  const handleStyleClick = (event, style) => {
    event.preventDefault();
    const newEditorState = RichUtils.toggleInlineStyle(editorState, style);
    setEditorState(newEditorState);
    const selectedKeys = getSelectedBlocks(newEditorState);
    selectedKeys.forEach((key) => {
      const block = newEditorState.getCurrentContent().getBlockForKey(key);
      let styles = [];
      for (const entry in styleMap) {
        styles = getStyleData(block, entry, styles);
      };
      const modifiedContent = Modifier.setBlockData(newEditorState.getCurrentContent(), SelectionState.createEmpty(key), Immutable.Map([['styles', styles]]));
      const updatedBlock = modifiedContent.getBlockForKey(key);
      const index = newEditorState.getCurrentContent().getBlockMap().keySeq().findIndex(k => k === key);
      dbOperationQueue.push({type:"save", key:key, block:updatedBlock, index:index, time: Date.now()});
    })
  }

  const handleKeyCommand = (command) => {
    console.log("cmd", command)
    if (command === 'backspace' || command === 'delete') {
      return;
    }
    setEditorState(RichUtils.handleKeyCommand(editorState, command));
  }

  const getSelectedBlocks = (editorState) => {
    const lastSelection = editorState.getSelection();
    const min = lastSelection.getIsBackward() ? lastSelection.getFocusKey() : lastSelection.getAnchorKey();
    const max = lastSelection.getIsBackward() ? lastSelection.getAnchorKey() : lastSelection.getFocusKey();
    const blockMap = editorState.getCurrentContent().getBlockMap();
    const firstSubselection = blockMap.skipUntil((v, k) => k === min);
    const toReverse = firstSubselection.reverse();
    const subselection = toReverse.skipUntil((v, k) => k === max);
    const [...selectedKeys] = subselection.keys();
    return selectedKeys;
  }

  const applyBlockStyles = (contentBlock) => {
    let classStr = ''; 
    const data = contentBlock.getData();
    const alignment = data.getIn(['alignment']);
    if (alignment) {
      classStr += 'align_' + data.getIn(['alignment']);
    }
    const lineHeight = data.getIn(['lineHeight']);
    if (lineHeight) {
      if (classStr.length) {
        classStr += ' ';
      }
      classStr += lineHeight;
    }
  }

  const updateEditorState = (newEditorState) => {
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
    const selectedKeys = getSelectedBlocks(newEditorState);

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
        const index = oldContent.getBlockMap().keySeq().findIndex(k => k === oldBlockKey);
        if (index != oldBlockMap.size-1) {
          resyncRequired = true;
        }
      }
    });
    newBlockMap.forEach((newBlock, newBlockKey) => {
      const oldBlock = oldBlockMap.get(newBlockKey);
      // If the new block is not in the old block map, it's a new block
      if (!oldBlock) {
        const index = newContent.getBlockMap().keySeq().findIndex(k => k === newBlockKey);
        if (index != newBlockMap.size-1) {
          // If it's not in the last place of blocks, we will need to resync
          // the order of all blocks
          resyncRequired = true;
        }
        
        const firstChar = newBlock.getCharacterList().get(0);
        if ((firstChar && firstChar.entity == null) || (firstChar && newContent.getEntity(firstChar.entity).getType() != 'TAB')) {
          newEditorState = insertTab(newEditorState, newBlockKey);
        }
        blocksToSave.push(newBlockKey);
        return;
      }
      // If the block is selected, save it to the server
      if (selectedKeys.includes(newBlockKey)) {
        blocksToSave.push(newBlockKey);
      }
    });

    
    setEditorState(newEditorState);

    if (blocksToDelete.length) {
      const deleteOp = {};
      deleteOp.type = "delete";
      deleteOp.time = Date.now();
      deleteOp.ops = [];
      blocksToDelete.forEach(blockKey => {
        deleteOp.ops.push({keyID:blockKey});
      });
      dbOperationQueue.push(deleteOp);
    }

    if (blocksToSave.length) {
      const updatedContent = newEditorState.getCurrentContent();
      const saveOp = {}
      saveOp.type = "save";
      saveOp.time = Date.now();
      saveOp.ops = [];
      blocksToSave.forEach(blockKey => {
        const index = updatedContent.getBlockMap().keySeq().findIndex(k => k === blockKey);
        saveOp.ops.push({keyID:blockKey, chunk: updatedContent.getBlockForKey(blockKey), place:index.toString()});
      });
      dbOperationQueue.push(saveOp);
    }

    if (resyncRequired) {
      dbOperationQueue.push({type:"syncOrder", blockList:newBlockMap, time:Date.now()});
    }
  }

  const handlePasteAction = (text) => {
    const blockMap = ContentState.createFromText(text).getBlockMap();
    const newState = Modifier.replaceWithFragment(editorState.getCurrentContent(), editorState.getSelection(), blockMap);
    updateEditorState(EditorState.push(editorState, newState, 'insert-fragment'));
    return true;
  }

  const setFocus = () => {
    domEditor.current.focus();
  }

  return (
    <div>
      <nav className="rich-controls">
        <button onMouseDown={(e) => {handleStyleClick(e,'BOLD')}}><b>B</b></button>
        <button onMouseDown={(e) => {handleStyleClick(e,'ITALIC')}}><i>I</i></button>
        <button onMouseDown={(e) => {handleStyleClick(e,'UNDERLINE')}}><u>U</u></button>
        <button onMouseDown={(e) => {handleStyleClick(e,'STRIKETHROUGH')}}><s>S</s></button>
      </nav>
      <section onContextMenu={handleContextMenu} onClick={setFocus}>
        <Editor blockStyleFn={applyBlockStyles} customStyleMap={styleMap} preserveSelectionOnBlur={true} editorState={editorState} stripPastedStyles={true} onChange={updateEditorState} handlePastedText={handlePasteAction} handleKeyCommand={handleKeyCommand} keyBindingFn={keyBindings} ref={domEditor} />
      </section>
      <Menu id="custom_context">
        <Submenu label="Create Association">
          <Item id={ASSOCIATION_TYPE_CHARACTER} onClick={handleMenuItemClick}>Character</Item>
          <Item id={ASSOCIATION_TYPE_PLACE} onClick={handleMenuItemClick}>Place</Item>
          <Item id={ASSOCIATION_TYPE_EVENT} onClick={handleMenuItemClick}>Event</Item>
        </Submenu>
      </Menu>
    </div>);
}

export default Document;