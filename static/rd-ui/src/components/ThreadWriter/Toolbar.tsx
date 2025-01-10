import { useEffect, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { FORMAT_TEXT_COMMAND, $getSelection, $isRangeSelection, TextFormatType } from "lexical";
import styles from "./toolbar.module.css";

export const Toolbar = () => {
    const [editor] = useLexicalComposerContext();
    const [isBold, setIsBold] = useState(false);
    const [isItalic, setIsItalic] = useState(false);
    const [isUnderline, setIsUnderline] = useState(false);

    const toggleFormat = (format: TextFormatType) => {
        console.log("set to", format)
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
    };

    useEffect(() => {
        const updateToolbar = () => {
            editor.getEditorState().read(() => {
                const selection = $getSelection();
                if ($isRangeSelection(selection)) {
                    console.log("Formats active:", selection.format); // This should include "underline"
                    setIsBold(selection.hasFormat("bold"));
                    setIsItalic(selection.hasFormat("italic"));
                    setIsUnderline(selection.hasFormat("underline"));
                }
            });
        };
        const unsubscribe = editor.registerUpdateListener(() => {
            updateToolbar();
        });

        return () => unsubscribe();
    }, [editor]);

    return (
        <div className={styles.toolbar}>
            <button
                className={isBold ? styles.active : ""}
                onClick={() => toggleFormat("bold")}
            >
                B
            </button>
            <button
                className={isItalic ? styles.active : ""}
                onClick={() => toggleFormat("italic")}
            >
                I
            </button>
            <button
                className={isUnderline ? styles.active : ""}
                onClick={() => toggleFormat("underline")}
            >
                U
            </button>
        </div>
    );
};
