import { SimpleTreeView, TreeItem } from "@mui/x-tree-view"
import { Chapter } from "../../types/Chapter"
import styles from "./chapteritems.module.css"
import { useSelections } from "../../hooks/useSelections";
import PostAddIcon from '@mui/icons-material/PostAdd';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { Button, IconButton } from "@mui/material";
import { useLoader } from "../../hooks/useLoader";
import { AlertToastType } from "../../types/AlertToasts";
import { useToaster } from "../../hooks/useToaster";
import { DragDropContext, Droppable } from "@hello-pangea/dnd";
import { DraggableTreeItem } from "./DraggableTreeItem";

interface SettingsMenuProps {
    chapters: Chapter[];
}

export const ChapterItems = ({ chapters }: SettingsMenuProps) => {

    const { story, chapter, setChapter, setStory, series, setSeries } = useSelections();
    const { showLoader, hideLoader } = useLoader();
    const { setAlertState } = useToaster();
    if (!chapter || !story) return;

    const updateChapterParameter = (chapterID: string) => {
        const newurl = window.location.protocol + "//" + window.location.host + window.location.pathname + '?chapter=' + chapterID;
        window.history.pushState({ path: newurl }, '', newurl);
    }

    const handleNodeSelect = (_event: React.MouseEvent, selectedItemId: string) => {

        if (selectedItemId === "chapters_add") {
            onNewChapterClick();
            return;
        }
        if (selectedItemId !== chapter.id) {
            const newChapter = chapters.find(chapter => chapter.id === selectedItemId);
            if (newChapter) {
                updateChapterParameter(newChapter.id);
                setChapter(newChapter);
                //closeFn(false);
            }
        }
    };

    const onNewChapterClick = async () => {
        const newChapterNum = chapters.length + 1;
        const newChapterTitle = "Chapter " + newChapterNum;
        try {
            showLoader();
            const response = await fetch("/api/stories/" + story.story_id + "/chapter", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ title: newChapterTitle, place: newChapterNum }),
            });
            if (!response.ok) throw new Error(response.statusText);
            const json = await response.json() as Chapter;
            json.story_id = story.story_id;
            const newChapters = [...chapters];
            newChapters.push({
                story_id: story.story_id,
                id: json.id,
                title: newChapterTitle,
                place: newChapterNum,
            });
            const updatedSelectedStory = { ...story };
            updatedSelectedStory.chapters = newChapters;
            if (series) {
                const storyIdx = series.stories.findIndex(thisStory => thisStory.story_id === story.story_id);
                if (storyIdx !== -1) {
                    const updatedSeries = { ...series };
                    updatedSeries.stories[storyIdx] = updatedSelectedStory;
                    setSeries(updatedSeries);
                }
            }
            setStory(updatedSelectedStory);
            setChapter(json);
            updateChapterParameter(json.id);
        } catch (error) {
            console.error(`Error creating chapter: ${error}`);
            setAlertState({
                title: "Problem",
                message: "An error occurred creating your chapter.",
                severity: AlertToastType.info,
                open: true,
                timeout: 6000,
            });
        } finally {
            hideLoader();
        }
    };

    const onDeleteChapterClick = async (event: React.MouseEvent, chapterIDToDelete: string, chapterTitle: string) => {
        event.stopPropagation();
        if (story.chapters.length === 1) {
            setAlertState({
                title: "Nope",
                message: "You cannot delete a story's only chapter.",
                severity: AlertToastType.info,
                open: true,
                timeout: 6000,
            });
            return;
        }
        const confirm = window.confirm("Delete " + chapterTitle + " from " + story.title + "?");
        if (confirm) {
            try {
                showLoader();
                const response = await fetch("/api/stories/" + story.story_id + "/chapter/" + chapterIDToDelete, {
                    method: "DELETE",
                    headers: {
                        "Content-Type": "application/json",
                    },
                });
                if (!response.ok && response.status !== 501) throw new Error(response.statusText);
                const chapterIndex = chapters.findIndex((c) => c.id === chapterIDToDelete);
                if (chapterIndex !== -1) {
                    const newChapters = [...chapters];
                    newChapters.splice(chapterIndex, 1);
                    const newSelectedStory = { ...story };
                    newSelectedStory.chapters = newChapters;
                    chapters = newChapters;
                    console.log("chaps", chapters);
                    setStory(newSelectedStory);
                    if (chapter.id === chapterIDToDelete) {
                        const prevChapter = story.chapters[chapterIndex - 1];
                        console.log("prevChapter", prevChapter.title);
                        setChapter(prevChapter);
                        updateChapterParameter(prevChapter.id);
                    }
                }
            } catch (error) {
                console.error(error);
            } finally {
                hideLoader();
            }
        }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onChapterDragEnd = async (result: any) => {
        if (!result.destination || !result.source) return;
        if (result.destination.index === result.source.index) return;
        const newChapters = Array.from(story.chapters);
        const [reorderedItem] = newChapters.splice(result.source.index, 1);
        newChapters.splice(result.destination.index, 0, reorderedItem);
        const updatedChapters = newChapters.map((vol: Chapter, idx: number) => {
            return { ...vol, place: idx + 1 };
        });

        try {
            showLoader();
            const response = await fetch("/api/stories/" + story.story_id + "/chapters", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(updatedChapters),
            });
            if (!response.ok) {
                console.error(response.body);
                throw new Error("There was an error updating your chapters. Please report this.");
            }
            const newStory = { ...story };
            newStory.chapters = updatedChapters;
            setStory(newStory);
        } catch (error: unknown) {
            const message = (error as Error).message;
            setAlertState({
                title: "Error",
                message,
                severity: AlertToastType.error,
                open: true,
                timeout: 6000,
            });
        } finally {
            hideLoader();
        }
    };

    return (
        <SimpleTreeView className={styles.parentView} onItemClick={handleNodeSelect}>
            <TreeItem itemId="chapters" label="Chapters" sx={{
                "& .MuiTreeItem-label": {
                    fontFamily: "Segoe Print",
                    fontSize: '0.9rem'
                }
            }}>
                <TreeItem key="chapters_add" title={"add new chapter"} label={
                    <Button size="medium" variant="text" startIcon={<PostAddIcon />}><span className={styles.newButtonLabel}>NEW</span></Button>
                } itemId="chapters_add" />
                <DragDropContext onDragEnd={onChapterDragEnd}>
                    <Droppable droppableId="droppable-chapters">
                        {(provided) => (
                            <div
                                {...provided.droppableProps}
                                ref={provided.innerRef}
                                style={{ paddingLeft: '1rem' }} // Indent draggable items
                            >
                                {chapters
                                    .sort((a, b) => a.place - b.place)
                                    .map((chap, idx) => (
                                        <DraggableTreeItem
                                            key={chap.id}
                                            draggableId={chap.id}
                                            index={idx}
                                            itemId={chap.id}
                                            className={`${chap.id === chapter.id ? styles.activeChapter : ""}`}
                                            label={
                                                <span className={styles.chapterMenuItem}>
                                                    {chap.title}
                                                    <IconButton
                                                        title="delete"
                                                        aria-label="delete"
                                                        size="small"
                                                        onClick={(event) =>
                                                            onDeleteChapterClick(event, chap.id, chap.title)
                                                        }
                                                    >
                                                        <DeleteOutlineIcon />
                                                    </IconButton>
                                                </span>
                                            }
                                            sx={{
                                                '& .MuiTreeItem-label': {
                                                    fontSize: '0.8rem',
                                                },
                                            }}
                                        />
                                    ))}
                                {provided.placeholder}
                            </div>
                        )}
                    </Droppable>
                </DragDropContext>
            </TreeItem>
            <TreeItem itemId="outline" label="Outline" disabled={true} sx={{
                "& .MuiTreeItem-label": {
                    fontFamily: "Segoe Print",
                    fontSize: '0.9rem'
                }
            }}></TreeItem>
        </SimpleTreeView>
    );
}
