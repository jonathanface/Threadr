import {
  Box,
  Checkbox,
  Dialog,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemText,
} from "@mui/material";
import styles from "./documentsettings.module.css";
import { ChangeEvent } from "react";
import { useDocumentSettings } from "../../../../../hooks/useDocumentSettings";

interface DocumentSettingsProps {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export const DocumentSettingsModal = ({
  open,
  setOpen,
}: DocumentSettingsProps) => {
  const { documentSettings, saveDocumentSettings } = useDocumentSettings();

  const handleClose = () => {
    setOpen(false);
  };

  const handleToggleSpellcheck = (event: ChangeEvent<HTMLInputElement>) => {
    if (documentSettings) {
      const newSettings = { ...documentSettings };
      newSettings.spellcheck = event.target.checked;
      saveDocumentSettings(newSettings);
    }
  };

  const handleToggleAutotab = (event: ChangeEvent<HTMLInputElement>) => {
    if (documentSettings) {
      const newSettings = { ...documentSettings };
      newSettings.autotab = event.target.checked;
      saveDocumentSettings(newSettings);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>Document Settings</DialogTitle>
      <DialogContent>
        <Box className={styles.chapterAssignment} sx={{ padding: "6px" }}>
          <List dense={true} className={styles.chapterList}>
            <ListItem key="spellcheck" className={styles.listItem}>
              <Checkbox
                edge="start"
                onChange={handleToggleSpellcheck}
                checked={documentSettings?.spellcheck}
                className={styles.checkbox}
                tabIndex={-1}
                disableRipple
              />
              <ListItemText primary="Spell Check" className={styles.label} />
            </ListItem>
            <ListItem key="tabs" className={styles.listItem}>
              <Checkbox
                edge="start"
                onChange={handleToggleAutotab}
                checked={documentSettings?.autotab}
                className={styles.checkbox}
                tabIndex={-1}
                disableRipple
              />
              <ListItemText
                primary="Auto-insert tab in new paragraphs"
                className={styles.label}
              />
            </ListItem>
          </List>
        </Box>
      </DialogContent>
    </Dialog>
  );
};
