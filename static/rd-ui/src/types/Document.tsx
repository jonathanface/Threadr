import { AttributeValue } from "@aws-sdk/client-dynamodb";
import { SerializedElementNode, SerializedLexicalNode } from "lexical";


export interface ParagraphData {
  key?: string;
  content?: string;
  json?: SerializedElementNode<SerializedLexicalNode>;
  type?: string;
  version?: number;
}

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
  LEFT = "left",
  RIGHT = "right",
  CENTER = "center",
  JUSTIFY = "justify",
}

export enum DocterTextFormatType {
  BOLD = "bold",
  ITALIC = "italic",
  UNDERLINE = "underline",
  STRIKETHROUGH = "strikethrough",
  HIGHLIGHT = "highlight",
  CODE = "code",
  SUBSCRIPT = "subscript",
  SUPERSCRIPT = "superscript",
  LOWERCASE = "lowercase",
  UPPERCASE = "uppercase",
  CAPITALIZE = "capitalize"
}

export interface DocumentSettings {
  spellcheck: boolean;
  autotab: boolean;
}