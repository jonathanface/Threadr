import {
  convertToHTML,
  RawDraftContentBlockWithCustomType,
} from "draft-convert";
import {
  CompositeDecorator,
  ContentBlock,
  EditorState,
  Modifier,
  SelectionState,
  ContentState,
  convertFromRaw,
} from "draft-js";
import { FindTabs, TabSpan } from "./decorators";
import { BlockAlignmentType } from "../../types/Document";

interface StyleRange {
  style: string;
  offset: number;
  length: number;
}

interface ChapterContent {
  chapterTitle: string;
  blocks: ContentBlock[];
}

interface StoryData {
  chapters_with_contents: {
    chapter: { title: string };
    blocks: {
      items: { chunk: { Value: string }; key_id: { Value: string } }[];
    };
  }[];
}

export class Exporter {
  private story: string;
  private editorState: EditorState;

  constructor(story: string) {
    this.editorState = EditorState.createEmpty();
    this.story = story;
  }

  private processDBBlock = (
    contentState: ContentState,
    block: ContentBlock
  ): ContentState => {
    const blockData = block.getData();
    const styles = blockData.get("STYLES") || [];
    styles.forEach(
      (style: { style: string; name?: string; start: number; end: number }) => {
        try {
          const name = style.style || style.name!;
          const styleSelection = new SelectionState({
            focusKey: block.getKey(),
            anchorKey: block.getKey(),
            focusOffset: style.end,
            anchorOffset: style.start,
          });
          contentState = Modifier.applyInlineStyle(
            contentState,
            styleSelection,
            name
          );
        } catch (error) {
          console.error("ERROR parsing block!", block.getKey());
        }
      }
    );
    return contentState;
  };

  private applyStyles = (text: string, styles: StyleRange[]): string => {
    let modifier = 0;
    styles.forEach((style) => {
      const tagMap: { [key: string]: string } = {
        bold: "b",
        italic: "i",
        underscore: "u",
        strikethrough: "s",
      };
      const tag = tagMap[style.style.toLowerCase()] || "";
      if (tag) {
        text =
          text.slice(0, style.offset + modifier) +
          `<${tag}>` +
          text.slice(style.offset + modifier, text.length + modifier);
        text =
          text.slice(0, style.offset + style.length + 3 + modifier) +
          `</${tag}>` +
          text.slice(
            style.offset + style.length + 3 + modifier,
            text.length + modifier
          );
        modifier += tag.length * 2 + 5;
      }
    });
    return text;
  };

  public DocToHTML = async (): Promise<
    { chapter: string; html: string }[] | undefined
  > => {
    try {
      const data: StoryData = await this.getFullStory(this.story);
      const contentByChapter: ChapterContent[] = [];

      data.chapters_with_contents.forEach((chapter) => {
        const paragraphs: ChapterContent = {
          chapterTitle: chapter.chapter.title,
          blocks: [],
        };
        chapter.blocks.items.forEach((piece) => {
          if (piece.chunk) {
            const jsonBlock = JSON.parse(piece.chunk.Value);
            const block = new ContentBlock({
              characterList: jsonBlock.characterList,
              depth: jsonBlock.depth,
              key: piece.key_id.Value,
              text: jsonBlock.text,
              type: jsonBlock.type,
              data: jsonBlock.data,
            });
            paragraphs.blocks.push(block);
          }
        });
        contentByChapter.push(paragraphs);
      });

      const htmlizedContent: { chapter: string; html: string }[] = [];
      contentByChapter.forEach((chapterContents) => {
        const contentState: ContentState = convertFromRaw({
          entityMap: {},
          blocks: chapterContents.blocks.map((block) => block.toJS()),
        });

        let newContentState = contentState;
        chapterContents.blocks.forEach((block) => {
          if (block.getText().length) {
            newContentState = this.processDBBlock(newContentState, block);
          }
        });

        this.editorState = EditorState.createWithContent(
          newContentState,
          this.createDecorators()
        );

        htmlizedContent.push({
          chapter: chapterContents.chapterTitle,
          html: convertToHTML({
            blockToHTML: (block) => {
              const alignment = block.data
                ? block.data.ALIGNMENT
                : BlockAlignmentType.left;
              let text = block.text;
              const styles = block.inlineStyleRanges as StyleRange[];
              if (styles.length) {
                text = this.applyStyles(text, styles);
              }
              if (alignment) {
                return `<div custom-style="${alignment}">${text}</div>`;
              }
              return `<div>${text}</div>`;
            },
          })(this.editorState.getCurrentContent()),
        });
      });

      return htmlizedContent;
    } catch (err) {
      console.error(err);
    }
  };

  private createDecorators = (): CompositeDecorator => {
    const decorators = [
      {
        strategy: FindTabs,
        component: TabSpan,
      },
    ];
    return new CompositeDecorator(decorators);
  };

  private getFullStory = (story: string): Promise<StoryData> => {
    return new Promise<StoryData>(async (resolve, reject) => {
      try {
        const response = await fetch(`/api/stories/${story}/full`);
        if (!response.ok) {
          reject(`SERVER ERROR FETCHING FULL STORY: ${response.statusText}`);
        }
        resolve(await response.json());
      } catch (e) {
        console.error("Error fetching full story: ", e);
        reject(e);
      }
    });
  };
}
