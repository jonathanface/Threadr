import { BlockMap, ContentBlock } from "draft-js";

export interface DocumentBlocksForServer {
  story_id: string;
  chapter_id: string;
  blocks: DBOperationTask[];
}

export interface DBOperationTask {
  key_id: string;
  chunk: ContentBlock;
  place: string;
}

export enum DBOperationType {
  delete,
  syncOrder,
  save,
}

export interface DBOperation {
  type: DBOperationType;
  storyID: string;
  chapterID: string;
  time: number;
  ops: DBOperationTask[];
  blockList?: BlockMap;
}
