import { Box, Drawer, IconButton, Paper, Tooltip } from "@mui/material"
import { ChapterItems } from "../ChapterItems";
import { Settings } from "@mui/icons-material";
import styles from "./settingsmenu.module.css";
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import CancelPresentationIcon from '@mui/icons-material/CancelPresentation';
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useSelections } from "../../hooks/useSelections";


export const SettingsMenu = () => {
    const navigate = useNavigate();
    const { story, deselectChapter, deselectSeries, deselectStory } = useSelections();
    const [isEditorMenuOpen, setIsEditorMenuOpen] = useState(false);
    if (!story) return;

    const closeDoc = () => {
        navigate(`/stories`);
        deselectChapter();
        deselectStory();
        deselectSeries();
    }

    return (
        <div>
            <Paper
                className={styles.sideMenu}
                elevation={3}
                sx={{
                    width: 32,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    py: 2,
                }}
            >
                <Tooltip title="Close this Document" placement="right">
                    <IconButton onClick={closeDoc}>
                        <CancelPresentationIcon />
                    </IconButton>
                </Tooltip>
                <Tooltip title="Chapters & Layout" placement="right">
                    <IconButton onClick={() => { setIsEditorMenuOpen(true) }}>
                        <FormatListNumberedIcon />
                    </IconButton>
                </Tooltip>
                <Tooltip title="Settings" placement="right">
                    <IconButton disabled={true}>
                        <Settings />
                    </IconButton>
                </Tooltip>
            </Paper>

            <Drawer anchor={"right"} open={isEditorMenuOpen} onClose={() => { setIsEditorMenuOpen(false) }}>
                <Box
                    sx={{ width: 250 }}
                    role="presentation"
                    component="section">
                    <ChapterItems chapters={story.chapters} closeFn={() => { setIsEditorMenuOpen(false) }} />
                </Box>
            </Drawer>
        </div>
    );
}