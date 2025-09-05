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

const getStringColor = (header: string): string => {
  // Sum all character codes
  let sum = 0;
  for (let i = 0; i < header.length; i++) {
    sum += header.charCodeAt(i);
  }

  // Define an array of colors to pick from
  const colorPalette = [
    "#f9d3d3", // red
    "#f0f8ff", // blue
    "#f0fff4", // green
    "#fdf0ff", // pink
    "#fffbf0", // yellow
    "#ffcdb9", // orange
    "#f2f0ff ", // lavender
    "#f0fffa", // mint
    "#fff4f0", // peach
    "#f5f0ff", // periwinkle
    "#fff0f9", // rose
    "#f7fff0", // lime
    "#FCE7E7",
    "#FAF3E7",
    "#F8FAE7",
    "#E7FAF3",
    "#E7F9FA",
    "#E7ECFA",
    "#E9E7FA",
    "#F9E7FA",
    "#FAE7F2",
    "#FAE7E7",
    "#FAE7E2",
    "#FAEEE7",
    "#FAF0E7",
    "#FAF5E7",
    "#E7FAEE",
    "#E7FAE2",
    "#E7F6FA",
    "#E7FAFE",
    "#EFE7FA",
    "#FCE7FA",
    "#FAE7F6",
    "#FAE7FD",
    "#FAE7EB",
    "#E7FAEB",
    "#E7F8FA",
    "#FAEBE7",
    "#FCE7EC",
    "#FCE7E3",
    "#FCEBE7",
    "#FCEFF7",
    "#FEFAE7",
    "#E7FEFA",
    "#FAE7FE",
    "#FDE7FA",
    "#FDE7F8",
    "#FAE7E8",
    "#FAE7EE",
    "#FAE7F9",
  ];
  // Pick a color based on sum
  return colorPalette[sum % colorPalette.length];
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
                  {assignedSection && (
                    <Chip
                      label={assignedSection.header}
                      size="small"
                      sx={{
                        backgroundColor: getStringColor(assignedSection.header),
                      }}
                      className={styles.outlineLabel}
                    />
                  )}
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
