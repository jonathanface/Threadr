import {
  Box,
  Checkbox,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Select,
  SelectChangeEvent,
} from "@mui/material";
import styles from "./documentsettings.module.css";
import { ChangeEvent } from "react";
import { useDocumentSettings } from "../../../hooks/useDocumentSettings";
import {
  FONT_OPTIONS,
  FONT_SIZE_OPTIONS,
  LINE_SPACING_OPTIONS,
} from "../../../../../types/Document";

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

  const handleFontFamilyChange = (event: SelectChangeEvent<string>) => {
    if (documentSettings) {
      saveDocumentSettings({
        ...documentSettings,
        font_family: event.target.value,
      });
    }
  };

  const handleFontSizeChange = (event: SelectChangeEvent<number>) => {
    if (documentSettings) {
      saveDocumentSettings({
        ...documentSettings,
        font_size: Number(event.target.value),
      });
    }
  };

  const handleLineSpacingChange = (event: SelectChangeEvent<number>) => {
    if (documentSettings) {
      saveDocumentSettings({
        ...documentSettings,
        line_spacing: Number(event.target.value),
      });
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullWidth
      maxWidth="sm"
      PaperProps={{
        sx: {
          backgroundColor: 'var(--bg-primary)',
          color: 'var(--text-primary)',
        }
      }}
    >
      <DialogTitle sx={{ color: 'var(--text-primary)' }}>Document Settings</DialogTitle>
      <DialogContent sx={{ color: 'var(--text-primary)' }}>
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
                sx={{ color: 'var(--text-primary)' }}
              />
              <ListItemText
                primary="Spell Check"
                className={styles.label}
                sx={{ color: 'var(--text-primary)' }}
              />
            </ListItem>
            <ListItem key="tabs" className={styles.listItem}>
              <Checkbox
                edge="start"
                onChange={handleToggleAutotab}
                checked={documentSettings?.autotab}
                className={styles.checkbox}
                tabIndex={-1}
                disableRipple
                sx={{ color: 'var(--text-primary)' }}
              />
              <ListItemText
                primary="Auto-insert tab in new paragraphs"
                className={styles.label}
                sx={{ color: 'var(--text-primary)' }}
              />
            </ListItem>
            <ListItem key="font-family" className={styles.listItem}>
              <FormControl size="small" sx={{ minWidth: 220, mt: 1 }}>
                <InputLabel id="font-family-label" sx={{ color: 'var(--text-primary)' }}>
                  Font
                </InputLabel>
                <Select
                  labelId="font-family-label"
                  label="Font"
                  value={documentSettings?.font_family ?? "Arial"}
                  onChange={handleFontFamilyChange}
                  sx={{ color: 'var(--text-primary)' }}
                >
                  {FONT_OPTIONS.map((font) => (
                    <MenuItem key={font} value={font} sx={{ fontFamily: font }}>
                      {font}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </ListItem>
            <ListItem key="font-size" className={styles.listItem}>
              <FormControl size="small" sx={{ minWidth: 120, mt: 1 }}>
                <InputLabel id="font-size-label" sx={{ color: 'var(--text-primary)' }}>
                  Font size
                </InputLabel>
                <Select
                  labelId="font-size-label"
                  label="Font size"
                  value={documentSettings?.font_size ?? 16}
                  onChange={handleFontSizeChange}
                  sx={{ color: 'var(--text-primary)' }}
                >
                  {FONT_SIZE_OPTIONS.map((size) => (
                    <MenuItem key={size} value={size}>
                      {size}px
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </ListItem>
            <ListItem key="line-spacing" className={styles.listItem}>
              <FormControl size="small" sx={{ minWidth: 160, mt: 1 }}>
                <InputLabel id="line-spacing-label" sx={{ color: 'var(--text-primary)' }}>
                  Line spacing
                </InputLabel>
                <Select
                  labelId="line-spacing-label"
                  label="Line spacing"
                  value={documentSettings?.line_spacing ?? 2.0}
                  onChange={handleLineSpacingChange}
                  sx={{ color: 'var(--text-primary)' }}
                >
                  {LINE_SPACING_OPTIONS.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </ListItem>
          </List>
        </Box>
      </DialogContent>
    </Dialog>
  );
};
