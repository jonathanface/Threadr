import { useEffect, useMemo, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  FORMAT_TEXT_COMMAND,
  FORMAT_ELEMENT_COMMAND,
  $getSelection,
  $isRangeSelection,
  type TextFormatType,
  type ElementFormatType,
} from "lexical";
import IconButton from "@mui/material/IconButton";
import { Tooltip } from "@mui/material";
import FormatAlignLeftIcon from "@mui/icons-material/FormatAlignLeft";
import FormatAlignCenterIcon from "@mui/icons-material/FormatAlignCenter";
import FormatAlignRightIcon from "@mui/icons-material/FormatAlignRight";
import FormatAlignJustifyIcon from "@mui/icons-material/FormatAlignJustify";
import styles from "../../ThreadWriter/subcomponents/ThreadWriterToolbar/toolbar.module.css";
import {
  BlockAlignmentType,
  ThreadrTextFormatType,
} from "../../../types/Document";

interface ToolbarDemoProps {
  chapterName?: string;
}

export const ToolbarDemo = ({ chapterName }: ToolbarDemoProps) => {
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

  const alignmentMap = useMemo<Record<number, ElementFormatType>>(
    () => ({
      1: BlockAlignmentType.LEFT,
      2: BlockAlignmentType.CENTER,
      3: BlockAlignmentType.RIGHT,
      4: BlockAlignmentType.JUSTIFY,
    }),
    []
  );

  useEffect(() => {
    const updateToolbar = () => {
      editor.getEditorState().read(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          setIsBold(selection.hasFormat(ThreadrTextFormatType.BOLD));
          setIsItalic(selection.hasFormat(ThreadrTextFormatType.ITALIC));
          setIsUnderline(selection.hasFormat(ThreadrTextFormatType.UNDERLINE));
          setIsStrikethrough(
            selection.hasFormat(ThreadrTextFormatType.STRIKETHROUGH)
          );
          const anchorNode = selection.anchor.getNode();
          const parentNode =
            anchorNode.getType() === "custom-paragraph"
              ? anchorNode
              : anchorNode.getParent();
          if (parentNode?.getType() === "custom-paragraph") {
            const format = parentNode.getFormat();
            const alignmentValue =
              alignmentMap[format] || BlockAlignmentType.LEFT;
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
    <div className={styles.toolbar} style={{ top: 0, zIndex: 10 }}>
      <div className={styles.buttonContainer}>
        <Tooltip title="Bold" placement="top">
          <button
            type="button"
            className={isBold ? styles.active : ""}
            onClick={() => toggleTextFormat(ThreadrTextFormatType.BOLD)}
          >
            <b>B</b>
          </button>
        </Tooltip>
        <Tooltip title="Italic" placement="top">
          <button
            type="button"
            className={isItalic ? styles.active : ""}
            onClick={() => toggleTextFormat(ThreadrTextFormatType.ITALIC)}
          >
            <i>I</i>
          </button>
        </Tooltip>
        <Tooltip title="Underline" placement="top">
          <button
            type="button"
            className={isUnderline ? styles.active : ""}
            onClick={() => toggleTextFormat(ThreadrTextFormatType.UNDERLINE)}
          >
            <u>U</u>
          </button>
        </Tooltip>
        <Tooltip title="Strikethrough" placement="top">
          <button
            type="button"
            className={isStrikethrough ? styles.active : ""}
            onClick={() => toggleTextFormat(ThreadrTextFormatType.STRIKETHROUGH)}
          >
            <s>S</s>
          </button>
        </Tooltip>

        <Tooltip title="Align Left" placement="top">
          <IconButton
            className={alignment === BlockAlignmentType.LEFT ? styles.active : ""}
            aria-label={BlockAlignmentType.LEFT}
            onClick={() => applyAlignment(BlockAlignmentType.LEFT)}
          >
            <FormatAlignLeftIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Align Center" placement="top">
          <IconButton
            className={alignment === BlockAlignmentType.CENTER ? styles.active : ""}
            aria-label={BlockAlignmentType.CENTER}
            onClick={() => applyAlignment(BlockAlignmentType.CENTER)}
          >
            <FormatAlignCenterIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Align Right" placement="top">
          <IconButton
            className={alignment === BlockAlignmentType.RIGHT ? styles.active : ""}
            aria-label={BlockAlignmentType.RIGHT}
            onClick={() => applyAlignment(BlockAlignmentType.RIGHT)}
          >
            <FormatAlignRightIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Justify" placement="top">
          <IconButton
            className={alignment === BlockAlignmentType.JUSTIFY ? styles.active : ""}
            aria-label={BlockAlignmentType.JUSTIFY}
            onClick={() => applyAlignment(BlockAlignmentType.JUSTIFY)}
          >
            <FormatAlignJustifyIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </div>
      {chapterName && (
        <div className={styles.chapterTitle} style={{ marginLeft: "auto" }}>{chapterName}</div>
      )}
    </div>
  );
};
