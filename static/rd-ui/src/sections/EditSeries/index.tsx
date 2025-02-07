import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import RemoveIcon from "@mui/icons-material/Remove";
import { Box, IconButton, Typography } from "@mui/material";
import Button from "@mui/material/Button";
import React, { useEffect, useState } from "react";
import { DragDropContext, Draggable, DropResult, Droppable } from "@hello-pangea/dnd";
import styles from "./editseries.module.css";
import { useWorksList } from "../../hooks/useWorksList";
import { Story } from "../../types/Story";
import { Series } from "../../types/Series";
import { useLoader } from "../../hooks/useLoader";
import { useToaster } from "../../hooks/useToaster";
import { AlertState, AlertToastType } from "../../types/AlertToasts";
import { useSelections } from "../../hooks/useSelections";
import { useNavigate, useParams } from "react-router-dom";
import { PortraitDropper } from "../../components/PortraitDropper";
import CloseIcon from '@mui/icons-material/Close';

interface EditSeriesForm {
    [key: string]: string | undefined | File | number | Story[];
    series_id?: string;
    series_title?: string;
    series_description: string;
    stories?: Story[];
    image?: File;
    image_url?: string;
}


export const EditSeries = () => {

    const { propagateSeriesUpdates, propagateStoryUpdates } = useSelections();
    const { storiesList, setStoriesList } = useWorksList();
    const { showLoader, hideLoader } = useLoader();
    const { setAlertState } = useToaster();
    const navigate = useNavigate();
    const { seriesID } = useParams<{ seriesID: string }>();

    const [seriesBuild, setSeriesBuild] = useState<EditSeriesForm>({
        series_title: "",
        series_description: "",
        series_id: undefined,
        image: undefined,
        stories: []
    });

    useEffect(() => {
        if (!seriesID || !seriesID.length) return;
        const fetchSeries = async () => {
            try {
                showLoader();
                const response = await fetch(`/api/series/${seriesID}`);
                if (!response.ok) throw new Error('Series not found');
                const data = await response.json() as Series;
                const editingSeriesBuild: EditSeriesForm = {
                    series_id: data.series_id,
                    series_title: data.series_title,
                    series_description: data.series_description,
                    stories: data.stories,
                    image_url: data.image_url,
                }

                setSeriesBuild(editingSeriesBuild);
            } catch (err) {
                console.error(err);
                setAlertState({
                    title: "Error retrieving data",
                    message:
                        "We are experiencing difficulty retrieving some or all of your data",
                    severity: AlertToastType.error,
                    open: true,
                    timeout: 6000,
                });
            } finally {
                hideLoader();
            }
        };
        fetchSeries();
    }, [seriesID, showLoader, hideLoader, setAlertState]);

    const seriesFormMessage: AlertState = {
        title: "Cannot edit series",
        message: "",
        timeout: 6000,
        open: true,
        severity: AlertToastType.error,
        link: undefined,
    };

    const resetForm = () => {
        seriesFormMessage.title = "Cannot edit series";
        seriesFormMessage.message = "";
        seriesFormMessage.severity = AlertToastType.error;
    };

    const handleClose = () => {
        resetForm();
        navigate('/stories');
    };

    const processImage = (acceptedFiles: File[]) => {
        acceptedFiles.forEach((file) => {
            const reader = new FileReader();
            reader.onabort = () => console.log("file reading was aborted");
            reader.onerror = () => console.error("file reading has failed");
            reader.onload = () => {
                setSeriesBuild((prevBuild) => ({
                    ...prevBuild,
                    file
                }));
            };
            reader.readAsArrayBuffer(file);
        });
    };

    const onDragEnd = (result: DropResult) => {
        if (!result.destination) {
            return;
        }
        if (seriesBuild.stories) {
            const newVolumes = [...seriesBuild.stories];
            const [reorderedItem] = newVolumes.splice(result.source.index, 1);
            newVolumes.splice(result.destination.index, 0, reorderedItem);
            const updatedVolumes = newVolumes.map((vol, idx) => {
                return { ...vol, place: idx + 1 };
            });
            seriesBuild.stories = updatedVolumes;
            setSeriesBuild({ ...seriesBuild });
        }
    };

    const handleSubmit = async () => {
        seriesFormMessage.title = "Cannot edit series";
        seriesFormMessage.message = "";
        seriesFormMessage.severity = AlertToastType.error;
        if (!seriesBuild || !seriesID) {
            return;
        }
        if (seriesBuild.series_title && !seriesBuild.series_title.trim().length) {
            seriesFormMessage.message = "Title cannot be blank";
            return;
        }
        if (seriesBuild.series_description && !seriesBuild.series_description?.trim().length) {
            seriesFormMessage.message = "Description cannot be blank";
            return;
        }

        const formData = new FormData();
        for (const key in seriesBuild) {
            if (Object.prototype.hasOwnProperty.call(seriesBuild, key)) {
                const value = seriesBuild[key];
                if (value === undefined) continue;
                if (typeof value === "string" || typeof value === "number") {
                    formData.append(key, value.toString());
                    continue;
                }
                if (value instanceof Array) {
                    formData.append(key, JSON.stringify(value));
                }
                if (value instanceof File) {
                    formData.append("file", value);
                }
            }
        }
        try {
            showLoader();
            const response = await fetch("/api/series/" + seriesID, {
                credentials: "include",
                method: "PUT",
                body: formData,
            });
            if (!response.ok) {
                const errorData = await response.json();
                const error = new Error(JSON.stringify(errorData));
                error.message = response.statusText;
                throw error;
            }


            const json: Series = await response.json();
            propagateSeriesUpdates(json);
            handleClose();
        } catch (error: unknown) {
            console.error("Error fetching data: ", error);
            seriesFormMessage.message = "Unable to edit your series at this time. Please try again later or contact support.";
            setAlertState(seriesFormMessage);
        } finally {
            hideLoader();
        }
        seriesFormMessage.title = "Edit Action Complete";
        seriesFormMessage.message = "Your changes were saved.";
        seriesFormMessage.severity = AlertToastType.success;
        setAlertState(seriesFormMessage);
    };

    const removeStory = async (event: React.MouseEvent, id: string, selectedTitle: string) => {
        event.stopPropagation();
        const confirmText = "Remove " + selectedTitle + " from " + seriesBuild.series_title + "?";
        const conf = window.confirm(confirmText);
        if (conf) {
            showLoader();
            const url = "/api/series/" + seriesID + "/story/" + id;
            try {
                const response = await fetch(url, {
                    credentials: "include",
                    method: "PUT",
                });
                if (!response.ok) {
                    const errorData = await response.json();
                    const error = new Error(JSON.stringify(errorData));
                    error.message = response.statusText;
                    throw error;
                }
                const json: Series = await response.json();

                const removedStory = seriesBuild.stories?.find((volume) => volume.story_id === id);
                if (removedStory) {
                    removedStory.series_id = undefined;
                    propagateStoryUpdates(removedStory);
                    if (storiesList) {
                        setStoriesList([...storiesList, removedStory]);
                    } else {
                        setStoriesList([removedStory]);
                    }
                }
                propagateSeriesUpdates(json);
                setSeriesBuild((prev) => ({
                    ...prev,
                    stories: json.stories
                }));
                hideLoader();
            } catch (error: unknown) {
                console.error("Error fetching data: ", error);
                seriesFormMessage.message =
                    "Unable to edit your series at this time. Please try again later or contact support.";
                setAlertState(seriesFormMessage);
            } finally {
                hideLoader();
            }
        }
    };

    const editStory = (event: React.MouseEvent, storyID: string) => {
        event.stopPropagation();
        if (seriesBuild.stories) {
            const selected = seriesBuild.stories.find((entry) => entry.story_id === storyID);
            if (selected) {
                const newStory: Story = {
                    story_id: storyID,
                    title: selected.title,
                    description: selected.description,
                    series_id: selected.series_id,
                    image_url: selected.image_url,
                    chapters: selected.chapters,
                };
                propagateStoryUpdates(newStory);
            }
        }
    };

    const addStory = (event: React.MouseEvent) => {
        event.stopPropagation();
        resetForm();
        navigate('/stories/new');
    };

    return (
        <Box className={styles.editSeriesContainer}>
            <Box className={styles.header}>
                <IconButton onClick={handleClose} sx={{ mr: 1 }}>
                    <CloseIcon />
                </IconButton>
            </Box>
            <Typography variant="h5" component="h2" sx={{ marginBottom: 2 }}>
                Edit Series
            </Typography>
            <Box className={styles.content}>
                <Box className={`${styles.column} ${styles.left}`}>
                    <PortraitDropper
                        imageURL={seriesBuild.image_url || ""}
                        name={seriesBuild.series_title || ""}
                        onImageLoaded={() => { }}
                        onComplete={processImage}
                    />
                </Box>
                <Box className={`${styles.column} ${styles.right}`}>
                    <p>
                        <label htmlFor="edit-series-title">Title:</label>
                        <input
                            defaultValue={seriesBuild.series_title}
                            key={seriesBuild.series_title}
                            type="text"
                            id="edit-series-title"
                            onKeyUp={(event: React.KeyboardEvent<HTMLInputElement>) => {
                                setSeriesBuild((prev) => ({
                                    ...prev,
                                    series_title: (event.target as HTMLInputElement).value,
                                }));
                            }}
                        />
                    </p>
                    <p>
                        <label htmlFor="edit-series-description">Description:</label>
                        <textarea
                            defaultValue={seriesBuild.series_description}
                            key={seriesBuild.series_description}
                            spellCheck="false"
                            id="edit-series-description"
                            onChange={(event) => {
                                setSeriesBuild((prev) => ({
                                    ...prev,
                                    series_description: event.target.value,
                                }));
                            }}
                        />
                    </p>
                </Box>
            </Box>
            <Box sx={{ marginTop: 2 }}>
                <hr />
                <Typography variant="h6">
                    Volumes
                    <IconButton
                        className={styles.addStory}
                        aria-label="add story"
                        sx={{ padding: 0 }}
                        onClick={addStory}
                        title="Add"
                    >
                        <AddIcon sx={{ fontSize: 24, color: "#000", marginLeft: 1 }} />
                    </IconButton>
                </Typography>
                <DragDropContext onDragEnd={onDragEnd}>
                    <Droppable droppableId="droppable">
                        {(provided) => (
                            <Box ref={provided.innerRef} {...provided.droppableProps}>
                                {seriesBuild.stories &&
                                    seriesBuild.stories.map((entry, index) => (
                                        <Draggable
                                            key={entry.story_id}
                                            draggableId={entry.story_id}
                                            index={index}
                                        >
                                            {(provided) => (
                                                <Box
                                                    className={styles.editSeriesVolumes}
                                                    ref={provided.innerRef}
                                                    {...provided.draggableProps}
                                                    {...provided.dragHandleProps}
                                                >
                                                    <Box>
                                                        <span className={styles.seriesIcon}>
                                                            <img src={entry.image_url} alt={entry.title} />
                                                        </span>
                                                        <span>{entry.title}</span>
                                                        <span className={styles.storyButtons}>
                                                            <IconButton
                                                                className={styles.editSeriesStory}
                                                                aria-label="edit story"
                                                                sx={{ padding: 0 }}
                                                                onClick={(event) =>
                                                                    editStory(event, entry.story_id)
                                                                }
                                                                title="Edit"
                                                            >
                                                                <EditIcon
                                                                    sx={{
                                                                        fontSize: 18,
                                                                        color: "#000",
                                                                        padding: 1,
                                                                    }}
                                                                />
                                                            </IconButton>
                                                            <IconButton
                                                                className={styles.removeSeriesStory}
                                                                aria-label="remove story"
                                                                onClick={(event) =>
                                                                    removeStory(event, entry.story_id, entry.title)
                                                                }
                                                                title="Remove"
                                                            >
                                                                <RemoveIcon sx={{ fontSize: 18, color: "#000" }} />
                                                            </IconButton>
                                                        </span>
                                                    </Box>
                                                </Box>
                                            )}
                                        </Draggable>
                                    ))}
                                {provided.placeholder}
                            </Box>
                        )}
                    </Droppable>
                </DragDropContext>
            </Box>
            <Box sx={{ display: "flex", justifyContent: "flex-end", marginTop: 2 }}>
                <Button onClick={handleSubmit}>Update</Button>
            </Box>
        </Box>
    );
};
