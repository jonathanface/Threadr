import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelectionStyleValueForProperty,
  $patchStyleText,
} from "@lexical/selection";
import {
  FORMAT_TEXT_COMMAND,
  FORMAT_ELEMENT_COMMAND,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  type ElementNode,
  type LexicalNode,
  type RangeSelection,
  type TextFormatType,
  type ElementFormatType,
} from "lexical";
import IconButton from "@mui/material/IconButton";
import { Button, MenuItem, Select, SelectChangeEvent, Tooltip } from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import FormatAlignLeftIcon from "@mui/icons-material/FormatAlignLeft";
import FormatAlignCenterIcon from "@mui/icons-material/FormatAlignCenter";
import FormatAlignRightIcon from "@mui/icons-material/FormatAlignRight";
import FormatAlignJustifyIcon from "@mui/icons-material/FormatAlignJustify";
import styles from "../../ThreadWriter/subcomponents/ThreadWriterToolbar/toolbar.module.css";
import {
  BlockAlignmentType,
  FONT_OPTIONS,
  FONT_SIZE_OPTIONS,
  LINE_SPACING_OPTIONS,
  ThreadrTextFormatType,
} from "../../../types/Document";

interface ToolbarDemoProps {
  chapterName?: string;
  onSaveClick?: () => void;
  onBackClick?: () => void;
  showTypographyControls?: boolean;
}

const INHERIT = "__inherit__";

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

export const ToolbarDemo = ({
  chapterName,
  onSaveClick,
  onBackClick,
  showTypographyControls = true,
}: ToolbarDemoProps) => {
  const [editor] = useLexicalComposerContext();
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [isStrikethrough, setIsStrikethrough] = useState(false);
  const [alignment, setAlignment] = useState<string | null>("left");
  const [selFontFamily, setSelFontFamily] = useState<string>("");
  const [selFontSize, setSelFontSize] = useState<string>("");
  const [selLineHeight, setSelLineHeight] = useState<string>("");

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
    [editor],
  );

  const applyTextStyleToSelection = useCallback(
    (property: string, value: string | null) => {
      withRestoredSelection((selection) => {
        $patchStyleText(selection, { [property]: value });
      });
    },
    [withRestoredSelection],
  );

  const applyParagraphStyleToSelection = useCallback(
    (lineHeightValue: string | null) => {
      withRestoredSelection((selection) => {
        const paragraphs = paragraphsInSelection(selection.getNodes());
        for (const para of paragraphs) {
          const existing = para.getStyle();
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
    [withRestoredSelection],
  );

  const handleSelectionFontChange = (event: SelectChangeEvent<string>) => {
    const value = event.target.value;
    applyTextStyleToSelection("font-family", value === INHERIT ? null : value);
  };
  const handleSelectionSizeChange = (event: SelectChangeEvent<string>) => {
    const value = event.target.value;
    applyTextStyleToSelection(
      "font-size",
      value === INHERIT ? null : `${value}px`,
    );
  };
  const handleSelectionLineSpacingChange = (
    event: SelectChangeEvent<string>,
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
            const format = parentNode.getFormat();
            const alignmentValue =
              alignmentMap[format] || BlockAlignmentType.LEFT;
            setAlignment(alignmentValue);
          } else {
            setAlignment(BlockAlignmentType.LEFT);
          }

          const fontFamily = $getSelectionStyleValueForProperty(
            selection,
            "font-family",
            "",
          );
          const fontSize = $getSelectionStyleValueForProperty(
            selection,
            "font-size",
            "",
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

        {showTypographyControls && (
          <>
            <Tooltip title="Font (selection)" placement="top">
          <Select
            size="small"
            variant="outlined"
            value={
              FONT_OPTIONS.includes(
                selFontFamily as (typeof FONT_OPTIONS)[number],
              )
                ? selFontFamily
                : INHERIT
            }
            onChange={handleSelectionFontChange}
            className={styles.typographySelect}
            renderValue={(v) =>
              v === INHERIT ? "Font: Default" : `Font: ${v as string}`
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
              v === INHERIT ? "Size: Default" : `Size: ${v as string}`
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
                selLineHeight,
              )
                ? selLineHeight
                : INHERIT
            }
            onChange={handleSelectionLineSpacingChange}
            className={styles.typographySelect}
            renderValue={(v) => {
              if (v === INHERIT) return "Spacing: Default";
              const match = LINE_SPACING_OPTIONS.find(
                (o) => String(o.value) === v,
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
          </>
        )}
      </div>
      {chapterName && (
        <div className={styles.chapterTitle} style={{ marginLeft: "auto" }}>{chapterName}</div>
      )}
      {onBackClick && (
        <Button
          variant="outlined"
          color="inherit"
          onClick={onBackClick}
          startIcon={<ArrowBackRoundedIcon />}
          sx={{
            marginLeft: onSaveClick ? "auto" : 0,
            flexShrink: 0,
            px: 2.75,
            py: 1,
            fontFamily: '"Outfit", system-ui, sans-serif',
            fontWeight: 500,
            fontSize: "1rem",
            letterSpacing: "0.04em",
            textTransform: "none",
            borderRadius: "8px",
            whiteSpace: "nowrap",
            color: "#fafaf9",
            backgroundColor: "transparent",
            borderColor: "rgba(255, 255, 255, 0.3)",
            "&:hover": {
              borderColor: "#fafaf9",
              backgroundColor: "rgba(255, 255, 255, 0.08)",
            },
            "& .MuiButton-startIcon": {
              mr: 1,
            },
          }}
        >
          Back
        </Button>
      )}
      {onSaveClick && (
        <Button
          variant="contained"
          color="primary"
          onClick={onSaveClick}
          endIcon={<ArrowForwardRoundedIcon />}
          sx={{
            marginLeft: onBackClick ? 0 : "auto",
            flexShrink: 0,
            px: 2.75,
            py: 1,
            mr: 0.5,
            fontFamily: '"Outfit", system-ui, sans-serif',
            fontWeight: 600,
            fontSize: "1rem",
            letterSpacing: "0.04em",
            textTransform: "none",
            borderRadius: "8px",
            whiteSpace: "nowrap",
            boxShadow:
              "0 1px 0 rgba(255,255,255,0.08) inset, 0 6px 16px -8px color-mix(in srgb, var(--primary) 55%, transparent)",
            transition: "transform 160ms ease, box-shadow 160ms ease",
            "&:hover": {
              transform: "translateY(-1px)",
              boxShadow:
                "0 1px 0 rgba(255,255,255,0.12) inset, 0 10px 22px -8px color-mix(in srgb, var(--primary) 70%, transparent)",
            },
            "& .MuiButton-endIcon": {
              ml: 1,
              transition: "transform 160ms ease",
            },
            "&:hover .MuiButton-endIcon": {
              transform: "translateX(2px)",
            },
          }}
        >
          Save my draft
        </Button>
      )}
    </div>
  );
};
