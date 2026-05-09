import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelectionStyleValueForProperty,
  $patchStyleText,
} from "@lexical/selection";
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
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  type ElementNode,
  type ElementFormatType,
  FORMAT_ELEMENT_COMMAND,
  FORMAT_TEXT_COMMAND,
  type LexicalNode,
  type RangeSelection,
  type TextFormatType,
} from "lexical";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { DocumentExporter } from "./DocumentExporter";
import styles from "./toolbar.module.css";

// Sentinel option value used by the toolbar Selects to mean "remove this
// override and inherit from the document setting". An empty string would
// collide with MUI's "no value" rendering, so we use a distinct token.
const INHERIT = "__inherit__";

// paragraphsInSelection walks a list of nodes touched by the current range
// selection and returns the distinct paragraph nodes containing any of them,
// so selection-level line-spacing applies to every paragraph in the range.
const paragraphsInSelection = (nodes: LexicalNode[]): ElementNode[] => {
  const seen = new Set<string>();
  const result: ElementNode[] = [];
  for (const node of nodes) {
    let para: ElementNode | null = $isTextNode(node)
      ? (node.getParent() as ElementNode | null)
      : (node as ElementNode);
    while (para && !$isParagraphNode(para)) {
      para = para.getParent() as ElementNode | null;
    }
    if (para && !seen.has(para.getKey())) {
      seen.add(para.getKey());
      result.push(para);
    }
  }
  return result;
};

