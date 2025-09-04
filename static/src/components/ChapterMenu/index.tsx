import { SimpleTreeView, TreeItem } from "@mui/x-tree-view";
import { Chapter } from "../../types/Chapter";
import styles from "./flyoutmenuitems.module.css";
import { useSelections } from "../../hooks/useSelections";
import PostAddIcon from "@mui/icons-material/PostAdd";
import { Button, Typography } from "@mui/material";
import { useLoader } from "../../hooks/useLoader";
import { AlertToastType } from "../../types/AlertToasts";
import { useToaster } from "../../hooks/useToaster";
import { DragDropContext, Droppable, DropResult } from "@hello-pangea/dnd";
import { ChapterTreeItem } from "./ChapterTreeItem";
import { UpdateChapterQueryStringParameter } from "../ThreadWriter/utilities";
import { useState } from "react";
import axios from "axios";
import { api } from "../../api";

interface SettingsMenuProps {
  chapters: Chapter[];
}

export const ChapterMenu = ({ chapters }: SettingsMenuProps) => {
  const { story, chapter, setChapter, setStory, series, setSeries } =
    useSelections();
  const { showLoader, hideLoader } = useLoader();
  const { setAlertState } = useToaster();
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  if (!chapter || !story) return;

  const checkCurrentChapterTableStatus = async (chapterID: string) => {
    try {
      await api.get(
        `/api/stories/${story.story_id}/chapters/${chapterID}/status`,
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.log("resp", error.response?.status);
        if (error.response?.status === 501) {
          return false;
        }
      } else {
        console.error("unexpected error", error);
      }
    }

    return true;
  };

  const showTableWarning = () => {
    setAlertState({
      title: "Warning",
      message:
        "Your chapter is still being created and your changes will be lost if you change chapters now. Please wait a few seconds and try again.",
      severity: AlertToastType.warning,
      open: true,
      timeout: 30000,
    });
  };

  const handleNodeSelect = async (
    _event: React.MouseEvent,
    selectedItemId: string,
  ) => {
    if (selectedItemId === "chapters_add") {
      const isTableReady = await checkCurrentChapterTableStatus(chapter.id);
      if (!isTableReady) {
        showTableWarning();
        return;
      }
      onNewChapterClick();
      return;
    }
    if (selectedItemId !== chapter.id) {
      const isTableReady = await checkCurrentChapterTableStatus(chapter.id);
      if (!isTableReady) {
        showTableWarning();
        return;
      }
      const newChapter = chapters.find(
        (chapter) => chapter.id === selectedItemId,
      );
      if (newChapter) {
        UpdateChapterQueryStringParameter(newChapter.id);
        setChapter(newChapter);
      }
    }
  };

  const onNewChapterClick = async () => {
    const newChapterNum = chapters.length + 1;
    const newChapterTitle = "Chapter " + newChapterNum;
    try {
      showLoader();

      const { data: json } = await api.post<Chapter>(
        `/api/stories/${story.story_id}/chapter`,
        {
          title: newChapterTitle,
          place: newChapterNum,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      json.story_id = story.story_id;

      const newChapters = [...chapters];
      newChapters.push({
        story_id: story.story_id,
        id: json.id,
        title: newChapterTitle,
        place: newChapterNum,
      });

      const updatedSelectedStory = { ...story, chapters: newChapters };

      if (series) {
        const storyIdx = series.stories.findIndex(
          (thisStory) => thisStory.story_id === story.story_id,
        );
        if (storyIdx !== -1) {
          const updatedSeries = { ...series };
          updatedSeries.stories[storyIdx] = updatedSelectedStory;
          setSeries(updatedSeries);
        }
      }

      setStory(updatedSelectedStory);
      setChapter(json);
      UpdateChapterQueryStringParameter(json.id);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(
          `Error creating chapter: ${error.response?.status} ${error.message}`,
        );
      } else {
        console.error("Unexpected error creating chapter", error);
      }
      setAlertState({
        title: "Problem",
        message: "An error occurred creating your chapter.",
        severity: AlertToastType.info,
        open: true,
      });
    } finally {
      hideLoader();
    }
  };

  const reorderChapters = async (results: DropResult) => {
    const { source, destination } = results;

    if (!destination) {
      console.log("Dropped outside a valid drop target");
      return;
    }
    if (!source) {
      console.log("unknown source element");
      return;
    }

    const newChapters = Array.from(story.chapters);
    const [reorderedItem] = newChapters.splice(source.index, 1);
    newChapters.splice(destination.index, 0, reorderedItem);
    const updatedChapters = newChapters.map((vol: Chapter, idx: number) => {
      return { ...vol, place: idx + 1 };
    });
    const newStory = { ...story };
    newStory.chapters = updatedChapters;
    setStory(newStory);
    try {
      showLoader();

      await api.put(
        `/api/stories/${story.story_id}/chapters`,
        updatedChapters,
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    } catch (error) {
      let message =
        "There was an error updating your chapters. Please report this.";

      if (axios.isAxiosError(error)) {
        console.error(error.response?.data);
        message =
          error.response?.data?.message ||
          `HTTP ${error.response?.status}: ${error.message}`;
      } else {
        console.error(error);
        message = (error as Error).message;
      }

      setAlertState({
        title: "Error",
        message,
        severity: AlertToastType.error,
        open: true,
      });
    } finally {
      hideLoader();
    }
  };

  const handleItemToggle = (
    _event: React.SyntheticEvent,
    newExpanded: string[],
  ) => {
    // Compare old vs. new
    const newlyExpanded = newExpanded.filter(
      (id) => !expandedItems.includes(id),
    );
    const newlyCollapsed = expandedItems.filter(
      (id) => !newExpanded.includes(id),
    );
    if (newlyCollapsed.length === 1) {
      if (newlyCollapsed[0] === "outline") {
        setExpandedItems([]);
        return;
      } else {
        setExpandedItems(["outline"]);
        return;
      }
    }
    if (newlyExpanded.length && newlyExpanded[0] === "chapters") {
      setTimeout(() => {
        const target = document.querySelector(
          `[data-rfd-draggable-id="${chapter.id}"]`,
        );
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 500);
    }
    setTimeout(() => {
      setExpandedItems(["outline", newlyExpanded[0]]);
    }, 50);
  };

  return (
    <SimpleTreeView
      expandedItems={expandedItems}
      onExpandedItemsChange={handleItemToggle}
      className={styles.parentView}
      onItemClick={handleNodeSelect}
    >
      <Typography variant="h5" p={2}>
        Chapters
      </Typography>
      <TreeItem
        key="chapters_add"
        title={"add new chapter"}
        label={
          <Button size="medium" variant="text" startIcon={<PostAddIcon />}>
            <span className={styles.newButtonLabel}>NEW</span>
          </Button>
        }
        itemId="chapters_add"
      />
      <DragDropContext onDragEnd={reorderChapters}>
        <Droppable droppableId="droppable-chapters">
          {(provided) => (
            <div
              {...provided.droppableProps}
              ref={provided.innerRef}
              style={{ paddingLeft: "1rem" }} // Indent draggable items
            >
              {chapters
                .sort((a, b) => a.place - b.place)
                .map((chap, idx) => {
                  const assignedSection = story.outline?.sections?.find(
                    (section) => section.chapters?.includes(chap.id),
                  );
                  return (
                    <ChapterTreeItem
                      index={idx}
                      draggableId={chap.id}
                      key={chap.id}
                      itemChapter={chap}
                      assignedSection={assignedSection}
                    />
                  );
                })}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </SimpleTreeView>
  );
};
