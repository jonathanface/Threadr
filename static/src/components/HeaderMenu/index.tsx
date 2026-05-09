import axios from "axios";
import { Tooltip } from "@mui/material";
import { useLocation } from "react-router-dom";
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
              <EditableText
                textValue={story?.title ? story.title : ""}
                onTextChange={onStoryTitleEdit}
              />
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
