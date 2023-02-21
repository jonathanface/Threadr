import React, {useRef, useEffect} from 'react';
import {convertFromRaw, Editor, EditorState, ContentBlock, RichUtils, getDefaultKeyBinding, Modifier, SelectionState, ContentState} from 'draft-js';
import {CreateDecorators} from './decorators.js'
import 'draft-js/dist/Draft.css';
import '../../css/document.css';
import { Menu, Item, Submenu, useContextMenu } from 'react-contexify';
import 'react-contexify/ReactContexify.css';
import { useSelector} from 'react-redux'
import { current } from '@reduxjs/toolkit';

const ASSOCIATION_TYPE_CHARACTER = "character";
const ASSOCIATION_TYPE_EVENT = "event";
const ASSOCIATION_TYPE_PLACE = "place";
const tabLength = 5;

const associations = [];
associations.push({type:ASSOCIATION_TYPE_CHARACTER, name:"lo", details:{aliases:""}})

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
/*
const insertTab = (editorState) => {
  const selection = editorState.getSelection();
  const currentContent = editorState.getCurrentContent();
  const contentStateWithEntity = currentContent.createEntity('TAB', 'IMMUTABLE');
  const entityKey = contentStateWithEntity.getLastCreatedEntityKey();
  const textWithEntity = Modifier.insertText(currentContent, selection, generateTabCharacter(), null, entityKey);
  const newState = EditorState.push(editorState, textWithEntity, 'apply-entity');
  return EditorState.forceSelection(newState, textWithEntity.getSelectionAfter());
}*/

