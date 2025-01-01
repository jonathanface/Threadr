import { AttributeValue } from "@aws-sdk/client-dynamodb";

export type AttributeMap = { [key: string]: AttributeValue };

export interface BlocksData {
  last_evaluated_key: AttributeMap;
  scanned_count: number;
  items: AttributeMap;
}

export interface DocumentBlockStyle {
  name: string;
  start: number;
  end: number;
  style?: string; // alias for name, deprecated
}

export interface DocumentTab {
  start: number;
  end: number;
}
export interface BlockData {
  STYLES?: DocumentBlockStyle[];
  ENTITY_TABS?: DocumentTab[];
}

export interface BlockOrder {
  key_id: string;
  place: string;
}
export interface BlockOrderMap {
  chapter_id: string;
  blocks: BlockOrder[];
}

export interface CharMetadata {
  style: string[]; // Assuming style is an array of string identifiers for styles
  entity: string | undefined;
}

export interface EntityData {
  start: number;
  end: number;
  type: string;
}

export enum BlockAlignmentType {
  left = "left",
  right = "right",
  center = "center",
  justify = "justify",
}

export enum TextFormatType {
  bold = "bold",
  italic = "italic",
  underscore = "underscore",
  strikethrough = "strikethrough",
}
