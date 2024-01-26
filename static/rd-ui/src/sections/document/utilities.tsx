import { CharacterMetadata, ContentBlock, EditorState, Entity, Modifier, SelectionState } from "draft-js";
import Immutable from "immutable";
import { DBOperation, DBOperationTask, DocumentBlockStyle } from "../../types";

export const GetSelectedBlockKeys = (editorState: EditorState): string[] => {
  const lastSelection = editorState.getSelection();
  const min = lastSelection.getIsBackward() ? lastSelection.getFocusKey() : lastSelection.getAnchorKey();
  const max = lastSelection.getIsBackward() ? lastSelection.getAnchorKey() : lastSelection.getFocusKey();
  const blockMap = editorState.getCurrentContent().getBlockMap();
  const firstSubselection = blockMap.skipUntil((v, k) => k === min);
  const toReverse = firstSubselection.reverse();
  const subselection = toReverse.skipUntil((v, k) => k === max);
  const results: string[] = [];
  const iterator: Immutable.Iterator<string> = subselection.keys();
  let result = iterator.next();
  while (!result.done) {
    results.push(result.value);
    result = iterator.next();
  }
  return results;
};

export const GetEntityData = (block: ContentBlock, type: string, list: Entity[]): Entity[] => {
  block.findEntityRanges(
    (value: CharacterMetadata) => {
      return value.getEntity() !== null;
    },
    (start: number, end: number) => {
      list.push({
        start: start,
        end: end,
        type: type,
      });
    }
  );
  return list;
};

export const GetBlockStyleDataByType = (block: ContentBlock, type: string): DocumentBlockStyle[] => {
  const list: DocumentBlockStyle[] = [];
  block.findStyleRanges(
    (character) => {
      return character.hasStyle(type);
    },
    (start, end) => {
      list.push({
        start: start,
        end: end,
        style: type,
      });
    }
  );
  return list;
};

export const FilterAndReduceDBOperations = (
  operationList: DBOperation[],
  currentOperation: DBOperation,
  idx: number
): ContentBlock[] => {
  const keyIDMap: Map<string, ContentBlock[]> = new Map();
  let j = idx;
  while (j < operationList.length) {
    const obj = operationList[j];
    if (!obj.ops) {
      return [];
    }
    if (obj.type === currentOperation.type) {
      obj.ops.forEach((op: DBOperationTask) => {
        if (!keyIDMap.has(op.key_id) && op.chunk) {
          keyIDMap.set(op.key_id, [op.chunk]); // Initialize with an array containing 'op'
        } else if (op.chunk) {
          keyIDMap.get(op.key_id)?.push(op.chunk); // Use optional chaining for safety
        }
      });
      operationList.splice(j, 1);
    } else {
      j++;
    }
  }
  const toRun: ContentBlock[] = [];
  keyIDMap.forEach((value, key) => {
    const task = value.pop();
    if (task) {
      toRun.push(task);
      keyIDMap.delete(key);
    }
  });
  return toRun;
};

export const GetSelectedText = (editorState: EditorState): string => {
  const selection = editorState.getSelection();
  const anchorKey = selection.getAnchorKey();
  const currentContent = editorState.getCurrentContent();
  const currentBlock = currentContent.getBlockForKey(anchorKey);

  const start = selection.getStartOffset();
  const end = selection.getEndOffset();
  const selectedText = currentBlock.getText().slice(start, end);
  return selectedText;
};

const TAB_LENGTH = 5;

export const GenerateTabCharacter = (tabLength?: number): string => {
  tabLength = tabLength ? tabLength : TAB_LENGTH;
  let tab = "";
  for (let i = 0; i < tabLength; i++) {
    tab += " ";
  }
  return tab;
};

export const InsertTab = (editorState: EditorState, selection: SelectionState) => {
  const selectedKeys = GetSelectedBlockKeys(editorState);
  let newEditorState = editorState;

  if (selectedKeys.length > 1) {
    let content = newEditorState.getCurrentContent();
    selectedKeys.forEach((key: string) => {
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

export const UCWords = (str: string): string => {
  return str
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};
