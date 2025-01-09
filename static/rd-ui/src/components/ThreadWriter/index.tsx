import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import styles from "./threadwriter.module.css";
import { Toolbar } from "./Toolbar";
import { useLoader } from "../../hooks/useLoader";

const theme = {
  paragraph: styles.myParagraphClass,
  bold: styles.bold,
  italic: styles.italic,
  underline: styles.underline,
};

const initialConfig = {
  namespace: "MyEditor",
  theme,
  onError: (error: Error) => {
    console.error(error);
  },
};

export const ThreadWriter = () => {

  const { setIsLoaderVisible } = useLoader();

  const handleChange = (editorState: any) => {
    editorState.read(() => {
      const json = editorState.toJSON();
      console.log("Editor state:", json);
    });
  };

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

