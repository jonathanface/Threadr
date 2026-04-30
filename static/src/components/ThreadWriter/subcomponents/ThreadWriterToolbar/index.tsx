import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import FormatAlignCenterIcon from "@mui/icons-material/FormatAlignCenter";
import FormatAlignJustifyIcon from "@mui/icons-material/FormatAlignJustify";
import FormatAlignLeftIcon from "@mui/icons-material/FormatAlignLeft";
import FormatAlignRightIcon from "@mui/icons-material/FormatAlignRight";
import {
  MenuItem,
  Select,
  SelectChangeEvent,
  Tooltip,
  useMediaQuery,
} from "@mui/material";
import IconButton from "@mui/material/IconButton";
import axios from "axios";
import {
  $getSelection,
  $isRangeSelection,
  type ElementFormatType,
  FORMAT_ELEMENT_COMMAND,
  FORMAT_TEXT_COMMAND,
  type TextFormatType,
} from "lexical";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../../../api";
import { useSelections } from "../../../../hooks/useSelections";
import { useToaster } from "../../../../hooks/useToaster";
import { AlertToastType } from "../../../../types/AlertToasts";
import {
  BlockAlignmentType,
  FONT_OPTIONS,
  FONT_SIZE_OPTIONS,
  LINE_SPACING_OPTIONS,
  ThreadrTextFormatType,
} from "../../../../types/Document";
import { EditableText } from "../../../EditableText";
import { useDocumentSettings } from "../../hooks/useDocumentSettings";
import { DocumentExporter } from "./DocumentExporter";
import styles from "./toolbar.module.css";

export const Toolbar = () => {
  const [editor] = useLexicalComposerContext();
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [isStrikethrough, setIsStrikethrough] = useState(false);
  const [alignment, setAlignment] = useState<string | null>("left");

  const { story, chapter, setChapter, propagateChapterUpdates } =
    useSelections();
  const { setAlertState } = useToaster();
  const { documentSettings, saveDocumentSettings } = useDocumentSettings();

  const handleFontFamilyChange = (event: SelectChangeEvent<string>) => {
    if (documentSettings) {
      saveDocumentSettings({
        ...documentSettings,
        font_family: event.target.value,
      });
    }
  };

  const handleFontSizeChange = (event: SelectChangeEvent<number>) => {
    if (documentSettings) {
      saveDocumentSettings({
        ...documentSettings,
        font_size: Number(event.target.value),
      });
    }
  };

  const handleLineSpacingChange = (event: SelectChangeEvent<number>) => {
    if (documentSettings) {
      saveDocumentSettings({
        ...documentSettings,
        line_spacing: Number(event.target.value),
      });
    }
  };

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
            const format = parentNode.getFormat(); // Use parentNode here
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

  const onChapterTitleEdit = async (event: React.SyntheticEvent) => {
    if (story && chapter) {
      const target = event.target as HTMLInputElement;
      if (target.value !== chapter.title && target.value.trim() !== "") {
        const updatedChapter = { ...chapter };
        updatedChapter.title = target.value;
        try {
          await api.put(
            `/stories/${story.story_id}/chapters/${chapter.id}`,
            updatedChapter,
            {
              headers: { "Content-Type": "application/json" },
            }
          );

          setChapter(updatedChapter);
          propagateChapterUpdates(updatedChapter);
        } catch (error) {
          const message = axios.isAxiosError(error)
            ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (error.response?.data as any)?.message ||
              `HTTP ${error.response?.status}: ${error.message}`
            : (error as Error).message;

          setAlertState({
            title: "Error",
            message,
            severity: AlertToastType.error,
            open: true,
          });
        }
      }
    }
  };

  const isMobile = useMediaQuery("(max-width: 600px)");
  const direction = isMobile
    ? BlockAlignmentType.LEFT
    : BlockAlignmentType.RIGHT;

  return (
    <div className={styles.toolbar}>
      {/* Text formatting buttons */}
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

        {/* Alignment buttons */}
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
            className={
              alignment === BlockAlignmentType.CENTER ? styles.active : ""
            }
            aria-label={BlockAlignmentType.CENTER}
            onClick={() => applyAlignment(BlockAlignmentType.CENTER)}
          >
            <FormatAlignCenterIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Align Right" placement="top">
          <IconButton
            className={
              alignment === BlockAlignmentType.RIGHT ? styles.active : ""
            }
            aria-label={BlockAlignmentType.RIGHT}
            onClick={() => applyAlignment(BlockAlignmentType.RIGHT)}
          >
            <FormatAlignRightIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Justify" placement="top">
          <IconButton
            className={
              alignment === BlockAlignmentType.JUSTIFY ? styles.active : ""
            }
            aria-label={BlockAlignmentType.JUSTIFY}
            onClick={() => applyAlignment(BlockAlignmentType.JUSTIFY)}
          >
            <FormatAlignJustifyIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Font" placement="top">
          <Select
            size="small"
            variant="outlined"
            value={documentSettings?.font_family ?? "Arial"}
            onChange={handleFontFamilyChange}
            className={styles.typographySelect}
            renderValue={(v) => `Font: ${v}`}
            MenuProps={{ disablePortal: false }}
            sx={{
              minWidth: { xs: 130, sm: 180 },
              fontFamily: documentSettings?.font_family ?? "Arial",
              color: "var(--text-primary)",
              ".MuiOutlinedInput-notchedOutline": {
                borderColor: "rgba(255,255,255,0.3)",
              },
              ".MuiSvgIcon-root": { color: "var(--text-primary)" },
            }}
          >
            {FONT_OPTIONS.map((font) => (
              <MenuItem key={font} value={font} sx={{ fontFamily: font }}>
                {font}
              </MenuItem>
            ))}
          </Select>
        </Tooltip>
        <Tooltip title="Font size" placement="top">
          <Select
            size="small"
            variant="outlined"
            value={documentSettings?.font_size ?? 16}
            onChange={handleFontSizeChange}
            className={styles.typographySelect}
            renderValue={(v) => `Size: ${v}`}
            sx={{
              minWidth: { xs: 80, sm: 100 },
              color: "var(--text-primary)",
              ".MuiOutlinedInput-notchedOutline": {
                borderColor: "rgba(255,255,255,0.3)",
              },
              ".MuiSvgIcon-root": { color: "var(--text-primary)" },
            }}
          >
            {FONT_SIZE_OPTIONS.map((size) => (
              <MenuItem key={size} value={size}>
                {size}
              </MenuItem>
            ))}
          </Select>
        </Tooltip>
        <Tooltip title="Line spacing" placement="top">
          <Select
            size="small"
            variant="outlined"
            value={documentSettings?.line_spacing ?? 2.0}
            onChange={handleLineSpacingChange}
            className={styles.typographySelect}
            renderValue={(v) => {
              const match = LINE_SPACING_OPTIONS.find((o) => o.value === v);
              return `Spacing: ${match ? match.label : v}`;
            }}
            sx={{
              minWidth: { xs: 110, sm: 140 },
              color: "var(--text-primary)",
              ".MuiOutlinedInput-notchedOutline": {
                borderColor: "rgba(255,255,255,0.3)",
              },
              ".MuiSvgIcon-root": { color: "var(--text-primary)" },
            }}
          >
            {LINE_SPACING_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </Select>
        </Tooltip>
      </div>
      <div className={styles.extraButtons}>
        <span className={styles.chapterTitle}>
          <EditableText
            textValue={chapter?.title ? chapter.title : ""}
            onTextChange={onChapterTitleEdit}
            inputTextAlign={direction}
          />
        </span>
        <DocumentExporter />
      </div>
    </div>
  );
};
