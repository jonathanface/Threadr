import {
  Card,
  CardHeader,
  CardContent,
  Chip,
  Stack,
  Typography,
  IconButton,
  TextField,
  Tooltip,
  Divider,
  Menu,
  MenuItem,
  Box,
  Collapse,
} from "@mui/material";
import EditNoteIcon from "@mui/icons-material/EditNote";
import AddIcon from "@mui/icons-material/Add";
import RemoveOutlineIcon from "@mui/icons-material/Remove";
import { useEffect, useState } from "react";
import { useSelections } from "../../../../../hooks/useSelections";
import { OutlineSection, StageStatus } from "../../../../../types/Outline";
import { ClickData } from "../../../plugins/DocumentClickPlugin";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { ExpandMoreToggle } from "../../../../ExpandMoreToggle";
import { LightTextEditor } from "../../../../LightTextEditor";
import DOMPurify from "dompurify";

export type StageCardProps = {
  outlineSection: OutlineSection;
  unassigned?: string[];
  onAssociationClick: (data: ClickData) => void;
  onOutlineSectionEdit: (outline: OutlineSection) => void;
};

export const OutlineStageCard = ({
  outlineSection,
  unassigned,
  onOutlineSectionEdit,
}: StageCardProps) => {
  //const wordTotal = chapters.reduce((sum, c) => sum + (c.wordCount ?? 0), 0);
  const [notes, setNotes] = useState(outlineSection.text || "");
  const [editing, setEditing] = useState(false);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [stageStatus, setStageStatus] = useState(outlineSection.status);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(outlineSection.header ?? "");
  const { story } = useSelections();

  useEffect(() => {
    setTitleDraft(outlineSection.header ?? "");
  }, [outlineSection.header]);

  const commitTitle = () => {
    const next = (titleDraft ?? "").trim() || "Untitled stage";
    setEditingTitle(false);
    if (next !== outlineSection.header) {
      onOutlineSectionEdit({ ...outlineSection, header: next });
    }
  };

  const cancelTitle = () => {
    setTitleDraft(outlineSection.header ?? "");
    setEditingTitle(false);
  };

  const sectionChapters =
    story?.chapters.filter((chap) =>
      outlineSection.chapters?.includes(chap.id),
    ) ?? [];

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [openAssigned, setOpenAssigned] = useState(
    sectionChapters.length > 0 || false,
  );
  const [openUnassigned, setOpenUnassigned] = useState(false);

  if (!story) return null;

  const onNotesChange = (notes: string) => {
    const newOutlineSection: OutlineSection = {
      ...outlineSection,
      text: notes,
    };
    onOutlineSectionEdit(newOutlineSection);
  };

  const onStageStatusChange = (newStatus: StageStatus) => {
    setStageStatus(newStatus);
    const newOutlineSection: OutlineSection = {
      ...outlineSection,
      status: newStatus,
    };
    onOutlineSectionEdit(newOutlineSection);
  };

  const onRemoveChapter = (chapterId: string) => {
    const ids = outlineSection.chapters ?? [];
    const idx = ids.indexOf(chapterId);
    if (idx === -1) return;
    const next = [...ids.slice(0, idx), ...ids.slice(idx + 1)];
    onOutlineSectionEdit({ ...outlineSection, chapters: next });
  };

  const onAddChapter = (chapterId: string) => {
    if (outlineSection.chapters?.includes(chapterId)) return;
    const newOutlineSection: OutlineSection = {
      ...outlineSection,
      chapters: outlineSection.chapters
        ? [...outlineSection.chapters, chapterId]
        : [chapterId],
    };
    onOutlineSectionEdit(newOutlineSection);
  };

  return (
    <Card variant="outlined" sx={{ mb: 2, borderRadius: 2 }}>
      <CardHeader
        title={
          <Stack direction="row" alignItems="center" spacing={1}>
            {editingTitle ? (
              <TextField
                autoFocus
                size="small"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitTitle();
                  if (e.key === "Escape") cancelTitle();
                }}
                placeholder="Stage title…"
                sx={{
                  "& .MuiInputBase-input": { fontSize: 18, fontWeight: 600 },
                }}
              />
            ) : (
              <Tooltip title="Double-click to rename">
                <Typography
                  variant="h6"
                  noWrap
                  onDoubleClick={() => setEditingTitle(true)}
                  sx={{ cursor: "text", maxWidth: "40ch" }}
                >
                  {outlineSection.header || "Untitled stage"}
                </Typography>
              </Tooltip>
            )}

            <Chip
              size="small"
              label={stageStatus}
              onClick={(e) => setAnchorEl(e.currentTarget)}
              sx={{ cursor: "pointer" }}
            />

            <Menu
              anchorEl={anchorEl}
              open={!!anchorEl}
              onClose={() => setAnchorEl(null)}
            >
              {["Draft", "Revising", "Done"].map((s) => (
                <MenuItem
                  key={s}
                  onClick={() => {
                    onStageStatusChange(s as StageStatus);
                    setAnchorEl(null);
                  }}
                >
                  {s}
                </MenuItem>
              ))}
            </Menu>
          </Stack>
        }
        subheader={
          <Typography variant="body2" color="text.secondary">
            {outlineSection.chapters?.length || "No"} chapter
            {outlineSection.chapters?.length !== 1 ? "s" : ""}
            {/* •{" "} */}
            {/* {wordTotal.toLocaleString()} words */}
          </Typography>
        }
        action={
          <Tooltip title={editing ? "Finish notes" : "Edit notes"}>
            <IconButton
              onClick={() => {
                if (editing) {
                  onNotesChange(notes);
                }
                setEditing(!editing);
              }}
              aria-label="toggle notes edit"
            >
              <EditNoteIcon />
            </IconButton>
          </Tooltip>
        }
        sx={{ pb: 0.5 }}
      />

      <CardContent sx={{ pt: 1.5, ml: "8px" }}>
        {/* Notes */}
        {editing ? (
          <LightTextEditor text={notes} onChange={(value) => setNotes(value)} />
        ) : (
          <Typography
            sx={{ whiteSpace: "pre-wrap", fontSize: "0.8em", margin: "0.5em" }}
          >
            {!outlineSection.text ? (
              <Typography sx={{ fontSize: "0.8em", m: "0.5em" }}>
                — No notes yet —
              </Typography>
            ) : (
              <Box
                sx={{
                  m: "0.5em",
                  whiteSpace: "normal", // allow wrapping for HTML content
                  "& ul, & ol": { pl: 3, my: 0.5 },
                  "& p": { m: 0, mb: 0.5 }, // tame default margins from pasted content
                }}
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(notes, {
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
                  }),
                }}
              />
            )}
          </Typography>
        )}

        <Divider sx={{ my: 1.5 }} />

        {/* Assigned chapters as chips (ready for DnD later) */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            mb: 0.5,
            userSelect: "none",
          }}
        >
          <Typography variant="overline" color="text.secondary">
            Chapters ({sectionChapters.length})
          </Typography>
          <ExpandMoreToggle
            aria-label="toggle assigned chapters"
            expand={openAssigned}
            onClick={() => setOpenAssigned((v) => !v)}
          >
            <ExpandMoreIcon fontSize="small" />
          </ExpandMoreToggle>
        </Box>
        <Collapse in={openAssigned} timeout="auto" unmountOnExit>
          <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 0.5 }}>
            {sectionChapters.length > 0 ? (
              sectionChapters.map((ch) => (
                <Chip
                  key={ch.id}
                  label={ch.title || "Untitled"}
                  onDelete={() => onRemoveChapter(ch.id)}
                  deleteIcon={
                    <Tooltip title="Click to remove">
                      <RemoveOutlineIcon />
                    </Tooltip>
                  }
                  sx={{ margin: "4px !important" }}
                />
              ))
            ) : (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ ml: 0.5 }}
              >
                No chapters assigned.
              </Typography>
            )}
          </Stack>
        </Collapse>
        {/* Quick add from unassigned list (optional) */}
        {unassigned?.length ? (
          <>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                mt: 1.5,
                mb: 0.5,
                userSelect: "none",
              }}
            >
              <Typography
                variant="overline"
                color="text.secondary"
                sx={{ letterSpacing: 0.6 }}
              >
                Unassigned ({unassigned.length})
              </Typography>
              <ExpandMoreToggle
                aria-label="toggle unassigned chapters"
                expand={openUnassigned}
                onClick={() => setOpenUnassigned((v) => !v)}
              >
                <ExpandMoreIcon fontSize="small" />
              </ExpandMoreToggle>
            </Box>

            <Collapse in={openUnassigned} timeout="auto" unmountOnExit>
              <Stack
                direction="row"
                spacing={1}
                flexWrap="wrap"
                sx={{ mt: 0.5 }}
              >
                {unassigned.map((chapterID: string) => {
                  const chapter = story.chapters.find(
                    (chap) => chap.id === chapterID,
                  );
                  if (!chapter) return null;
                  return (
                    <Chip
                      key={chapterID}
                      variant="outlined"
                      label={chapter.title || "Untitled"}
                      onClick={() => onAddChapter?.(chapterID)}
                      icon={
                        <Tooltip title="Click to add">
                          <AddIcon fontSize="small" />
                        </Tooltip>
                      }
                      sx={{ margin: "4px !important" }}
                    />
                  );
                })}
              </Stack>
            </Collapse>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
};
