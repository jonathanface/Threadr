import { useNavigate } from "react-router-dom";
import { Story } from "../../types/Story";
import { Avatar, Box, Button, Dialog, DialogContent, DialogTitle, List, ListItemAvatar, ListItemButton, ListItemText, Typography } from "@mui/material";
import { useState } from "react";
import styles from './addstorymodal.module.css';

interface AddStoryModalProps {
    availableStories: Story[];
    onSelectStory: (story: Story) => void;
    seriesID: string | undefined;
}

export const AddStoryModal: React.FC<AddStoryModalProps> = ({
    availableStories,
    onSelectStory,
    seriesID
}) => {
    const navigate = useNavigate();
    const [isAddStoryModalOpen, setIsAddStoryModalOpen] = useState(false);
    if (!seriesID) return;
    return (
        <>
            <Button className={styles.triggerButton} size="small" onClick={() => setIsAddStoryModalOpen(true)}>Add Story</Button>
            <Dialog
                open={isAddStoryModalOpen}
                onClose={() => setIsAddStoryModalOpen(false)}
                fullWidth
                maxWidth="sm"
                sx={{
                    '& .MuiDialog-container': {
                        alignItems: 'center',
                    },
                }}
            >
                <DialogTitle>Select a Story to Add</DialogTitle>
                <DialogContent>
                    {availableStories.length ? (
                        <List>
                            {availableStories.map((story) => (
                                <ListItemButton
                                    className={styles.addStoryItem}
                                    key={story.story_id}
                                    onClick={() => {
                                        onSelectStory(story);
                                        setIsAddStoryModalOpen(false);
                                    }}
                                >
                                    <ListItemAvatar>
                                        <Avatar className={styles.avatar} alt={story.title} src={story.image_url} />
                                    </ListItemAvatar>
                                    <ListItemText primary={story.title} secondary={story.description} />
                                </ListItemButton>
                            ))}
                            <hr />
                            <ListItemButton
                                onClick={() => {
                                    setIsAddStoryModalOpen(false);
                                    navigate(`/series/${seriesID}/add`);
                                }}
                            >

                                <ListItemText
                                    primary="Create New"
                                    secondary="Click here to create a new story for this series"
                                />
                            </ListItemButton>
                        </List>
                    ) : (
                        <Box sx={{ textAlign: "center", mt: 2 }}>
                            <Typography>No existing stories available to add.</Typography>
                            <Button
                                variant="contained"
                                color="primary"
                                onClick={() => {
                                    setIsAddStoryModalOpen(false);
                                    navigate("/stories/new");
                                }}
                                sx={{ mt: 2 }}
                            >
                                Create New Story
                            </Button>
                        </Box>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
};