const insertTab = (editorState, blockKey) => {
  const selection = SelectionState.createEmpty(blockKey)
  const currentContent = editorState.getCurrentContent();
  const contentStateWithEntity = currentContent.createEntity('TAB', 'IMMUTABLE');
  const entityKey = contentStateWithEntity.getLastCreatedEntityKey();
  const textWithEntity = Modifier.insertText(currentContent, selection, generateTabCharacter(), null, entityKey);
  const newState = EditorState.push(editorState, textWithEntity, 'apply-entity');
  return EditorState.forceSelection(newState, textWithEntity.getSelectionAfter());
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
      data.sort((a, b) => a.place.Value > b.place.Value);
      console.log("data", data);
      const newBlocks = [];
      data.forEach(piece => {
        const jsonBlock = JSON.parse(piece.chunk.Value);
        const block = new ContentBlock({
          characterList: jsonBlock.characterList,
          depth: jsonBlock.depth,
          key: piece.keyID.Value,
          text: jsonBlock.text,
          type: jsonBlock.type
        });
        newBlocks.push(block);
      });
      const contentState = {
        entityMap: {},
        blocks: newBlocks
      };
      setEditorState(EditorState.createWithContent(convertFromRaw(contentState), CreateDecorators(associations)));
    }).catch(error => {
      console.error("get story blocks", error);
    })
  }

  useEffect(() => {
    if (isLoggedIn && currentStoryID) {
        getAllStoryBlocks()
    }
}, [isLoggedIn, currentStoryID]);

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
    const params = {}
    params.title = currentStoryID;
    params.blocks = [];
    let index = 0;
    blockList.forEach((block) => {
      params.blocks.push({keyID:block.getKey(), place:index.toString()})
      index++;
    })
    fetch(process.env.REACT_APP_SERVER_URL + '/api/stories/' + currentStoryID + '/orderMap', {
      method: "PUT",
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    }).then((response) => {
      console.log("response", response);
    }).catch((error) => {
      console.error("ERR", error);
    });
  }

  const deleteBlockfromServer = async(key) => {
    const response = fetch(process.env.REACT_APP_SERVER_URL + '/api/stories/' + currentStoryID + '/block', {
      method: "DELETE",
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        keyID: key
      })
    });
    if (!response.ok) {
      const message = 'An error has occured: ' + response.status;
      throw new Error(message);
    }
    return response.json();
  }

  //this should be queued up and sent in batches at set intervals... currently on every keystroke = not feasable
  const saveBlock = async(key, chunk, place) => {
    console.log("saving", key, chunk, place);
    const response = await fetch(process.env.REACT_APP_SERVER_URL + '/api/stories/' + currentStoryID, {
      method: "PUT",
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        keyID: key,
        chunk: chunk,
        place: place.toString()
      })
    });
    if (!response.ok) {
      const message = `An error has occured: ${response.status}`;
      throw new Error(message);
    }
    return response.json();
  }

  const keyBindings = (event) => {
    // tab pressed
    if (event.keyCode === 9) {
      event.preventDefault();
      //setEditorState(insertTab(editorState));
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
      console.log("creating new", id)
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
    setEditorState(RichUtils.toggleInlineStyle(editorState, style));
  }

  const handleKeyCommand = (command) => {
    setEditorState(RichUtils.handleKeyCommand(editorState, command));
  }

  const updateEditorState = (newEditorState) => {
    console.log("updateEditorState")
    const newContent = newEditorState.getCurrentContent();
    const newBlockMap = newContent.getBlockMap();
    const oldContent = editorState.getCurrentContent();
    const oldBlockMap = oldContent.getBlockMap();
    const currentSelection = newEditorState.getSelection();
    const lastSelection = editorState.getSelection();
    const min = lastSelection.getIsBackward() ? lastSelection.getFocusKey() : lastSelection.getAnchorKey();
    const max = lastSelection.getIsBackward() ? lastSelection.getAnchorKey() : lastSelection.getFocusKey();
    const firstSubselection = oldBlockMap.skipUntil((v, k) => k === min);
    const toReverse = firstSubselection.reverse();
    const subselection = toReverse.skipUntil((v, k) => k === max);
    const [...selectedKeys] = subselection.keys();
    
    let resyncRequired = false;
    
    newBlockMap.forEach((block) => {
      if (!oldBlockMap.has(block.getKey())) {
        // this is a brand new block
        resyncRequired = true;
        saveBlock(block.getKey(), newContent.getBlockForKey(block.getKey()), 0);
      }
    });

    oldBlockMap.forEach((block) => {
      if (!newBlockMap.has(block.getKey())) {
        //a block was removed
        if (selectedKeys.indexOf(block.getKey()) !== -1) {
          selectedKeys.splice(selectedKeys.indexOf(block.getKey()), 1);
        }
        resyncRequired = true;
        deleteBlockfromServer(block.getKey());
      }
    })
    
    const newBlocks = [...newBlockMap.values()];
    selectedKeys.forEach(key => {
      console.log("selected", selectedKeys)
      const ind = newBlocks.findIndex(block => block.get('key') === key);
      saveBlock(key, newContent.getBlockForKey(key), ind);
    })
      
    
    if (resyncRequired) {
      syncBlockOrderMap(newBlockMap);
    }
    //
    setEditorState(newEditorState);
  }

  const applyTabEntity = (newEditorState, block) => {
    const content = newEditorState.getCurrentContent();
    const firstChar = block.getCharacterList().get(0);
    const newBlockSelection = SelectionState.createEmpty(block.getKey());
    console.log("curr block", block.getKey());
    console.log("exists"), content.getBlockForKey(block.getKey());
 //|| (block.getText()[0].toUpperCase() === block.getText()[0])
      if (!firstChar || (firstChar && firstChar.entity === null) || (firstChar && content.getEntity(firstChar.entity).getType() !== 'TAB')) {
        console.log("tabbing", block.getText());
        const contentStateWithEntity = content.createEntity('TAB', 'IMMUTABLE');
        const entityKey = contentStateWithEntity.getLastCreatedEntityKey();
        return EditorState.push(newEditorState, Modifier.insertText(content, newBlockSelection, generateTabCharacter(), null, entityKey));
      }
    
    return newEditorState;
  }


  const handlePasteAction = (text) => {

    const blockMap = ContentState.createFromText(text).blockMap;
    const newState = Modifier.replaceWithFragment(editorState.getCurrentContent(), editorState.getSelection(), blockMap);
    updateEditorState(EditorState.push(editorState, newState, 'insert-fragment'));
    return true;
    /*
    const oldContent = editorState.getCurrentContent();
    const oldBlockMap = oldContent.getBlockMap();
    const newContent = ContentState.createFromText(text);
    const newBlockMap = newContent.getBlockMap();
    let updatedEditor = editorState;
    newBlockMap.map((block) => {
      const currentKey = block.getKey();
      if (!oldBlockMap.has(currentKey)) {
        //new block pasted
        const updatedContent = Modifier.replaceWithFragment(oldContent, editorState.getSelection(), newBlockMap);
        //updatedState.push(EditorState.push(editorState, updatedContent, 'insert-fragment'));
        updatedEditor = EditorState.push(updatedEditor, updatedContent, 'insert-fragment');

        //setEditorState(applyTabEntity(editorState, block));
        //return
        //saveBlock(block.getKey(), block, 0);
      }
    });
    setEditorState(editorState, updatedEditor);
    console.log("updated", updatedEditor)
    //setEditorState(editorState, updatedState[updatedState.length-1])
    /*
    const oldContent = editorState.getCurrentContent();
    const oldBlockMap = oldContent.getBlockMap();
    const newContent = ContentState.createFromText(text);
    const newBlockMap = newContent.getBlockMap();
    let newEditorState = editorState;
    newBlockMap.forEach((block) => {
      const currentKey = block.getKey();
      if (!oldBlockMap.has(currentKey)) {
        //new block pasted
        
        const updatedContent = Modifier.replaceWithFragment(oldContent, editorState.getSelection(), newBlockMap);
        //setEditorState(EditorState.push(editorState, newState, 'insert-fragment'));
        newEditorState = EditorState.push(editorState, updatedContent, 'insert-fragment');
        //saveBlock(block.getKey(), block, 0);
      }
    });
    setEditorState(newEditorState);

    const revisedContent = newEditorState.getCurrentContent();
    const revisedBlockMap = revisedContent.getBlockMap();
    revisedBlockMap.forEach((block) => {
      const firstChar = block.getCharacterList().get(0);
      const selection = SelectionState.createEmpty(block.getKey());
      //newEditorState = EditorState.forceSelection(newEditorState, selection);
      if (firstChar) {
        if ((firstChar.entity === null) || (block.getText()[0].toUpperCase() === block.getText()[0]) ||
            (revisedContent.getEntity(firstChar.entity).getType() !== 'TAB')) {
          console.log("tabbing", block.getText());
          newEditorState = EditorState.push(newEditorState, createTabEntity(revisedContent, selection), 'apply-entity');
        }
      } else {
        newEditorState = EditorState.push(newEditorState, createTabEntity(revisedContent, selection), 'apply-entity');
      }
    });
    setEditorState(newEditorState);*/

    
    //setEditorState(editorState => ({ ...editorState, newEditorState }));
   // const list = [...editorState.getCurrentContent().getBlockMap().values()];
    //syncBlockOrderMap(list);
    return true;
  }

  return (
    <div>
      <nav className="rich-controls">
        <button onMouseDown={(e) => {handleStyleClick(e,'BOLD')}}><b>B</b></button>
        <button onMouseDown={(e) => {handleStyleClick(e,'ITALIC')}}><i>I</i></button>
        <button onMouseDown={(e) => {handleStyleClick(e,'UNDERLINE')}}><u>U</u></button>
        <button onMouseDown={(e) => {handleStyleClick(e,'STRIKETHROUGH')}}><s>S</s></button>
      </nav>
      <section onContextMenu={handleContextMenu}>
        <Editor editorState={editorState} stripPastedStyles={true} onChange={updateEditorState} handlePastedText={handlePasteAction} handleKeyCommand={handleKeyCommand} keyBindingFn={keyBindings} ref={domEditor} />
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