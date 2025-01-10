import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import styles from "./threadwriter.module.css";
import { Toolbar } from "./Toolbar";
import { Chapter } from "../../types/Chapter";
import { $getNodeByKey, $getSelection, $isRangeSelection, ElementNode, LexicalNode } from "lexical";
import { useEffect, useState } from "react";

const theme = {
  paragraph: styles.paragraph,
  text: {
    bold: styles.bold,
    italic: styles.italic,
    underline: styles.underline,
    strikethrough: styles.strikethrough
  }
};

const initialConfig = {
  namespace: "ThreadWriter",
  theme,
  onError: (error: Error) => {
    console.error(error);
  },
};

interface ThreadWriterProps {
  chapter?: Chapter;
}
interface LexicalHTMLElement extends HTMLElement {
  __lexicalEditor?: any;
}

export const ThreadWriter = (props: ThreadWriterProps) => {

  const [activeParagraphKey, setActiveParagraphKey] = useState<string | null>(
    null
  );

  const saveParagraph = (key: string, content: any) => {
    console.log("Saved paragraph as HTML:", key, content);
  };

  const exportWithChildren = (node: ElementNode) => {
    const json = node.exportJSON();
    const children = node.getChildren();
    json.children = children.map((child: LexicalNode) => child.exportJSON());
    return json;
  };

  const handleChange = (editorState: any) => {
    editorState.read(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        const anchorNode = selection.anchor.getNode();
        const parentNode = anchorNode.getParent();

        if (parentNode && parentNode.getType() === "paragraph") {
          const paragraphKey = parentNode.getKey();
          const paragraphContent = parentNode.getTextContent();
          saveParagraph(paragraphKey, {
            key: paragraphKey,
            content: paragraphContent,
            json: exportWithChildren(parentNode)
          });

          // Update the active paragraph key if it has changed
          if (paragraphKey !== activeParagraphKey) {
            setActiveParagraphKey(paragraphKey);
          }
        }
      }
    });
  };

  useEffect(() => {
    return () => {
      // On unmount, save the currently active paragraph
      if (activeParagraphKey) {
        const root = document.querySelector(
          "[data-lexical-composer]"
        ) as LexicalHTMLElement;
        if (root && root.__lexicalEditor) {
          const editor = root.__lexicalEditor;
          editor.getEditorState().read(() => {
            const activeNode = $getNodeByKey(activeParagraphKey);
            if (activeNode) {
              saveParagraph(activeParagraphKey, activeNode.exportJSON());
            }
          });
        }
      }
    };
  }, [activeParagraphKey]);

  return (
    <div className={styles.editorContainer}>
      <LexicalComposer initialConfig={initialConfig}>
        <Toolbar />
        <RichTextPlugin
          contentEditable={<ContentEditable className={styles.editorInput} />}
          placeholder={<div className={styles.placeholder}>Enter text...</div>}
          ErrorBoundary={({ children }) => <>{children}</>}
        />
        <HistoryPlugin />
        <OnChangePlugin onChange={handleChange} />
      </LexicalComposer>
    </div>
  );
};

