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
import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { api } from "../../api";

export const ChapterMenu = () => {
  const { story, chapter, setChapter, setStory, series, setSeries } =
    useSelections();
  const { showLoader, hideLoader } = useLoader();
  const { setAlertState } = useToaster();
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const pollersRef = useRef<Record<string, number>>({});

  useEffect(() => {
    return () => {
      // cleanup on unmount
      Object.values(pollersRef.current).forEach((id) => clearTimeout(id));
    };
  }, []);
  if (!story) return null;

  const checkCurrentChapterTableStatus = async (chapterID: string) => {
    try {
      const res = await api.get(
        `/stories/${story!.story_id}/chapters/${chapterID}/status`,
        {
          headers: { "Content-Type": "application/json" },
          // Let us inspect non-2xx instead of throwing
          validateStatus: () => true,
        },
      );

      if (res.status === 200) return { ready: true };
      // Treat “in progress” codes as not ready (keep your 501)
      if (res.status === 501 || res.status === 202 || res.status === 503) {
        const retryAfter =
          (res.headers?.["retry-after"] &&
            Number(res.headers["retry-after"]) * 1000) ||
          undefined;
        return { ready: false, retryAfterMs: retryAfter };
      }
      // Any other code => not ready
      return { ready: false };
    } catch {
      // Network/unknown error => not ready
      return { ready: false };
    }
  };

  const notifyTableNotReady = () => {
    setAlertState({
      title: "Warning",
      message:
        "Your chapter is being created and you will be able to access it once the new chapter's menu item activates.",
      severity: AlertToastType.warning,
      open: true,
      timeout: 30000,
      origin: { horizontal: "left", vertical: "bottom" },
    });
  };

  const notifyTableReady = () => {
    setAlertState({
      title: "Good News",
      message:
        "The chapter you created is ready and available via the chapter menu.",
      severity: AlertToastType.success,
      open: true,
      timeout: 30000,
      origin: { horizontal: "left", vertical: "bottom" },
    });
  };

  const handleNodeSelect = async (
    _e: React.MouseEvent,
    selectedItemId: string,
  ) => {
    if (selectedItemId === "chapters_add") {
      onNewChapterClick();
      return;
    }
    if (selectedItemId !== chapter!.id) {
      const newChapter = story.chapters.find((c) => c.id === selectedItemId);
      if (!newChapter) return;

      if (newChapter.tableNotReady) {
        setAlertState({
          title: "Creating chapter…",
          message:
            "We’re setting things up. This chapter will activate automatically when ready.",
          severity: AlertToastType.info,
          open: true,
          origin: { horizontal: "left", vertical: "bottom" },
        });
        return;
      }

      UpdateChapterQueryStringParameter(newChapter.id);
      setChapter(newChapter);
    }
  };

  const startPollingChapterStatus = (newChapterID: string) => {
    const maxWaitMs = 60_000; // optional cap
    let elapsed = 0;

    const tick = async () => {
      const { ready, retryAfterMs } =
        await checkCurrentChapterTableStatus(newChapterID);
      if (ready) {
        setStory((prev) => {
          if (!prev) return prev;
          const chapters = prev.chapters.map((c) =>
            c.id === newChapterID ? { ...c, tableNotReady: false } : c,
          );
          return { ...prev, chapters };
        });
        notifyTableReady();
        return; // stop polling
      }

      elapsed += retryAfterMs ?? 1000;
      if (elapsed >= maxWaitMs) {
        setAlertState({
          title: "Still working…",
          message:
            "The new chapter is still being prepared. It’ll appear here once ready.",
          severity: AlertToastType.info,
          open: true,
          origin: { horizontal: "left", vertical: "bottom" },
        });
        return;
      }

      const nextDelay =
        retryAfterMs ?? Math.min(5000, 1000 + Math.floor(elapsed / 4));
      pollersRef.current[newChapterID] = window.setTimeout(tick, nextDelay);
    };

    // initial schedule
    pollersRef.current[newChapterID] = window.setTimeout(tick, 1000);
  };

  const onNewChapterClick = async () => {
    const newChapterNum = story.chapters.length + 1;
    const newChapterTitle = "Chapter " + newChapterNum;
    try {
      showLoader();

      const { data: json } = await api.post<Chapter>(
        `/stories/${story.story_id}/chapter`,
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
      const newChapters = [...story.chapters];
      newChapters.push({
        story_id: story.story_id,
        id: json.id,
        title: newChapterTitle,
        place: newChapterNum,
        tableNotReady: true,
      });

      const updatedSelectedStory = { ...story, chapters: newChapters };

      if (series) {
        const storyIdx = series.stories.findIndex(
          (s) => s.story_id === story.story_id,
        );
        if (storyIdx !== -1) {
          const stories = [...series.stories];
          stories[storyIdx] = updatedSelectedStory;
          setSeries({ ...series, stories }); // new array reference
        }
      }

      setStory(updatedSelectedStory);
      notifyTableNotReady();
      startPollingChapterStatus(json.id);
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
        origin: { horizontal: "left", vertical: "bottom" },
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

      await api.put(`/stories/${story.story_id}/chapters`, updatedChapters, {
        headers: {
          "Content-Type": "application/json",
        },
      });
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
        origin: { horizontal: "left", vertical: "bottom" },
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
          `[data-rfd-draggable-id="${chapter?.id}"]`,
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
              {[...story.chapters]
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
                      disable={chap.tableNotReady}
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
