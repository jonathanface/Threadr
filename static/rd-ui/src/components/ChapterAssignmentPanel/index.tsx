import { useState } from "react";
import { List, ListItem, ListItemText, Checkbox, Typography, Box, ListItemButton } from "@mui/material";
import { Outline, OutlineSection } from "../../types/Outline";
import { useSelections } from "../../hooks/useSelections";
import styles from './chapterassignment.module.css';
import { useLoader } from "../../hooks/useLoader";
import { AlertToastType } from "../../types/AlertToasts";
import { useToaster } from "../../hooks/useToaster";

interface ChapterAssignmentPanelProps {
    section: OutlineSection;
}

export const ChapterAssignmentPanel = ({ section }: ChapterAssignmentPanelProps) => {
    const { story, setStory, propagateStoryUpdates } = useSelections();
    const { showLoader, hideLoader } = useLoader();
    const { setAlertState } = useToaster();
    const [assignedChapters, setAssignedChapters] = useState<string[]>(section.chapters || []);

    if (!story || !story.outline) return null;

    const assignedChaptersInOtherSections = new Set(
        story.outline.flatMap(sec => (sec.place !== section.place ? sec.chapters || [] : []))
    );

    // Chapters already assigned to this section
    const currentlyAssignedChapters = story.chapters.filter(chap => assignedChapters.includes(chap.id));

    // Chapters available for assignment (not assigned elsewhere and not already assigned to this section)
    const availableChapters = story.chapters.filter(chap =>
        !assignedChaptersInOtherSections.has(chap.id) && !assignedChapters.includes(chap.id)
    );

    const updateOutline = async (updatedSections: OutlineSection[]) => {
        try {
            showLoader();
            const newStory = { ...story };
            newStory.outline = updatedSections;
            setStory(newStory);
            const updatedOutline: Outline = {
                storyID: story.story_id,
                sections: updatedSections
            }
            const response = await fetch("/api/outline", {
                method: "PUT",
                body: JSON.stringify(updatedOutline),
            });
            if (!response.ok) {
                console.error(response.statusText);
                throw new Error('There was an error updating your outline. Please report this.')
            }
        } catch (error) {
            setAlertState({
                title: "Error",
                message: (error as Error).message,
                severity: AlertToastType.error,
                open: true
            });
        } finally {
            hideLoader();
        }
    };

    // Handler to toggle assignment
    const handleToggleChapter = (chapterId: string) => {
        let updatedChapters;
        if (assignedChapters.includes(chapterId)) {
            updatedChapters = assignedChapters.filter(id => id !== chapterId);
        } else {
            updatedChapters = [...assignedChapters, chapterId];
        }
        setAssignedChapters(updatedChapters);

        // now update the story object
        const updatedStory = { ...story };
        const sectionIndex = updatedStory.outline?.findIndex(sec => sec.place === section.place);

        if (updatedStory.outline && sectionIndex !== undefined && sectionIndex !== -1) {
            updatedStory.outline[sectionIndex].chapters = updatedChapters;
            updateOutline(updatedStory.outline);
        }
        setStory(updatedStory);
        propagateStoryUpdates(updatedStory);
    };


    return (
        <Box className={styles.chapterAssignment} sx={{ padding: "6px" }}>
            <Typography variant="subtitle2" className={styles.title}>
                Assign Chapters:
            </Typography>

            <List dense={true} className={styles.chapterList}>
                {/* If no chapters exist in the story */}
                {story.chapters.length === 0 && (
                    <Typography variant="caption" className={styles.warning}>
                        No chapters exist in this story.
                    </Typography>
                )}

                {/* Show "Currently Assigned" Section if applicable */}
                {currentlyAssignedChapters.length > 0 && (
                    <>
                        {currentlyAssignedChapters.map(chapter => (
                            <ListItem key={chapter.id} className={styles.listItem}>
                                <ListItemButton onClick={() => handleToggleChapter(chapter.id)} className={styles.button}>
                                    <Checkbox
                                        edge="start"
                                        checked={true}
                                        className={styles.checkbox}
                                        tabIndex={-1}
                                        disableRipple
                                    />
                                    <ListItemText
                                        primary={chapter.title}
                                        className={styles.label}
                                    />
                                </ListItemButton>
                            </ListItem>
                        ))}
                    </>
                )}

                {/* Show "Available for Assignment" Section if applicable */}
                {availableChapters.length > 0 && (
                    <>
                        {availableChapters.map(chapter => (
                            <ListItem key={chapter.id} className={styles.listItem}>
                                <ListItemButton onClick={() => handleToggleChapter(chapter.id)} className={styles.button}>
                                    <Checkbox
                                        edge="start"
                                        checked={assignedChapters.includes(chapter.id)}
                                        className={styles.checkbox}
                                        tabIndex={-1}
                                        disableRipple
                                    />
                                    <ListItemText
                                        primary={chapter.title}
                                        className={styles.label}
                                    />
                                </ListItemButton>
                            </ListItem>
                        ))}
                    </>
                )}

                {/* If all chapters are assigned elsewhere */}
                {story.chapters.length > 0 && availableChapters.length === 0 && currentlyAssignedChapters.length === 0 && (
                    <Typography variant="caption" className={styles.warning}>
                        No chapters available for assignment.
                    </Typography>
                )}
            </List>
        </Box>
    );
};