export const Toolbar = () => {
  const [editor] = useLexicalComposerContext();
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [isStrikethrough, setIsStrikethrough] = useState(false);
  const [alignment, setAlignment] = useState<string | null>("left");
  // Selection-level typography (font/size/line-height inferred from the
  // current selection). Empty string = inherit from document settings;
  // "mixed" = the selection spans multiple values.
  const [selFontFamily, setSelFontFamily] = useState<string>("");
  const [selFontSize, setSelFontSize] = useState<string>("");
  const [selLineHeight, setSelLineHeight] = useState<string>("");

  const { story, chapter, setChapter, propagateChapterUpdates } =
    useSelections();
  const { setAlertState } = useToaster();

  // Clicking an MUI Select moves focus out of the editor, which clears the
  // Lexical range selection. We remember the most recent range selection so
  // the toolbar handlers can restore it before applying their changes.
  const lastRangeSelectionRef = useRef<RangeSelection | null>(null);

  const withRestoredSelection = useCallback(
    (run: (selection: RangeSelection) => void) => {
      editor.update(() => {
        let selection = $getSelection();
        if (!$isRangeSelection(selection) && lastRangeSelectionRef.current) {
          $setSelection(lastRangeSelectionRef.current.clone());
          selection = $getSelection();
        }
        if ($isRangeSelection(selection)) {
          run(selection);
        }
      });
    },
    [editor]
  );

  const applyTextStyleToSelection = useCallback(
    (property: string, value: string | null) => {
      withRestoredSelection((selection) => {
        $patchStyleText(selection, { [property]: value });
      });
    },
    [withRestoredSelection]
  );

  const applyParagraphStyleToSelection = useCallback(
    (lineHeightValue: string | null) => {
      withRestoredSelection((selection) => {
        const paragraphs = paragraphsInSelection(selection.getNodes());
        for (const para of paragraphs) {
          const existing = para.getStyle();
          // Strip any prior line-height declaration so we don't pile them up.
          const cleaned = existing
            .split(";")
            .map((d) => d.trim())
            .filter((d) => d && !/^line-height\s*:/i.test(d))
            .join("; ");
          if (lineHeightValue === null || lineHeightValue === "") {
            para.setStyle(cleaned);
          } else {
            const next = cleaned
              ? `${cleaned}; line-height: ${lineHeightValue}`
              : `line-height: ${lineHeightValue}`;
            para.setStyle(next);
          }
        }
      });
    },
    [withRestoredSelection]
  );

  const handleSelectionFontChange = (event: SelectChangeEvent<string>) => {
    const value = event.target.value;
    applyTextStyleToSelection(
      "font-family",
      value === INHERIT ? null : value
    );
  };

  const handleSelectionSizeChange = (event: SelectChangeEvent<string>) => {
    const value = event.target.value;
    applyTextStyleToSelection(
      "font-size",
      value === INHERIT ? null : `${value}px`
    );
  };

  const handleSelectionLineSpacingChange = (
    event: SelectChangeEvent<string>
  ) => {
    const value = event.target.value;
    applyParagraphStyleToSelection(value === INHERIT ? null : value);
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
          // Stash a clone so the typography Selects (which steal focus from
          // the editor on click) can restore the user's range when applying.
          lastRangeSelectionRef.current = selection.clone();
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

          // Read selection-level typography. Returns "" if no override is set
          // on the selection, the value if uniform, and "" again if mixed.
          const fontFamily = $getSelectionStyleValueForProperty(
            selection,
            "font-family",
            ""
          );
          const fontSize = $getSelectionStyleValueForProperty(
            selection,
            "font-size",
            ""
          );
          setSelFontFamily(fontFamily);
          setSelFontSize(fontSize.replace(/px$/, ""));

          const paragraphs = paragraphsInSelection(selection.getNodes());
          const heights = new Set<string>();
          const lineHeightRe = /line-height\s*:\s*([\d.]+)/;
          for (const para of paragraphs) {
            const matched = lineHeightRe.test(para.getStyle())
              ? para.getStyle().match(lineHeightRe)
              : null;
            heights.add(matched ? matched[1] : "");
          }
          setSelLineHeight(heights.size === 1 ? [...heights][0] : "");
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
        <Tooltip title="Font (selection)" placement="top">
          <Select
            size="small"
            variant="outlined"
            value={
              FONT_OPTIONS.includes(
                selFontFamily as (typeof FONT_OPTIONS)[number]
              )
                ? selFontFamily
                : INHERIT
            }
            onChange={handleSelectionFontChange}
            className={styles.typographySelect}
            renderValue={(v) =>
              v === INHERIT ? "Font: —" : `Font: ${v as string}`
            }
            MenuProps={{ disablePortal: false }}
            sx={{
              minWidth: { xs: 120, sm: 160 },
              fontFamily: selFontFamily || undefined,
              color: "var(--text-primary)",
              ".MuiOutlinedInput-notchedOutline": {
                borderColor: "var(--border-medium)",
              },
              ".MuiSvgIcon-root": { color: "var(--text-primary)" },
            }}
          >
            <MenuItem value={INHERIT}>
              <em>Default</em>
            </MenuItem>
            {FONT_OPTIONS.map((font) => (
              <MenuItem key={font} value={font} sx={{ fontFamily: font }}>
                {font}
              </MenuItem>
            ))}
          </Select>
        </Tooltip>
        <Tooltip title="Font size (selection)" placement="top">
          <Select
            size="small"
            variant="outlined"
            value={
              FONT_SIZE_OPTIONS.map(String).includes(selFontSize)
                ? selFontSize
                : INHERIT
            }
            onChange={handleSelectionSizeChange}
            className={styles.typographySelect}
            renderValue={(v) =>
              v === INHERIT ? "Size: —" : `Size: ${v as string}`
            }
            sx={{
              minWidth: { xs: 80, sm: 100 },
              color: "var(--text-primary)",
              ".MuiOutlinedInput-notchedOutline": {
                borderColor: "var(--border-medium)",
              },
              ".MuiSvgIcon-root": { color: "var(--text-primary)" },
            }}
          >
            <MenuItem value={INHERIT}>
              <em>Default</em>
            </MenuItem>
            {FONT_SIZE_OPTIONS.map((size) => (
              <MenuItem key={size} value={String(size)}>
                {size}
              </MenuItem>
            ))}
          </Select>
        </Tooltip>
        <Tooltip title="Line spacing (selection)" placement="top">
          <Select
            size="small"
            variant="outlined"
            value={
              LINE_SPACING_OPTIONS.map((o) => String(o.value)).includes(
                selLineHeight
              )
                ? selLineHeight
                : INHERIT
            }
            onChange={handleSelectionLineSpacingChange}
            className={styles.typographySelect}
            renderValue={(v) => {
              if (v === INHERIT) return "Spacing: —";
              const match = LINE_SPACING_OPTIONS.find(
                (o) => String(o.value) === v
              );
              return `Spacing: ${match ? match.label : (v as string)}`;
            }}
            sx={{
              minWidth: { xs: 110, sm: 140 },
              color: "var(--text-primary)",
              ".MuiOutlinedInput-notchedOutline": {
                borderColor: "var(--border-medium)",
              },
              ".MuiSvgIcon-root": { color: "var(--text-primary)" },
            }}
          >
            <MenuItem value={INHERIT}>
              <em>Default</em>
            </MenuItem>
            {LINE_SPACING_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={String(opt.value)}>
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
