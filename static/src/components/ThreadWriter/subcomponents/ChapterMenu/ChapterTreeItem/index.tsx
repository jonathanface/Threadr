import { TreeItem } from "@mui/x-tree-view";
import { Tooltip, Chip, Typography, IconButton, Box } from "@mui/material";
import { Chapter } from "../../../../../types/Chapter";
import { OutlineSection } from "../../../../../types/Outline";
import { Draggable, DraggableProvided } from "@hello-pangea/dnd";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { UpdateChapterQueryStringParameter } from "../../../utilities";
import { AlertToastType } from "../../../../../types/AlertToasts";
import { useSelections } from "../../../../../hooks/useSelections";
import { useToaster } from "../../../../../hooks/useToaster";
import { useLoader } from "../../../../../hooks/useLoader";
import styles from "./chaptertreeitem.module.css";
import { api } from "../../../../../api";

interface ChapterTreeItemProps {
  itemChapter: Chapter;
  assignedSection?: OutlineSection;
  draggableId: string;
  index: number;
  disable: boolean;
}

const hash32 = (str: string) => {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

// Quantize hue into N distant buckets (e.g., 12 => 30° steps)
const quantizedHue = (key: string, buckets = 12) =>
  Math.round((hash32(key) % buckets) * (360 / buckets));

// Prefer OKLCH for clearer separation; fall back to HSL
const makeColors = (key: string) => {
  const h = quantizedHue(key, 12);
  const supportsOKLCH = CSS.supports?.("color", "oklch(0.8 0.12 0)");
  if (supportsOKLCH) {
    const base = `oklch(0.62 0.11 ${h})`; // saturated for text/border
    const bg = `oklch(0.90 0.06 ${h})`; // softer fill (but not washed out)
    return { bg, fg: base, border: base };
  } else {
    const base = `hsl(${h} 85% 35%)`;
    const bg = `hsl(${h} 80% 88%)`; // darker than 92% so it pops
    return { bg, fg: base, border: base };
  }
};

// Use header + place/id so "Act One"/"Act Two" are distinct
const colorForSection = (section: OutlineSection, storyId?: string) => {
  const header = (section.header || "untitled").toLowerCase().trim();
  const place = section.place ?? 0;
  const key = `${storyId ?? ""}|${header}|${place}`;
  return makeColors(key);
};

export const ChapterTreeItem = ({
  itemChapter,
  assignedSection,
  draggableId,
  index,
  disable,
}: ChapterTreeItemProps) => {
  const { story, setStory, chapter, setChapter } = useSelections();
  const { setAlertState } = useToaster();
  const { showLoader, hideLoader } = useLoader();

  const onDeleteChapterClick = async (
    event: React.MouseEvent,
    chapterIDToDelete: string,
    chapterTitle: string,
    isCurrentlySelected: boolean,
  ) => {
    if (!story) return;
    event.stopPropagation();

    if (story.chapters.length === 1) {
      setAlertState({
        title: "Nope",
        message: "You cannot delete a story's only chapter.",
        severity: AlertToastType.info,
        open: true,
      });
      return;
    }

    const confirm = window.confirm(
      `Delete ${chapterTitle} from ${story.title}?`,
    );
    if (!confirm) return;

    try {
      showLoader();

      const response = await api.delete(
        `/stories/${story.story_id}/chapter/${chapterIDToDelete}`,
      );

      if (response.status !== 200 && response.status !== 501) {
        throw new Error(response.statusText || "Unexpected error");
      }

      const chapterIndex = story.chapters.findIndex(
        (c: { id: string }) => c.id === chapterIDToDelete,
      );

      if (chapterIndex !== -1) {
        const newChapters = [...story.chapters];
        newChapters.splice(chapterIndex, 1);

        const newSelectedStory = { ...story, chapters: newChapters };
        setStory(newSelectedStory);

        if (isCurrentlySelected) {
          const prevChapter = newChapters[chapterIndex - 1] || newChapters[0];
          if (prevChapter) {
            setChapter(prevChapter);
            UpdateChapterQueryStringParameter(prevChapter.id);
          }
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      hideLoader();
    }
  };

  return (
    <Draggable isDragDisabled={disable} draggableId={draggableId} index={index}>
      {(provided: DraggableProvided) => (
        <TreeItem
          itemId={itemChapter.id}
          disabled={disable}
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={chapter?.id === itemChapter.id ? styles.activeChapter : ""}
          label={
            <Tooltip
              title={
                assignedSection ? `Assigned to: ${assignedSection.header}` : ""
              }
              arrow
            >
              <Box className={styles.chapterMenuItem}>
                {/* Left side: Chapter Title + Chip */}
                <Box className={styles.leftItems}>
                  <Typography variant="body2">{itemChapter.title}</Typography>
                  {assignedSection &&
                    (() => {
                      const { bg, fg, border } = colorForSection(
                        assignedSection,
                        story?.story_id,
                      );
                      return (
                        <Chip
                          label={assignedSection.header || "Untitled"}
                          size="small"
                          variant="outlined"
                          sx={{
                            bgcolor: bg,
                            color: fg,
                            borderColor: border,
                            fontWeight: 600,
                          }}
                        />
                      );
                    })()}
                </Box>

                {/* ✅ Right-aligned Delete Button */}
                <IconButton
                  title="Delete Chapter"
                  aria-label="delete"
                  size="small"
                  disabled={disable}
                  onClick={(event) =>
                    onDeleteChapterClick(
                      event,
                      itemChapter.id,
                      itemChapter.title,
                      chapter?.id === itemChapter.id,
                    )
                  }
                  sx={{ marginLeft: "auto" }} // ✅ Ensures it stays on the right
                >
                  <DeleteOutlineIcon />
                </IconButton>
              </Box>
            </Tooltip>
          }
        />
      )}
    </Draggable>
  );
};
