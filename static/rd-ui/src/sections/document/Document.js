import React, {useRef} from 'react';
import {Editor, EditorState, ContentState, RichUtils, getDefaultKeyBinding, Modifier} from 'draft-js';
import {CreateDecorators} from './decorators.js'
import 'draft-js/dist/Draft.css';
import '../../css/document.css';
import { Menu, Item, Submenu, useContextMenu } from 'react-contexify';
import 'react-contexify/ReactContexify.css';

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


const Document = (props) => {
  console.log("props", props)

  const domEditor = useRef(null);

  const [editorState, setEditorState] = React.useState(
    () => EditorState.createEmpty(CreateDecorators(associations))
  );

  const LoadStory = (storyID) => {
    console.log("in doc", storyID);
  } 

  const setFocusAndRestoreCursor = (editorState) => {
    const selection = editorState.getSelection();
      const newSelection = selection.merge({
        anchorOffset: selection.getIsBackward() ? selection.getAnchorOffset() : selection.getFocusOffset(),
        focusOffset: selection.getIsBackward() ? selection.getAnchorOffset() : selection.getFocusOffset()
      })
      domEditor.current.focus();
      return EditorState.forceSelection(editorState, newSelection);
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
    const blockTree = editorState.getBlockTree(newEditorState.getSelection().getFocusKey());
    if (!blockTree) {
      // new paragraph added
      const thisBlock = newEditorState.getCurrentContent().getBlockForKey(newEditorState.getSelection().getFocusKey());
      const firstChar = thisBlock.getCharacterList().get(0);
      // Auto-insert tab TO-DO should only be on text-align left
      if ((!firstChar || firstChar && firstChar.entity == null) ||
          (!firstChar || newEditorState.getCurrentContent().getEntity(firstChar.entity).getType() !== 'TAB')) {
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