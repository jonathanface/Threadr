
import { Button, Dialog, DialogContent, DialogTitle, List, ListItemButton, ListItemText } from "@mui/material";
import { useState } from "react";
import styles from './createoutline.module.css';
import { Outline, OutlineType } from "../../types/Outline";
import { useLoader } from "../../hooks/useLoader";
import { useSelections } from "../../hooks/useSelections";
import { useToaster } from "../../hooks/useToaster";
import { AlertToastType } from "../../types/AlertToasts";


interface OutlineForm {
    storyID: string;
    type: OutlineType;
}

export const CreateOutline: React.FC = () => {
    const [isListOpen, setIsListOpen] = useState(false);
    const { showLoader, hideLoader } = useLoader();
    const { setAlertState } = useToaster();
    const { story, setStory } = useSelections();

    const createOutline = async (type: OutlineType) => {
        if (!story) return;
        try {
            showLoader();
            const body: OutlineForm = {
                storyID: story.story_id,
                type
            }
            const response = await fetch("/api/outline", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
            });
            if (!response.ok) throw new Error(response.statusText);
            const outline = (await response.json() as Outline).sections;
            setStory({ ...story, outline });
        } catch (error) {
            console.error(error);
            setAlertState({
                title: "Error",
                message: "Unable to create your outline at this time. Please try again later.",
                severity: AlertToastType.error,
                open: true
            });
        } finally {
            hideLoader();
            setIsListOpen(false);
        }
    }

    const promptOrShowPanel = () => {
        const confirm = window.confirm("WARNING: choosing a new template on the following screen will overwrite any existing outline. Are you sure you want to proceed?");
        if (confirm) setIsListOpen(true);
    }

    return (
        <>
            <Button className={styles.triggerButton} size="small" onClick={promptOrShowPanel}>{story?.outline ? "Replace Outline" : "Create Outline"}</Button>
            <Dialog open={isListOpen} onClose={() => setIsListOpen(false)} fullWidth maxWidth="sm">
                <DialogTitle>Choose an outline template</DialogTitle>
                <DialogContent>
                    <List>
                        <ListItemButton
                            className={styles.addStoryItem}
                            key="three-act"
                            onClick={() => {
                                createOutline(OutlineType.threeAct);
                            }}
                        >
                            <ListItemText primary="Three-Act Structure" secondary="Best for writers who like a clear beginning, middle, and end with a focus on pacing." />
                        </ListItemButton>
                        <ListItemButton
                            className={styles.addStoryItem}
                            key="five-act"
                            onClick={() => {
                                createOutline(OutlineType.fiveAct);
                            }}
                        >
                            <ListItemText primary="Five-Act Structure" secondary="Best for writers who want more room for character and thematic development." />
                        </ListItemButton>
                        <ListItemButton
                            className={styles.addStoryItem}
                            key="hero-journey"
                            onClick={() => {
                                createOutline(OutlineType.hero);
                            }}
                        >
                            <ListItemText primary="The Hero's Journey" secondary="Best for writers crafting epic or transformative character arcs." />
                        </ListItemButton>
                    </List>
                </DialogContent>
            </Dialog>
        </>
    );
};