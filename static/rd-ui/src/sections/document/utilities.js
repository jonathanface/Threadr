import Immutable from 'immutable';
import {EditorState, Modifier, SelectionState} from 'draft-js';

export const GetSelectedBlockKeys = (editorState) => {
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

export const GetStyleData = (block, type, list) => {
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

export const FilterAndReduceDBOperations = (dbOperations, op, i) => {
  const keyIDMap = {};
  let j = i;
  while (j < dbOperations.length) {
    const obj = dbOperations[j];
    if (obj.type === op.type) {
      obj.ops.forEach(op => {
        keyIDMap[op.key_id] = keyIDMap[op.key_id] === undefined ? [] : keyIDMap[op.key_id];
        keyIDMap[op.key_id].push(op);
      });
      dbOperations.splice(j, 1);
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

export const GetSelectedText = (editorState) => {
  const selection = editorState.getSelection();
  const anchorKey = selection.getAnchorKey();
  const currentContent = editorState.getCurrentContent();
  const currentBlock = currentContent.getBlockForKey(anchorKey);

  const start = selection.getStartOffset();
  const end = selection.getEndOffset();
  const selectedText = currentBlock.getText().slice(start, end);
  return selectedText;
}

const TAB_LENGTH = 5;
  
export const GenerateTabCharacter = (tabLength) => {
  tabLength = tabLength ? tabLength = tabLength : tabLength = TAB_LENGTH;
  let tab = '';
  for (let i=0; i < tabLength; i++) {
    tab += ' ';
  }
  return tab;
}

export const InsertTab = (editorState, selection) => {
  const selectedKeys = GetSelectedBlockKeys(editorState);
  let newEditorState = editorState;
  
  if (selectedKeys.length > 1) {
    let content = newEditorState.getCurrentContent();
    selectedKeys.map(key => {
      const block = content.getBlockForKey(selection.getFocusKey());
      const tabData = block.getData().getIn(["ENTITY_TABS"]) ? block.getData().getIn(["ENTITY_TABS"]) : [];
      tabData.push({start: 0, end: TAB_LENGTH});
      const contentStateWithEntityData = Modifier.mergeBlockData(
        content,
        selection,
        Immutable.Map([['ENTITY_TABS', tabData]])
      );
      const contentStateWithEntity = content.createEntity(
        'TAB',
        'IMMUTABLE'
      );
      const entityKey = contentStateWithEntity.getLastCreatedEntityKey();
      const contentStateWithEntityText = Modifier.insertText(
        contentStateWithEntityData,
        SelectionState.createEmpty(key),
        GenerateTabCharacter(),
        null,
        entityKey
      );
      newEditorState = EditorState.push(newEditorState, contentStateWithEntityText);
      content = newEditorState.getCurrentContent();
    });
    newEditorState = EditorState.forceSelection(newEditorState, content.getSelectionAfter());
  } else if (selectedKeys.length) {
    if (!selection.isCollapsed()) {
      selection = SelectionState.createEmpty(selection.getFocusKey());
    }
    const content = newEditorState.getCurrentContent();
    const block = content.getBlockForKey(selection.getFocusKey());
    const tabData = block.getData().getIn(["ENTITY_TABS"]) ? block.getData().getIn(["ENTITY_TABS"]) : [];
    tabData.push({start: selection.getFocusOffset(), end: selection.getFocusOffset() + TAB_LENGTH});
    const contentStateWithEntityData = Modifier.mergeBlockData(
      content,
      selection,
      Immutable.Map([['ENTITY_TABS', tabData]])
    );
    const contentStateWithEntity = content.createEntity(
      'TAB',
      'IMMUTABLE'
    );
    const entityKey = contentStateWithEntity.getLastCreatedEntityKey();
    const contentStateWithEntityText = Modifier.insertText(
      contentStateWithEntityData,
      selection,
      GenerateTabCharacter(),
      null,
      entityKey
    );
    const editorStateWithData = EditorState.push(newEditorState, contentStateWithEntityText);
    newEditorState = EditorState.forceSelection(editorStateWithData, contentStateWithEntityText.getSelectionAfter());
  } else {
    console.error("no blocks selected");
  }
  return newEditorState;
}

export const SetFocusAndRestoreCursor = (editorState, ref) => {
  const selection = editorState.getSelection();
    const newSelection = selection.merge({
      anchorOffset: selection.getIsBackward() ? selection.getAnchorOffset() : selection.getFocusOffset(),
      focusOffset: selection.getIsBackward() ? selection.getAnchorOffset() : selection.getFocusOffset()
    })
    ref.current.focus();
    return EditorState.forceSelection(editorState, newSelection);
}
