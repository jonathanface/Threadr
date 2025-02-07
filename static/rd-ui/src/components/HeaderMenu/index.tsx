
import { useLoader } from "../../hooks/useLoader";
import { useSelections } from "../../hooks/useSelections";
import { useToaster } from "../../hooks/useToaster";
import { AlertToastType } from "../../types/AlertToasts";
import { Story } from "../../types/Story";
import { UserMenu } from "..//UserMenu"
import { EditableText } from "../EditableText";

import styles from "./headermenu.module.css";

export const HeaderMenu = () => {

  const { story, series, setStory, setSeries, propagateStoryUpdates, propagateSeriesUpdates } = useSelections();
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
          formData.append(key, value !== undefined && value !== null ? String(value) : "");
        });

        try {
          showLoader();
          const response = await fetch("/api/stories/" + updatedStory.story_id + "/details", {
            method: "PUT",
            body: formData,
          });
          if (!response.ok) {
            console.error(response.statusText);
            throw new Error('There was an error updating your story title. Please report this.')
          }
          setStory(updatedStory);
          propagateStoryUpdates(updatedStory);
        } catch (error) {
          setAlertState({
            title: "Error",
            message: (error as Error).message,
            severity: AlertToastType.error,
            open: true,
            timeout: 6000,
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
          formData.append(key, value !== undefined && value !== null ? String(value) : "");
        });
        try {
          showLoader();
          const response = await fetch("/api/series/" + updatedSeries.series_id, {
            method: "PUT",
            body: formData,
          });
          if (!response.ok) {
            console.error(response.statusText);
            throw new Error('There was an error updating your series title. Please report this.')
          }
          setSeries(updatedSeries);
          propagateSeriesUpdates(updatedSeries)
        } catch (error) {
          setAlertState({
            title: "Error",
            message: (error as Error).message,
            severity: AlertToastType.error,
            open: true,
            timeout: 6000,
          });
        } finally {
          hideLoader();
        }
      }
    }
  };

  return (
    <header className={styles.header}>
      <span className={styles.leftPane}>
        <img className={styles.logoImage}
          alt="RichDocter logo"
          title="RichDocter - Organized Imagination"
          src="/img/logo_trans_scaled.png"
        />
        <span className={styles.storyInfo}>
          <EditableText textValue={story?.title ? story.title : ""} onTextChange={onStoryTitleEdit} />
          <div className={styles.seriesInfo}>
            <EditableText textValue={series?.series_title ? series.series_title : ""} onTextChange={onSeriesTitleEdit} />
          </div>
        </span>
      </span>
      <UserMenu />
    </header >
  )
}
