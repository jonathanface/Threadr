import { useEffect, useMemo, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
    FORMAT_TEXT_COMMAND,
    FORMAT_ELEMENT_COMMAND,
    $getSelection,
    $isRangeSelection,
    TextFormatType,
    ElementFormatType,
} from "lexical";
import IconButton from '@mui/material/IconButton';
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft';
import FormatAlignCenterIcon from '@mui/icons-material/FormatAlignCenter';
import FormatAlignRightIcon from '@mui/icons-material/FormatAlignRight';
import FormatAlignJustifyIcon from '@mui/icons-material/FormatAlignJustify';
import styles from "./toolbar.module.css";
import { BlockAlignmentType, DocterTextFormatType } from "../../../types/Document";

export const ToolbarDemo = () => {
    const [editor] = useLexicalComposerContext();
    const [isBold, setIsBold] = useState(false);
    const [isItalic, setIsItalic] = useState(false);
    const [isUnderline, setIsUnderline] = useState(false);
    const [isStrikethrough, setIsStrikethrough] = useState(false);
    const [alignment, setAlignment] = useState<string | null>("left");

    const toggleTextFormat = (format: TextFormatType) => {
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
    };

    const applyAlignment = (alignment: ElementFormatType) => {
        editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, alignment);
    };

    const alignmentMap = useMemo<Record<number, ElementFormatType>>(() => ({
        1: BlockAlignmentType.LEFT,
        2: BlockAlignmentType.CENTER,
        3: BlockAlignmentType.RIGHT,
        4: BlockAlignmentType.JUSTIFY,
    }), []);

    useEffect(() => {
        const updateToolbar = () => {
            editor.getEditorState().read(() => {
                const selection = $getSelection();
                if ($isRangeSelection(selection)) {
                    setIsBold(selection.hasFormat(DocterTextFormatType.BOLD));
                    setIsItalic(selection.hasFormat(DocterTextFormatType.ITALIC));
                    setIsUnderline(selection.hasFormat(DocterTextFormatType.UNDERLINE));
                    setIsStrikethrough(selection.hasFormat(DocterTextFormatType.STRIKETHROUGH));
                    const anchorNode = selection.anchor.getNode();
                    const parentNode = anchorNode.getType() === "custom-paragraph" ? anchorNode : anchorNode.getParent();
                    if (parentNode?.getType() === "custom-paragraph") {
                        const format = parentNode.getFormat(); // Use parentNode here
                        const alignmentValue = alignmentMap[format] || BlockAlignmentType.LEFT;
                        setAlignment(alignmentValue);
                    } else {
                        setAlignment(BlockAlignmentType.LEFT);
                    }
                }
            });
        };

        const unsubscribe = editor.registerUpdateListener(() => {
            updateToolbar();
        });

        return () => unsubscribe();
    }, [editor, alignmentMap]);

    return (
        <div className={styles.toolbar}>
            {/* Text formatting buttons */}
            <div className={styles.buttonContainer}>
                <button
                    className={isBold ? styles.active : ""}
                    onClick={() => toggleTextFormat(DocterTextFormatType.BOLD)}
                >
                    <b>B</b>
                </button>
                <button
                    className={isItalic ? styles.active : ""}
                    onClick={() => toggleTextFormat(DocterTextFormatType.ITALIC)}
                >
                    <i>I</i>
                </button>
                <button
                    className={isUnderline ? styles.active : ""}
                    onClick={() => toggleTextFormat(DocterTextFormatType.UNDERLINE)}
                >
                    <u>U</u>
                </button>
                <button
                    className={isStrikethrough ? styles.active : ""}
                    onClick={() => toggleTextFormat(DocterTextFormatType.STRIKETHROUGH)}
                >
                    <s>S</s>
                </button>

                {/* Alignment buttons */}
                <IconButton className={alignment === BlockAlignmentType.LEFT ? styles.active : ""} aria-label={BlockAlignmentType.LEFT} onClick={() => applyAlignment(BlockAlignmentType.LEFT)}>
                    <FormatAlignLeftIcon fontSize="small" />
                </IconButton>
                <IconButton className={alignment === BlockAlignmentType.CENTER ? styles.active : ""} aria-label={BlockAlignmentType.CENTER} onClick={() => applyAlignment(BlockAlignmentType.CENTER)}>
                    <FormatAlignCenterIcon fontSize="small" />
                </IconButton>
                <IconButton className={alignment === BlockAlignmentType.RIGHT ? styles.active : ""} aria-label={BlockAlignmentType.RIGHT} onClick={() => applyAlignment(BlockAlignmentType.RIGHT)}>
                    <FormatAlignRightIcon fontSize="small" />
                </IconButton>
                <IconButton className={alignment === BlockAlignmentType.JUSTIFY ? styles.active : ""} aria-label={BlockAlignmentType.JUSTIFY} onClick={() => applyAlignment(BlockAlignmentType.JUSTIFY)}>
                    <FormatAlignJustifyIcon fontSize="small" />
                </IconButton>
            </div>
        </div>
    );
};
