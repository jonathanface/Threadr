import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import { Button, IconButton } from "@mui/material";
import React from "react";
import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
import { MenuItem, Menu as SideMenu, Sidebar } from "react-pro-sidebar";
import { useDispatch } from "react-redux";
import { setAlert } from "../../stores/alertSlice";
import { AppDispatch } from "../../stores/store";
import { setSelectedStory } from "../../stores/storiesSlice";
import { Chapter, Story } from "../../types";
import { AlertToastType } from "../../utils/Toaster";

interface DocumentSidebarProps {
  story: Story;
  chapter: Chapter;
  onSetChapter: Function;
  setDocumentToBlank: Function;
}

const DocumentSidebar = (props: DocumentSidebarProps) => {
  const useAppDispatch: () => AppDispatch = useDispatch;
  const dispatch = useAppDispatch();

  const onChapterDragEnd = async (result: any) => {
    if (!result.destination) {
      return;
    }
    const newChapters = Array.from(props.story.chapters);
    const [reorderedItem] = newChapters.splice(result.source.index, 1);
    newChapters.splice(result.destination.index, 0, reorderedItem);
    const updatedChapters = newChapters.map((vol: Chapter, idx: number) => {
      return { ...vol, place: idx + 1 };
    });
    const newStory = { ...props.story };
    newStory.chapters = updatedChapters;
    dispatch(setSelectedStory(newStory));

    const response = await fetch("/api/stories/" + props.story.story_id + "/chapters", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updatedChapters),
    });
    if (!response.ok) {
      console.error(response.body);
      const newAlert = {
        title: "Error",
        message: "There was an error updating your chapters. Please report this.",
        severity: AlertToastType.error,
        open: true,
        timeout: 6000,
      };
      dispatch(setAlert(newAlert));
      return;
    }
  };

  const onDeleteChapterClick = (event: React.MouseEvent, chapterID: string, chapterTitle: String) => {
    event.stopPropagation();
    if (props.story.chapters.length === 1) {
      const newAlert = {
        title: "Nope",
        message: "You cannot delete a story's only chapter.",
        severity: AlertToastType.info,
        open: true,
        timeout: 6000,
      };
      dispatch(setAlert(newAlert));
      return;
    }
    const confirm = window.confirm("Delete " + chapterTitle + " from " + props.story.title + "?");
    if (confirm) {
      fetch("/api/stories/" + props.story.story_id + "/chapter/" + chapterID, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      })
        .then((response) => {
          const chapterIndex = props.story.chapters.findIndex((c) => c.id === chapterID);
          if ((response.ok || response.status === 501) && chapterIndex > -1) {
            const newChapters = [...props.story.chapters];
            newChapters.splice(chapterIndex, 1);
            const newSelectedStory = { ...props.story };
            newSelectedStory.chapters = newChapters;
            dispatch(setSelectedStory(newSelectedStory));
            if (props.chapter.id === chapterID) {
              const prevChapter = props.story.chapters[chapterIndex - 1];
              let newChapterID = "";
              if (prevChapter) {
                newChapterID = prevChapter.id;
                props.onSetChapter({
                  id: prevChapter.id,
                  title: prevChapter.title,
                  place: prevChapter.place,
                });
              } else {
                props.setDocumentToBlank();
                props.onSetChapter({
                  id: null,
                  title: "",
                  place: null,
                });
              }
              const history = window.history;
              const storyID = props.story.story_id;
              history.pushState({ storyID }, "deleted chapter", "/story/" + storyID + "?chapter=" + newChapterID);
            }
            return;
          } else {
            throw new Error("Fetch problem deleting chapter " + response.status);
          }
        })
        .catch((error) => {
          console.error(error);
        });
    }
  };

  const onChapterClick = (id: string, title: string, num: number) => {
    if (id !== props.chapter.id) {
      const history = window.history;
      const storyID = props.story.story_id;
      history.pushState({ storyID }, "changed chapter", "/story/" + props.story.story_id + "?chapter=" + id);
      props.onSetChapter({
        id: id,
        title: title,
        place: num,
      });
    }
  };

  const onNewChapterClick = () => {
    const newChapterNum = props.story.chapters.length + 1;
    const newChapterTitle = "Chapter " + newChapterNum;
    //const place = props.story.chapters.findIndex((c) => c.id === props.chapter.id) + 1;

    fetch("/api/stories/" + props.story.story_id + "/chapter", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: newChapterTitle, place: newChapterNum }),
    })
      .then(async (response) => {
        if (response.ok) {
          const json = await response.json();
          const newChapters = [...props.story.chapters];
          newChapters.push({
            story_id: props.story.story_id,
            id: json.id,
            title: newChapterTitle,
            place: newChapterNum,
          });
          const updatedSelectedStory = { ...props.story };
          updatedSelectedStory.chapters = newChapters;
          dispatch(setSelectedStory(updatedSelectedStory));
          onChapterClick(json.id, newChapterTitle, newChapterNum);
        } else {
          throw new Error("Fetch problem creating chapter " + response.status + " " + response.statusText);
        }
      })
      .catch((error) => {
        console.error(error);
      });
  };

  return (
    <Sidebar rtl={false} collapsedWidth="0" defaultCollapsed={true}>
      <SideMenu>
        <DragDropContext onDragEnd={onChapterDragEnd}>
          <Droppable droppableId="droppable">
            {(provided) => (
              <div {...provided.droppableProps} ref={provided.innerRef}>
                {props.story.chapters.map((chapter, idx) => {
                  return (
                    <Draggable key={chapter.id} draggableId={chapter.id} index={idx}>
                      {(provided) => (
                        <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}>
                          {
                            <MenuItem
                              key={idx}
                              className={chapter.id === props.chapter.id ? "active" : ""}
                              onClick={() => {
                                onChapterClick(chapter.id, chapter.title, chapter.place);
                              }}>
                              <span className="chapter-text">{chapter.title}</span>
                              {props.story.chapters.length > 1 ? (
                                <IconButton
                                  className="menu-icon"
                                  edge="end"
                                  size="small"
                                  aria-label="delete chapter"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onDeleteChapterClick(event, chapter.id, chapter.title);
                                  }}>
                                  <DeleteIcon fontSize="small" className={"menu-icon"} />
                                </IconButton>
                              ) : (
                                ""
                              )}
                            </MenuItem>
                          }
                        </div>
                      )}
                    </Draggable>
                  );
                })}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
        <div className="button-container">
          <Button
            className="sidebar-add-new"
            onClick={onNewChapterClick}
            variant="outlined"
            sx={{ color: "#FFF" }}
            startIcon={<AddIcon sx={{ marginLeft: "5px" }} />}>
            New
          </Button>
        </div>
      </SideMenu>
    </Sidebar>
  );
};

export default DocumentSidebar;
