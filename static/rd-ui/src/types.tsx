import { AttributeValue } from "@aws-sdk/client-dynamodb";
import { BlockMap, ContentBlock } from "draft-js";
export type AttributeMap = { [key: string]: AttributeValue };

export interface AssociationDetails {
  aliases: string;
  case_sensitive: boolean;
  extended_description: string;
}

export interface Association {
  association_id: string;
  association_name: string;
  association_type: string;
  short_description: string;
  portrait: string;
  details: AssociationDetails;
}

export interface BlocksData {
  last_evaluated_key: AttributeMap;
  scanned_count: number;
  items: AttributeMap;
}

export interface Chapter {
  id: string;
  story_id: string;
  place: number;
  title: string;
  bup_arm?: string;
}

export interface Story {
  [key: string]: any;
  story_id: string;
  created_at?: number;
  title: string;
  description: string;
  series_id?: string;
  chapters: Chapter[];
  place?: number;
  image_url: string;
}

export interface Series {
  [key: string]: any;
  series_id: string;
  series_title: string;
  series_description: string;
  stories: Story[];
  created_at: number;
  image_url: string;
}

export interface DocumentBlockStyle {
  style: string;
  start: number;
  end: number;
}

export interface DocumentTab {
  start: number;
  end: number;
}
export interface BlockOrder {
  key_id: string;
  place: string;
}
export interface BlockOrderMap {
  chapter_id: string;
  blocks: BlockOrder[];
}

export interface BlocksForServer {
  story_id: string;
  chapter_id: string;
  blocks: ContentBlock[];
}

export interface DBOperationTask {
  key_id: string;
  chunk: ContentBlock | null;
  place: string | null;
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
  ops: DBOperationTask[] | null;
  blockList?: BlockMap;
}
