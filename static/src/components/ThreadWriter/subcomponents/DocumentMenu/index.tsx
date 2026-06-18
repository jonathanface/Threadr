import { Settings } from "@mui/icons-material";
import CancelPresentationIcon from "@mui/icons-material/CancelPresentation";
import CloseIcon from "@mui/icons-material/Close";
import FormatListNumberedIcon from "@mui/icons-material/FormatListNumbered";
import MenuBookTwoToneIcon from "@mui/icons-material/MenuBookTwoTone";
import ShareIcon from "@mui/icons-material/Share";
import CommentIcon from "@mui/icons-material/Comment";
import { Badge, Box, Drawer, IconButton, Paper, Tooltip } from "@mui/material";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFetchUserData } from "../../../../hooks/useFetchUserData";
import { useSelections } from "../../../../hooks/useSelections";
import type { ClickData } from "../../plugins/DocumentClickPlugin";
import { ChapterMenu } from "../ChapterMenu";
import { OutlineMenu } from "../OutlineMenu";
import { DocumentSettingsModal } from "./DocumentSettingsModal";
import { ShareDialog } from "./ShareDialog";
import { CommentsPanel } from "./CommentsPanel";
import styles from "./settingsmenu.module.css";

interface DocumentMenuProps {
  onAssociationClick: (data: ClickData) => void;
}

export const DocumentMenu = (props: DocumentMenuProps) => {
  const navigate = useNavigate();
  const { deselectAll, chapter } = useSelections();
  const [isEditorChapterMenuOpen, setIsEditorChapterMenuOpen] = useState(false);
  const [isEditorOutlineMenuOpen, setIsEditorOutlineMenuOpen] = useState(false);
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isCommentsDrawerOpen, setIsCommentsDrawerOpen] = useState(false);
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

  const shareDisabled = !userSettings.userDetails.subscriber;
  const shareTooltip = shareDisabled
    ? "Sharing with readers is only available to subscribers"
    : "Share";

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
        <Tooltip title={shareTooltip} placement="right">
          <span>
            <IconButton
              onClick={() => {
                if (shareDisabled) return;
                setIsShareDialogOpen(true);
              }}
              disabled={shareDisabled}
              sx={{
                color: "var(--text-primary)",
                "&.Mui-disabled": {
                  color: "var(--text-primary)",
                  opacity: 0.4,
                },
              }}
            >
              <ShareIcon />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Reader Comments" placement="right">
          <IconButton
            onClick={() => {
              setIsCommentsDrawerOpen(true);
            }}
            sx={{ color: "var(--text-primary)" }}
          >
            <Badge
              badgeContent={chapter?.comment_count || 0}
              color="primary"
              invisible={!chapter?.comment_count}
              max={99}
            >
              <CommentIcon />
            </Badge>
          </IconButton>
        </Tooltip>
      </Paper>
      <DocumentSettingsModal
        open={isSettingsMenuOpen}
        setOpen={setIsSettingsMenuOpen}
      />
      <ShareDialog
        open={isShareDialogOpen}
        setOpen={setIsShareDialogOpen}
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
          sx={{ paddingTop: "48px" }}
        >
          <IconButton
            onClick={() => setIsEditorChapterMenuOpen(false)}
            sx={{
              position: "absolute",
              right: 8,
              top: 8,
              color: "var(--text-primary)",
              zIndex: 1,
            }}
            aria-label="close"
          >
            <CloseIcon />
          </IconButton>
          <ChapterMenu
            onChapterSelect={() => setIsEditorChapterMenuOpen(false)}
            isOpen={isEditorChapterMenuOpen}
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
          sx={{ paddingTop: "48px" }}
        >
          <IconButton
            onClick={() => setIsEditorOutlineMenuOpen(false)}
            sx={{
              position: "absolute",
              right: 8,
              top: 8,
              color: "var(--text-primary)",
              zIndex: 1,
            }}
            aria-label="close"
          >
            <CloseIcon />
          </IconButton>
          <OutlineMenu onAssociationClick={props.onAssociationClick} />
        </Box>
      </Drawer>
      <Drawer
        variant="persistent"
        anchor={"right"}
        open={isCommentsDrawerOpen}
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
          sx={{ paddingTop: "48px" }}
        >
          <IconButton
            onClick={() => setIsCommentsDrawerOpen(false)}
            sx={{
              position: "absolute",
              right: 8,
              top: 8,
              color: "var(--text-primary)",
              zIndex: 1,
            }}
            aria-label="close"
          >
            <CloseIcon />
          </IconButton>
          <CommentsPanel
            onInviteReaders={() => {
              setIsCommentsDrawerOpen(false);
              setIsShareDialogOpen(true);
            }}
          />
        </Box>
      </Drawer>
    </div>
  );
};
