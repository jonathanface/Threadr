
import { ClickableDecoratorNode } from "../components/ThreadWriter/customNodes/ClickableDecoratorNode";
import { CustomParagraphNode, CustomSerializedParagraphNode } from "../components/ThreadWriter/customNodes/CustomParagraphNode";
import { Story } from "../types/Story";
import { $getRoot, createEditor, SerializedEditorState, SerializedLexicalNode } from "lexical";
import { v4 as uuidv4 } from 'uuid';

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
      nodes: [CustomParagraphNode, ClickableDecoratorNode], // Register custom nodes
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const storyData: any = await this.getFullStory(this.story.story_id);
    const chapters: returnHTML[] = [];

    for (const chapter of storyData.chapters_with_contents) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chapterBlocks = chapter.blocks?.items.map((paragraph: { chunk: any; key_id: any }) => {
        const fixed: CustomSerializedParagraphNode = paragraph.chunk.Value
          ? JSON.parse(paragraph.chunk.Value)
          : this.generateBlankLine(); // Use blank line if missing
        fixed.key_id = paragraph.key_id.Value;

        if (fixed.type !== CustomParagraphNode.getType()) {
          fixed.type = CustomParagraphNode.getType();
        }
        return fixed;
      });

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

        // Update the editor state for this chapter
        editor.update(() => {
          editor.setEditorState(editor.parseEditorState(rootDoc));
        });

        // Generate HTML for this chapter
        const chapterHtml = await editor.read(() => {
          const root = $getRoot();
          return root
            .getChildren()
            .map((node) => {
              const { element } = node.exportDOM(editor);

              if (element instanceof HTMLElement) {
                return element.outerHTML;
              }
              if (element instanceof Text) {
                return element.textContent;
              }
              if (element instanceof DocumentFragment) {
                const tempDiv = document.createElement("div");
                tempDiv.appendChild(element.cloneNode(true));
                return tempDiv.innerHTML;
              }
              return "";
            })
            .join("");
        });

        chapters.push({
          chapter: chapter.chapter.title,
          html: chapterHtml
        });
      }
    }

    return chapters;
  };

  getFullStory = async (storyID: string) => {
    try {
      const response = await fetch("/api/stories/" + storyID + "/full");
      if (!response.ok) {
        throw new Error(`SERVER ERROR FETCHING FULL STORY: ${response.body}`);
      }
      return await response.json();
    } catch (e) {
      console.error(`ERROR FETCHING FULL STORY: ${e}`);
    }
  };
}
