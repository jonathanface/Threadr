import { useEffect, useRef, useState } from "react";

// If you already sanitize upstream, you can remove DOMPurify.
import DOMPurify from "dompurify";
import { Box, IconButton, Paper, Stack, Tooltip } from "@mui/material";
import FormatBoldIcon from "@mui/icons-material/FormatBold";
import FormatItalicIcon from "@mui/icons-material/FormatItalic";
import FormatUnderlinedIcon from "@mui/icons-material/FormatUnderlined";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import FormatListNumberedIcon from "@mui/icons-material/FormatListNumbered";

type LightTextEditorProps = {
  text?: string; // HTML value
  onChange?: (html: string) => void; // emits sanitized HTML (never the placeholder)
  placeholder?: string; // shown when empty and not focused
};

export function LightTextEditor({
  text = "",
  onChange,
  placeholder = "Write beats, goals, themes for this stage…",
}: LightTextEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [showingPlaceholder, setShowingPlaceholder] = useState(false);

  const exec = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    ref.current?.focus();
  };
  // Helpers
  const isEmptyHtml = (html: string) => {
    const normalized = html
      .replace(/<br\s*\/?>/gi, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/<[^>]+>/g, "")
      .trim();
    return normalized.length === 0;
  };

  const unwrapMuiTypographyP = (root: HTMLDivElement) => {
    const nodes = Array.from(root.childNodes);
    if (nodes.length === 1 && nodes[0].nodeType === Node.ELEMENT_NODE) {
      const el = nodes[0] as HTMLElement;
      if (el.tagName === "P" && /MuiTypography-root/.test(el.className)) {
        return el.innerHTML;
      }
    }
    return nodes
      .map((n) =>
        n.nodeType === Node.ELEMENT_NODE
          ? (n as HTMLElement).outerHTML
          : n.textContent || "",
      )
      .join("");
  };

  const setPlaceholder = () => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = "";
    el.textContent = placeholder;
    el.setAttribute("data-placeholder-active", "true");
    setShowingPlaceholder(true);
  };

  const clearPlaceholder = () => {
    const el = ref.current;
    if (!el) return;
    if (showingPlaceholder) {
      el.innerHTML = "";
      el.removeAttribute("data-placeholder-active");
      setShowingPlaceholder(false);
    }
  };

  // Keep the DOM in sync with external `text`
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // If external value is empty, show placeholder (unless focused)
    if (isEmptyHtml(text)) {
      if (document.activeElement !== el) setPlaceholder();
      return;
    }

    // External value has content: render it and clear placeholder flag
    const sanitized = DOMPurify.sanitize(text, {
      ALLOWED_TAGS: [
        "b",
        "strong",
        "i",
        "em",
        "u",
        "ul",
        "ol",
        "li",
        "br",
        "p",
        "div",
        "span",
      ],
      ALLOWED_ATTR: [],
    });

    if (el.innerHTML !== sanitized) el.innerHTML = sanitized;
    clearPlaceholder();
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Box>
      <Paper
        variant="outlined"
        sx={{ display: "flex", mb: 1, p: 0.5, borderRadius: 1 }}
      >
        <Stack direction="row" spacing={0.5}>
          <Tooltip title="Bold">
            <IconButton size="small" onClick={() => exec("bold")}>
              <FormatBoldIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Italic">
            <IconButton size="small" onClick={() => exec("italic")}>
              <FormatItalicIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Underline">
            <IconButton size="small" onClick={() => exec("underline")}>
              <FormatUnderlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Bulleted List">
            <IconButton
              size="small"
              onClick={() => exec("insertUnorderedList")}
            >
              <FormatListBulletedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Numbered List">
            <IconButton size="small" onClick={() => exec("insertOrderedList")}>
              <FormatListNumberedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Paper>
      <Paper
        variant="outlined"
        sx={{
          minHeight: 120,
          p: 1,
          borderRadius: 1,
          "&:focus-within": { borderColor: "primary.main" },
        }}
      >
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onFocus={() => clearPlaceholder()}
          onBlur={(e) => {
            const html = unwrapMuiTypographyP(
              e.currentTarget as HTMLDivElement,
            );
            if (isEmptyHtml(html)) {
              setPlaceholder();
              // Do NOT emit the placeholder; emit empty string to caller.
              onChange?.("");
            }
          }}
          onInput={(e) => {
            // If we're still showing placeholder, ignore spurious input events.
            if (showingPlaceholder) return;

            const htmlRaw = unwrapMuiTypographyP(
              e.currentTarget as HTMLDivElement,
            );
            const sanitized = DOMPurify.sanitize(htmlRaw, {
              ALLOWED_TAGS: [
                "b",
                "strong",
                "i",
                "em",
                "u",
                "ul",
                "ol",
                "li",
                "br",
                "p",
                "div",
                "span",
              ],
              ALLOWED_ATTR: [],
            });

            // Emit empty string if effectively empty (so parent can treat as no content)
            onChange?.(isEmptyHtml(sanitized) ? "" : sanitized);
          }}
          onPaste={(e) => {
            // Optional: paste as plain text to avoid odd wrappers.
            e.preventDefault();
            const text = e.clipboardData.getData("text/plain");
            document.execCommand("insertText", false, text);
          }}
          style={{
            minHeight: 100,
            outline: "none",
            fontFamily: "Roboto, sans-serif",
            fontSize: "0.8em",
            whiteSpace: "pre-wrap",
          }}
        />
      </Paper>
    </Box>
  );
}
