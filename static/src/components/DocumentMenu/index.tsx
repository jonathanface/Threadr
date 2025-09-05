import { Box, Drawer, IconButton, Paper, Tooltip } from "@mui/material";
import { Settings } from "@mui/icons-material";
import styles from "./settingsmenu.module.css";
import FormatListNumberedIcon from "@mui/icons-material/FormatListNumbered";
import CancelPresentationIcon from "@mui/icons-material/CancelPresentation";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useSelections } from "../../hooks/useSelections";
import { ClickData } from "../ThreadWriter/plugins/DocumentClickPlugin";
import { DocumentSettingsModal } from "../DocumentSettingsModal";
import { ChapterMenu } from "../ChapterMenu";
import { OutlineMenu } from "../OutlineMenu";
import { useFetchUserData } from "../../hooks/useFetchUserData";
import MenuBookTwoToneIcon from "@mui/icons-material/MenuBookTwoTone";

interface DocumentMenuProps {
  onAssociationClick: (data: ClickData) => void;
}

export const DocumentMenu = (props: DocumentMenuProps) => {
  const navigate = useNavigate();
  const { deselectAll } = useSelections();
  const [isEditorChapterMenuOpen, setIsEditorChapterMenuOpen] = useState(false);
  const [isEditorOutlineMenuOpen, setIsEditorOutlineMenuOpen] = useState(false);
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
  const userSettings = useFetchUserData();

  const closeSideMenus = () => {
    setIsEditorChapterMenuOpen(false);
    setIsEditorOutlineMenuOpen(false);
  };

  const closeDoc = () => {
    navigate(`/stories`);
    deselectAll();
  };

  if (!userSettings?.userDetails) {
    return null;
  }
  const isSubscriber: boolean = Boolean(
    userSettings.userDetails.subscription_id.length,
  );
  if (!isSubscriber) return null;

  return (
    <div>
      <Paper className={styles.sideMenu} elevation={3}>
        <Tooltip title="Close this Document" placement="right">
          <IconButton onClick={closeDoc}>
            <CancelPresentationIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="Chapters" placement="right">
          <IconButton
            onClick={() => {
              setIsEditorChapterMenuOpen(true);
            }}
          >
            <FormatListNumberedIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="Outline" placement="right">
          <IconButton
            onClick={() => {
              setIsEditorOutlineMenuOpen(true);
            }}
          >
            <MenuBookTwoToneIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="Settings" placement="right">
          <IconButton
            onClick={() => {
              setIsSettingsMenuOpen(true);
            }}
          >
            <Settings />
          </IconButton>
        </Tooltip>
      </Paper>
      <DocumentSettingsModal
        open={isSettingsMenuOpen}
        setOpen={setIsSettingsMenuOpen}
      />
      <Drawer
        variant="temporary"
        anchor={"right"}
        open={isEditorChapterMenuOpen}
        onClose={(_, reason) => {
          if (reason === "backdropClick" || reason === "escapeKeyDown") {
            closeSideMenus();
          }
        }}
        ModalProps={{ keepMounted: true }}
      >
        <Box
          className={styles.flyoutMenu}
          role="presentation"
          component="section"
        >
          <ChapterMenu />
        </Box>
      </Drawer>
      <Drawer
        variant="temporary"
        anchor={"right"}
        open={isEditorOutlineMenuOpen}
        onClose={(_, reason) => {
          if (reason === "backdropClick" || reason === "escapeKeyDown") {
            closeSideMenus();
          }
        }}
        ModalProps={{ keepMounted: true }}
      >
        <Box
          className={styles.flyoutMenu}
          role="presentation"
          component="section"
        >
          <OutlineMenu onAssociationClick={props.onAssociationClick} />
        </Box>
      </Drawer>
    </div>
  );
};
