import { Box, Drawer, IconButton, Paper, Tooltip } from "@mui/material"
import { FlyoutMenuItems } from "../FlyoutMenuItems";
import { Settings } from "@mui/icons-material";
import styles from "./settingsmenu.module.css";
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import CancelPresentationIcon from '@mui/icons-material/CancelPresentation';
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useSelections } from "../../hooks/useSelections";
import { ClickData } from "../ThreadWriter/plugins/DocumentClickPlugin";

interface StorySettingsMenuProps {
    onAssociationClick: (data: ClickData) => void;
}
export const StorySettingsMenu = (props: StorySettingsMenuProps) => {
    const navigate = useNavigate();
    const { story, deselectAll } = useSelections();
    const [isEditorMenuOpen, setIsEditorMenuOpen] = useState(false);
    if (!story) return;

    const closeDoc = () => {
        navigate(`/stories`);
        deselectAll();
    }

    return (
        <div>
            <Paper
                className={styles.sideMenu}
                elevation={3}
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
                    className={styles.flyoutMenu}
                    role="presentation"
                    component="section">
                    <FlyoutMenuItems chapters={story.chapters} onAssociationClick={props.onAssociationClick} />
                </Box>
            </Drawer>
        </div>
    );
}