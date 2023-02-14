import React, {useRef, useEffect} from 'react';
import {convertFromRaw, Editor, EditorState, ContentBlock, RichUtils, getDefaultKeyBinding, Modifier} from 'draft-js';
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

const insertTab = (editorState) => {
  const selection = editorState.getSelection();
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
      data.sort((a, b) => a.order.Value > b.order.Value);
      console.log("data", data);
      const newBlocks = [];
      data.forEach(chunk => {
        const jsonBlock = JSON.parse(chunk.block.Value);
        const block = new ContentBlock({
          characterList: jsonBlock.characterList,
          depth: jsonBlock.depth,
          key: chunk.key.Value,
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
    const params = [];
    blockList.forEach((block, index) => {
      params.push({key:block.getKey(), order:index.toString()})
    })
    console.log("params", params);
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

  const deleteBlockfromServer = (key) => {
    fetch(process.env.REACT_APP_SERVER_URL + '/api/stories/' + currentStoryID + '/block', {
      method: "DELETE",
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        key: key
      })
    }).then((response) => {
      console.log("response", response);
    }).catch((error) => {
      console.error("ERR", error);
    });
  }

  //this should be queued up and sent in batches at set intervals... currently on every keystroke = not feasable
  const saveBlock = (key, block, order) => {
    fetch(process.env.REACT_APP_SERVER_URL + '/api/stories/' + currentStoryID, {
      method: "PUT",
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        key: key,
        block: block,
        order: order.toString()
      })
    }).then((response) => {
      console.log("response", response);
    }).catch((error) => {
      console.error("ERR", error);
    });
  }

  const keyBindings = (event) => {
    // tab pressed
    if (event.keyCode === 9) {
      event.preventDefault();
      setEditorState(insertTab(editorState));
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
    const selection = newEditorState.getSelection();
    const content = newEditorState.getCurrentContent();
    
    // Getting all affected blocks, being sure to include
    // multiple blocks in the case a cursor selection was active
    // and spanning multiple blocks, such as selecting 5 lines
    // and then hitting delete.
    const oldSelection = editorState.getSelection();
    const oldBlockMap = editorState.getCurrentContent().getBlockMap();
    const min = oldSelection.getIsBackward() ? oldSelection.getFocusKey() : oldSelection.getAnchorKey();
    const max = oldSelection.getIsBackward() ? oldSelection.getAnchorKey() : oldSelection.getFocusKey();
    const firstSubselection = oldBlockMap.skipUntil((v, k) => k === min);
    const toReverse = firstSubselection.reverse();
    const subselection = toReverse.skipUntil((v, k) => k === max);
    const [...keysToVerify] = subselection.keys();

    let deletedBlocks = false;
    const list = [...content.getBlockMap().values()];
    keysToVerify.forEach(blockKey => {
      const activeBlockPosition = list.findIndex(block => block.get('key') === blockKey);
      if (activeBlockPosition === -1) {
        deleteBlockfromServer(blockKey);
        deletedBlocks = true;
      } else {
        saveBlock(blockKey, content.getBlockForKey(blockKey), activeBlockPosition);
      }
    })
    if (deletedBlocks) {
      // some blocks were deleted so we have to resynch our ordering
      // TO-DO this might be costly with giant documents
      syncBlockOrderMap(list);
    }

    const currentKey = selection.getFocusKey()
    const blockTree = editorState.getBlockTree(currentKey);
    if (!blockTree) {
      // new paragraph added
      const currentBlock = content.getBlockForKey(currentKey);
      const firstChar = currentBlock.getCharacterList().get(0);
      // Auto-insert tab TO-DO should only be on text-align left
      if ((!firstChar || firstChar && firstChar.entity == null) ||
          (!firstChar || content.getEntity(firstChar.entity).getType() !== 'TAB')) {
          newEditorState = insertTab(newEditorState);
        }
    }
    
    setEditorState(newEditorState);
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
        <Editor editorState={editorState} onChange={updateEditorState} handleKeyCommand={handleKeyCommand} keyBindingFn={keyBindings} ref={domEditor} />
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