import axios from "axios";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import CheckIcon from "@mui/icons-material/Check";
import HistoryEduIcon from "@mui/icons-material/HistoryEdu";
import {
  Chip,
  CircularProgress,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
} from "@mui/material";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useFetchUserData } from "../../hooks/useFetchUserData";
import { useLoader } from "../../hooks/useLoader";
import { useSelections } from "../../hooks/useSelections";
import { useToaster } from "../../hooks/useToaster";
import { AlertToastType } from "../../types/AlertToasts";
import { Story } from "../../types/Story";
import { UserMenu } from "..//UserMenu";
import { EditableText } from "../EditableText";
import { ThemeToggle } from "../ThemeToggle";

import { api } from "../../api";
import { NotificationsBell } from "../NotificationsBell";
import styles from "./headermenu.module.css";

export const HeaderMenu = () => {
  const location = useLocation();
  const isSharedReader = location.pathname.startsWith("/shared/");
  const { isLoggedIn } = useFetchUserData();

  const {
    story,
    series,
    setStory,
    setSeries,
    propagateStoryUpdates,
    propagateSeriesUpdates,
  } = useSelections();
  const { setAlertState } = useToaster();
  const { showLoader, hideLoader } = useLoader();
  const navigate = useNavigate();

  // Draft switcher state. The chip in the title row is clickable when the
  // loaded story is part of an ancestry — opens an anchored menu that
  // lists siblings so the writer can jump between drafts without going
  // through the DocumentMenu's sidebar DraftsDialog.
  const [draftsAnchorEl, setDraftsAnchorEl] = useState<HTMLElement | null>(null);
  const [draftsList, setDraftsList] = useState<Story[] | null>(null);
  const [draftsLoading, setDraftsLoading] = useState(false);

  const openDraftsMenu = async (e: React.MouseEvent<HTMLElement>) => {
    if (!story?.story_id) return;
    setDraftsAnchorEl(e.currentTarget);
    if (draftsList !== null) return;
    setDraftsLoading(true);
    try {
      const res = await api.get<Story[]>(`/stories/${story.story_id}/drafts`);
      setDraftsList(res.data || []);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        console.error(
          `Error loading drafts: ${err.response?.status} ${err.message}`,
        );
      }
      setDraftsList([]);
    } finally {
      setDraftsLoading(false);
    }
  };

  const closeDraftsMenu = () => setDraftsAnchorEl(null);

  // Switch to another draft of the same ancestry. Preserves chapter
  // position by mapping the current chapter's index in this story to
  // the chapter at the same index of the destination (clones are
  // place-preserving). Falls back to the base URL if the mapping
  // can't be resolved.
  const switchToDraft = async (id: string) => {
    closeDraftsMenu();
    if (!story?.story_id || id === story.story_id) return;
    const params = new URLSearchParams(window.location.search);
    const currentChapterID = params.get("chapter");
    let destination = `/stories/${id}`;
    if (currentChapterID && story.chapters) {
      const idx = story.chapters.findIndex((c) => c.id === currentChapterID);
      if (idx >= 0) {
        try {
          const res = await api.get<Story>(`/stories/${id}`);
          if (res.data?.chapters && res.data.chapters[idx]) {
            destination += `?chapter=${res.data.chapters[idx].id}`;
          }
        } catch {
          // Fall through — the editor will pick a default chapter.
        }
      }
    }
    navigate(destination);
  };

  const onStoryTitleEdit = async (event: React.SyntheticEvent) => {
    if (story) {
      const target = event.target as HTMLInputElement;
      if (target.value !== story.title && target.value.trim() !== "") {
        const updatedStory: Story = { ...story };
        updatedStory.title = target.value;
        const formData = new FormData();
        Object.keys(updatedStory).forEach((key) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const value = (updatedStory as any)[key];
          formData.append(
            key,
            value !== undefined && value !== null ? String(value) : "",
          );
        });

        try {
          showLoader();

          await api.put(`/stories/${updatedStory.story_id}/details`, formData, {
            headers: { "Content-Type": "multipart/form-data" },
          });

          setStory(updatedStory);
          propagateStoryUpdates(updatedStory);
        } catch (error) {
          const message =
            (axios.isAxiosError(error) &&
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (error.response?.data as any)?.message) ||
            (error as Error).message ||
            "There was an error updating your story title. Please report this.";

          setAlertState({
            title: "Error",
            message,
            severity: AlertToastType.error,
            open: true,
          });
        } finally {
          hideLoader();
        }
      }
    }
  };

  const onSeriesTitleEdit = async (event: React.SyntheticEvent) => {
    if (series) {
      const target = event.target as HTMLInputElement;
      if (target.value !== series.series_title && target.value.trim() !== "") {
        const updatedSeries = { ...series };
        updatedSeries.series_title = target.value;

        const formData = new FormData();
        Object.keys(updatedSeries).forEach((key) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const value = (updatedSeries as Record<string, any>)[key];
          // If the value is an object or an array, JSON.stringify it
          if (typeof value === "object" && value !== null) {
            formData.append(key, JSON.stringify(value));
          } else if (value !== undefined && value !== null) {
            formData.append(key, String(value));
          } else {
            formData.append(key, "");
          }
          formData.append(
            key,
            value !== undefined && value !== null ? String(value) : "",
          );
        });
        try {
          showLoader();

          await api.put(`/series/${updatedSeries.series_id}`, formData, {
            headers: { "Content-Type": "multipart/form-data" },
          });

          setSeries(updatedSeries);
          propagateSeriesUpdates(updatedSeries);
        } catch (error) {
          const message =
            (axios.isAxiosError(error) &&
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (error.response?.data as any)?.message) ||
            (error as Error).message ||
            "There was an error updating your series title. Please report this.";

          setAlertState({
            title: "Error",
            message,
            severity: AlertToastType.error,
            open: true,
          });
        } finally {
          hideLoader();
        }
      }
    }
  };

  const baseUrl = `${window.location.protocol}//${window.location.host}`;

  return (
    <header className={styles.header}>
      <span className={styles.leftPane}>
        <a href={baseUrl} className={styles.logoLink}>
          <Tooltip
            title="Your Characters Remember Everything"
            placement="top"
            TransitionProps={{ timeout: 0 }}
            slotProps={{
              popper: {
                modifiers: [{ name: "offset", options: { offset: [0, -20] } }],
              },
              tooltip: {
                sx: {
                  bgcolor: "#292524",
                  opacity: "1 !important",
                  '[data-theme="light"] &': { bgcolor: "#ffffff" },
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-light)",
                  fontSize: "0.75rem",
                },
              },
            }}
          >
            <img
              className={styles.logoImage}
              alt="Threadr logo"
              src="/img/threadr-logo-contrast.png"
            />
          </Tooltip>
          <span className={styles.logoText}>threadr</span>
        </a>
        {!isSharedReader && (
          <span className={styles.storyInfo}>
            <img alt={story?.title} src={story?.image_url} />
            <div className={styles.storyData}>
              <span className={styles.titleRow}>
                <EditableText
                  textValue={story?.title ? story.title : ""}
                  onTextChange={onStoryTitleEdit}
                />
                {(story?.draft_name ||
                  story?.original_story_id ||
                  story?.is_current_draft !== undefined) && (
                  <>
                    <Tooltip title="Switch drafts">
                      <Chip
                        aria-label="Switch drafts"
                        aria-haspopup="menu"
                        aria-expanded={Boolean(draftsAnchorEl)}
                        onClick={openDraftsMenu}
                        clickable
                        icon={<HistoryEduIcon />}
                        deleteIcon={<ArrowDropDownIcon />}
                        onDelete={openDraftsMenu}
                        label={
                          <span className={styles.draftChipLabel}>
                            <span className={styles.draftChipName}>
                              {story?.draft_name && story.draft_name.trim().length > 0
                                ? story.draft_name
                                : story?.original_story_id
                                  ? "Untitled draft"
                                  : "Original"}
                            </span>
                            {story?.is_current_draft && (
                              <span className={styles.draftChipLatest}>current</span>
                            )}
                          </span>
                        }
                        color="primary"
                        sx={{
                          ml: 1,
                          height: "auto",
                          py: 0.25,
                          alignItems: "center",
                          "& .MuiChip-label": {
                            px: 0.75,
                            display: "flex",
                            alignItems: "center",
                          },
                          "& .MuiChip-icon": { my: "auto", ml: 0.75, mr: -0.25 },
                          "& .MuiChip-deleteIcon": { my: "auto", ml: -0.25, mr: 0.5 },
                        }}
                      />
                    </Tooltip>
                    <Menu
                      anchorEl={draftsAnchorEl}
                      open={Boolean(draftsAnchorEl)}
                      onClose={closeDraftsMenu}
                      slotProps={{
                        paper: { sx: { minWidth: 200, maxWidth: 320 } },
                      }}
                    >
                      {draftsLoading && (
                        <MenuItem disabled>
                          <ListItemIcon>
                            <CircularProgress size={16} />
                          </ListItemIcon>
                          <ListItemText primary="Loading drafts…" />
                        </MenuItem>
                      )}
                      {!draftsLoading &&
                        draftsList &&
                        draftsList.length > 0 &&
                        draftsList.map((d) => {
                          const isActive = d.story_id === story?.story_id;
                          const isCurrent = d.is_current_draft ?? false;
                          const label =
                            d.draft_name && d.draft_name.trim().length > 0
                              ? d.draft_name
                              : d.original_story_id
                                ? "Untitled draft"
                                : "Original";
                          return (
                            <MenuItem
                              key={d.story_id}
                              selected={isActive}
                              onClick={() => switchToDraft(d.story_id)}
                            >
                              <ListItemIcon>
                                {isActive ? (
                                  <CheckIcon fontSize="small" />
                                ) : (
                                  <span style={{ width: 20 }} />
                                )}
                              </ListItemIcon>
                              <ListItemText
                                primary={label}
                                secondary={isCurrent ? "current" : undefined}
                              />
                            </MenuItem>
                          );
                        })}
                      {!draftsLoading &&
                        draftsList &&
                        draftsList.length === 0 && (
                          <MenuItem disabled>
                            <ListItemText primary="No other drafts" />
                          </MenuItem>
                        )}
                    </Menu>
                  </>
                )}
              </span>
              <div className={styles.seriesInfo}>
                <EditableText
                  textValue={series?.series_title ? series.series_title : ""}
                  onTextChange={onSeriesTitleEdit}
                />
              </div>
            </div>
          </span>
        )}
      </span>
      <span className={styles.rightPane}>
        <ThemeToggle />
        {!isSharedReader && isLoggedIn && <NotificationsBell />}
        {!isSharedReader && <UserMenu />}
      </span>
    </header>
  );
};
