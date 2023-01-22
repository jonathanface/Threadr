import React, {useRef} from 'react';
import ReactDOM from 'react-dom';
import {Editor, EditorState, ContentState, CompositeDecorator, SelectionState} from 'draft-js';
import 'draft-js/dist/Draft.css';
import '../css/document.css';
import { Menu, Item, Submenu, useContextMenu } from 'react-contexify';
import 'react-contexify/ReactContexify.css';


const ASSOCIATION_TYPE_CHARACTER = "character";
const ASSOCIATION_TYPE_EVENT = "event";
const ASSOCIATION_TYPE_PLACE = "place";



const associations = [];
associations.push({type:ASSOCIATION_TYPE_CHARACTER, name:"lo", details:{aliases:""}})


const HighlightSpan = (props) => {
  return (
    <span onClick={(e)=> {props.leftclickFunc(props.decoratedText, props.type);}} className={"highlight " + props.type }>
      {props.children}
    </span>
  );
};

const getRegexString = (string) => {
  return '\\b' + string + '\\b';
}

/**
   * Find entities of type character in block
   *
   * @param {ContentBlock} contentBlock
   * @param {function} callback
   * @param {ContentState} contentState
   */
const findHighlightable = (entityType) => {
  return (contentBlock, callback) => {
    const text = contentBlock.getText();
    associations.map((association) => {
      if (association.type !== entityType) {
        return;
      }
      console.log("looking for", association.type)
      const name = association.name.trim();
      if (!name.length) {
        return;
      }
      let match;
      const regexStr = getRegexString(name);
      let caseFlag = 'gm';
      const deets = association.details;
      if (!deets.caseSensitive) {
        caseFlag += 'i';
      }
      const regex = new RegExp(regexStr, caseFlag);
      while ((match = regex.exec(text)) !== null) {
        const start = match.index + match[0].length - match[0].replace(/^\s+/, '').length;
        callback(start, start + name.length);
      }
      const aliasesToArray = deets.aliases.split(',');
      for (let z=0; z < aliasesToArray.length; z++) {
        const alias = aliasesToArray[z].trim();
        if (alias.length) {
          const regexStr = getRegexString(alias);
          const regex = new RegExp(regexStr, caseFlag);
          while ((match = regex.exec(text)) !== null) {
            const start = match.index + match[0].length - match[0].replace(/^\s+/, '').length;
            callback(start, start + alias.length);
          }
        }
      }
    });
  }
}

const clickedDecorator = (name, type) => {
  console.log('clicked', name, type);
}

const createDecorators = () => {
  const decorators = [];
  associations.map((association) => {
    decorators.push({
      strategy: findHighlightable(association.type),
      component: HighlightSpan,
      props: {
        type: association.type,
        leftclickFunc: clickedDecorator
        // rightclickFunc: this.clickedCharacterContext.bind(this)
      }
    });
  });
  return new CompositeDecorator(decorators);
}

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


function Document() {

  const domEditor = useRef(null);

  const [editorState, setEditorState] = React.useState(
    () => EditorState.createWithContent(ContentState.createFromText('blah lo hoo boy'), createDecorators())
  );

  const setFocus = () => {
    domEditor.current.focus();
  }

  const forceStateUpdate = () => {
    return EditorState.set(editorState, {decorator: createDecorators()});
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
      const selection = editorState.getSelection();
      const newSelection = selection.merge({
        anchorOffset:selection.getFocusOffset()
      })
      setFocus();
      const newEditorState = forceStateUpdate();
      const withSelection = EditorState.forceSelection(newEditorState, newSelection);
      setEditorState(withSelection);
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

  return (
    <div>
      <section onContextMenu={handleContextMenu}>
        <Editor editorState={editorState} onChange={setEditorState} ref={domEditor} />
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