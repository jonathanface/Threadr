import { Settings } from "@mui/icons-material";
import CancelPresentationIcon from "@mui/icons-material/CancelPresentation";
import FormatListNumberedIcon from "@mui/icons-material/FormatListNumbered";
import MenuBookTwoToneIcon from "@mui/icons-material/MenuBookTwoTone";
import { Box, Drawer, IconButton, Paper, Tooltip } from "@mui/material";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFetchUserData } from "../../../../hooks/useFetchUserData";
import { useSelections } from "../../../../hooks/useSelections";
import type { ClickData } from "../../plugins/DocumentClickPlugin";
import { ChapterMenu } from "../ChapterMenu";
import { OutlineMenu } from "../OutlineMenu";
import { DocumentSettingsModal } from "./DocumentSettingsModal";
import styles from "./settingsmenu.module.css";

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

  return (
    <div>
      <Paper
        className={styles.sideMenu}
        elevation={3}
        sx={{
          backgroundColor: "var(--bg-toolbar)",
          color: "var(--text-primary)",
        }}
      >
        <Tooltip title="Close this Document" placement="right">
          <IconButton onClick={closeDoc} sx={{ color: "var(--text-primary)" }}>
            <CancelPresentationIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="Chapters" placement="right">
          <IconButton
            onClick={() => {
              setIsEditorChapterMenuOpen(true);
            }}
            sx={{ color: "var(--text-primary)" }}
          >
            <FormatListNumberedIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="Outline" placement="right">
          <IconButton
            onClick={() => {
              setIsEditorOutlineMenuOpen(true);
            }}
            sx={{ color: "var(--text-primary)" }}
          >
            <MenuBookTwoToneIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="Settings" placement="right">
          <IconButton
            onClick={() => {
              setIsSettingsMenuOpen(true);
            }}
            sx={{ color: "var(--text-primary)" }}
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
        PaperProps={{
          sx: {
            backgroundColor: "var(--bg-primary)",
            color: "var(--text-primary)",
          },
        }}
      >
        <Box
          className={styles.flyoutMenu}
          role="presentation"
          component="section"
        >
          <ChapterMenu
            onChapterSelect={() => setIsEditorChapterMenuOpen(false)}
          />
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
        PaperProps={{
          sx: {
            backgroundColor: "var(--bg-primary)",
            color: "var(--text-primary)",
          },
        }}
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
