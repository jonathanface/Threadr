import { CharacterMetadata, ContentBlock, EditorState, Modifier, SelectionState } from "draft-js";
import Immutable from "immutable";
import { DBOperation, DBOperationTask, DBOperationType, DocumentBlockStyle, EntityData } from "../../types";

const TAB_LENGTH = 5;

export const documentStyleMap = {
  strikethrough: {
    textDecoration: "line-through",
  },
  bold: {
    fontWeight: "bold",
  },
  italic: {
    fontStyle: "italic",
  },
  underscore: {
    textDecoration: "underline",
  },
};

export const GetSelectedBlockKeys = (editorState: EditorState) => {
  const lastSelection = editorState.getSelection();
  const min = lastSelection.getIsBackward() ? lastSelection.getFocusKey() : lastSelection.getAnchorKey();
  const max = lastSelection.getIsBackward() ? lastSelection.getAnchorKey() : lastSelection.getFocusKey();
  const blockMap = editorState.getCurrentContent().getBlockMap();
  const firstSubselection = blockMap.skipUntil((v, k) => k === min);
  const toReverse = firstSubselection.reverse();
  const subselection = toReverse.skipUntil((v, k) => k === max);
  const iterator = subselection.keys();
  const iterable = {
    [Symbol.iterator]: () => iterator,
  };
  const selectedKeys = Array.from(iterable);
  return selectedKeys;
};

export const GetEntityData = (block: ContentBlock, type: string, list: EntityData[]) => {
  block.findEntityRanges(
    (character: CharacterMetadata) => character.getEntity() !== null,
    (start, end) => {
      list.push({
        start: start,
        end: end,
        type: type,
      });
    }
  );
  return list;
};

export const GetBlockStyleDataByType = (block: ContentBlock, type: string) => {
  const list: DocumentBlockStyle[] = [];
  block.findStyleRanges(
    (character) => {
      return character.hasStyle(type);
    },
    (start, end) => {
      list.push({
        start: start,
        end: end,
        name: type,
      });
    }
  );
  return list;
};
interface OpsHolder {
  [key: string]: DBOperationTask[]; // or a more specific type instead of any
}
export const filterAndReduceDBOperations = (
  dbOperations: DBOperation[],
  opType: DBOperationType,
  startIndex: number
) => {
  const keyIDMap: OpsHolder = {};
  let j = startIndex;
  while (j < dbOperations.length) {
    const obj = dbOperations[j];
    if (obj.type === opType) {
      obj.ops.forEach((op) => {
        keyIDMap[op.key_id] = keyIDMap[op.key_id] === undefined ? [] : keyIDMap[op.key_id];
        keyIDMap[op.key_id].push(op);
      });
      dbOperations.splice(j, 1);
    } else {
      j++;
    }
  }

  const toRun: DBOperationTask[] = [];
  Object.keys(keyIDMap).forEach((keyID) => {
    const lastElement = keyIDMap[keyID].pop();
    if (lastElement) {
      toRun.push(lastElement);
    }
    delete keyIDMap[keyID];
  });
  return toRun;
};

export const GetSelectedText = (editorState: EditorState) => {
  const selection = editorState.getSelection();
  const anchorKey = selection.getAnchorKey();
  const currentContent = editorState.getCurrentContent();
  const currentBlock = currentContent.getBlockForKey(anchorKey);

  const start = selection.getStartOffset();
  const end = selection.getEndOffset();
  const selectedText = currentBlock.getText().slice(start, end);
  return selectedText;
};

export const GenerateTabCharacter = (tabLength?: number) => {
  tabLength = tabLength ? tabLength : TAB_LENGTH;
  let tab = "";
  for (let i = 0; i < tabLength; i++) {
    tab += " ";
  }
  return tab;
};

const replacementMap = new Map([
  [/--/g, "—"], // Replace double dashes with emdashes
]);

export const ReplaceCharacters = (editorState: EditorState) => {
  const contentState = editorState.getCurrentContent();
  const blockMap = contentState.getBlockMap();
  let newContentState = contentState;
  blockMap.forEach((block: ContentBlock | undefined) => {
    if (block) {
      let blockText = block.getText();
      replacementMap.forEach((replacement, regex) => {
        let matchArr;
        while ((matchArr = regex.exec(blockText)) !== null) {
          const start = matchArr.index;
          const end = start + matchArr[0].length;
          const selectionState = editorState.getSelection().merge({
            anchorKey: block.getKey(),
            anchorOffset: start,
            focusKey: block.getKey(),
            focusOffset: end,
          });

          newContentState = Modifier.replaceText(newContentState, selectionState, replacement);

          // Update blockText to reflect the most recent replacement for subsequent searches
          blockText = newContentState.getBlockForKey(block.getKey()).getText();
        }
      });
    }
  });

  if (newContentState !== contentState) {
    return EditorState.push(editorState, newContentState, "insert-characters");
  }

  return editorState;
};

export const InsertTab = (editorState: EditorState, selection: SelectionState) => {
  const selectedKeys = GetSelectedBlockKeys(editorState);
  let newEditorState = editorState;

  if (selectedKeys.length > 1) {
    let content = newEditorState.getCurrentContent();
    selectedKeys.forEach((key) => {
      const block = content.getBlockForKey(selection.getFocusKey());
      const tabData = block.getData().getIn(["ENTITY_TABS"]) ? block.getData().getIn(["ENTITY_TABS"]) : [];
      tabData.push({ start: 0, end: TAB_LENGTH, type: "TAB" });
      const contentStateWithEntityData = Modifier.mergeBlockData(
        content,
        selection,
        Immutable.Map([["ENTITY_TABS", tabData]])
      );
      const contentStateWithEntity = content.createEntity("TAB", "IMMUTABLE");
      const entityKey = contentStateWithEntity.getLastCreatedEntityKey();
      const contentStateWithEntityText = Modifier.insertText(
        contentStateWithEntityData,
        SelectionState.createEmpty(key),
        GenerateTabCharacter(),
        undefined,
        entityKey
      );
      newEditorState = EditorState.push(newEditorState, contentStateWithEntityText, "insert-characters");
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
    tabData.push({ start: selection.getFocusOffset(), end: selection.getFocusOffset() + TAB_LENGTH, type: "TAB" });
    const contentStateWithEntityData = Modifier.mergeBlockData(
      content,
      selection,
      Immutable.Map([["ENTITY_TABS", tabData]])
    );
    const contentStateWithEntity = content.createEntity("TAB", "IMMUTABLE");
    const entityKey = contentStateWithEntity.getLastCreatedEntityKey();
    const contentStateWithEntityText = Modifier.insertText(
      contentStateWithEntityData,
      selection,
      GenerateTabCharacter(),
      undefined,
      entityKey
    );
    const editorStateWithData = EditorState.push(newEditorState, contentStateWithEntityText, "insert-characters");
    newEditorState = EditorState.forceSelection(editorStateWithData, contentStateWithEntityText.getSelectionAfter());
  } else {
    console.error("no blocks selected");
  }
  return newEditorState;
};

export const UCWords = (str: string) => {
  return str
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};
