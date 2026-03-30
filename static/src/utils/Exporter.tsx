import axios from "axios";
import { api } from "../api";
import { AssociationInlineNode } from "../components/ThreadWriter/customNodes/AssociationInlineNode";
import {
  CustomParagraphNode,
  CustomSerializedParagraphNode,
} from "../components/ThreadWriter/customNodes/CustomParagraphNode";
import { Story } from "../types/Story";
import {
  createEditor,
  SerializedEditorState,
  SerializedLexicalNode,
} from "lexical";
import { $generateHtmlFromNodes } from "@lexical/html";
import { v4 as uuidv4 } from "uuid";

interface returnHTML {
  chapter: string;
  html: string;
}

export default class Exporter {
  private story;

  constructor(story: Story) {
    this.story = story;
  }

  generateBlankLine = (): CustomSerializedParagraphNode => ({
    children: [],
    direction: "ltr",
    format: "",
    indent: 0,
    textFormat: 0,
    textStyle: "",
    type: CustomParagraphNode.getType(),
    version: 1,
    key_id: uuidv4(),
  });

  lexicalToHtml = async (): Promise<returnHTML[]> => {
    const editor = createEditor({
      namespace: "ExportEditor",
      nodes: [CustomParagraphNode, AssociationInlineNode],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const storyData: any = await this.getFullStory(this.story.story_id);
    const chapters: returnHTML[] = [];

    for (const chapter of storyData.chapters_with_contents) {
       
      const chapterBlocks = chapter.blocks?.items?.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (paragraph: { chunk: any; key_id: any }) => {
          const fixed: CustomSerializedParagraphNode = paragraph.chunk?.Value
            ? JSON.parse(paragraph.chunk.Value)
            : this.generateBlankLine();
          fixed.key_id = paragraph.key_id?.Value || uuidv4();

          if (fixed.type !== CustomParagraphNode.getType()) {
            fixed.type = CustomParagraphNode.getType();
          }
          return fixed;
        },
      );

      if (chapterBlocks) {
        const rootDoc: SerializedEditorState<SerializedLexicalNode> = {
          root: {
            children: chapterBlocks,
            type: "root",
            version: 1,
            direction: "ltr",
            format: "",
            indent: 0,
          },
        };

        // Set the editor state for this chapter
        const editorState = editor.parseEditorState(rootDoc);
        editor.setEditorState(editorState);

        // Generate HTML using Lexical's official HTML generator
        const chapterHtml = editor.read(() => {
          return $generateHtmlFromNodes(editor);
        });

        chapters.push({
          chapter: chapter.chapter.title,
          html: chapterHtml,
        });
      }
    }

    return chapters;
  };

  getFullStory = async (storyID: string) => {
    try {
      const { data } = await api.get<Story>(`/stories/${storyID}/full`);
      return data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `SERVER ERROR FETCHING FULL STORY: ${
            error.response?.data || error.message
          }`,
        );
      }
      throw error;
    }
  };
}
