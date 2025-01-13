import { SerializedElementNode, SerializedLexicalNode } from "lexical";
import { BlockOrderMap } from "./Document";

export interface DocumentBlocksForServer {
  story_id: string;
  chapter_id: string;
  blocks: DBOperationBlock[];
}

export interface DBOperationBlock {
  key_id: string;
  chunk?: SerializedElementNode<SerializedLexicalNode>;
  place?: string;
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
  blocks: DBOperationBlock[];
  orderList?: BlockOrderMap;
}
