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
} from "@mui/material";
import EditNoteIcon from "@mui/icons-material/EditNote";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { useEffect, useState } from "react";
import { useSelections } from "../../../hooks/useSelections";
import { OutlineSection, StageStatus } from "../../../types/Outline";
import { ClickData } from "../../ThreadWriter/plugins/DocumentClickPlugin";

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
  const [editing, setEditing] = useState(!outlineSection.text);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [stageStatus, setStageStatus] = useState(outlineSection.status);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(outlineSection.header ?? "");
  const { story } = useSelections();

  useEffect(() => {
    setTitleDraft(outlineSection.header ?? "");
  }, [outlineSection.header]);
  if (!story) return null;

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

  const sectionChapters = story.chapters.filter((chap) =>
    outlineSection.chapters?.includes(chap.id),
  );

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
            {outlineSection.chapters?.length} chapter
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
          <TextField
            slotProps={{
              htmlInput: {
                style: { fontSize: "0.8em" },
              },
            }}
            onChange={(e) => setNotes(e.target.value)}
            value={notes}
            placeholder="Write beats, goals, themes for this stage…"
            multiline
            minRows={3}
            fullWidth
          />
        ) : (
          <Typography
            sx={{ whiteSpace: "pre-wrap", fontSize: "0.8em", margin: "0.5em" }}
          >
            {outlineSection.text || "— No notes yet —"}
          </Typography>
        )}

        <Divider sx={{ my: 1.5 }} />

        {/* Assigned chapters as chips (ready for DnD later) */}
        <Typography variant="overline" color="text.secondary">
          Chapters
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 0.5 }}>
          {sectionChapters.map((ch) => (
            <Chip
              key={ch.id}
              label={ch.title || "Untitled"}
              onDelete={() => onRemoveChapter(ch.id)}
              deleteIcon={<DeleteOutlineIcon />}
              sx={{
                mb: 1,
              }}
            />
          ))}
          {sectionChapters.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No chapters assigned.
            </Typography>
          )}
        </Stack>

        {/* Quick add from unassigned list (optional) */}
        {unassigned?.length ? (
          <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1 }}>
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
                  icon={<AddIcon fontSize="small" />}
                  sx={{ mb: 1 }}
                />
              );
            })}
          </Stack>
        ) : null}
      </CardContent>
    </Card>
  );
};
