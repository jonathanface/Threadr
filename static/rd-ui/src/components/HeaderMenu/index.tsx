
import { useLoader } from "../../hooks/useLoader";
import { useSelections } from "../../hooks/useSelections";
import { useToaster } from "../../hooks/useToaster";
import { useWorksList } from "../../hooks/useWorksList";
import { AlertToastType } from "../../types/AlertToasts";
import { Story } from "../../types/Story";
import { UserMenu } from "..//UserMenu"
import { EditableText } from "../EditableText";

import styles from "./headermenu.module.css";

export const HeaderMenu = () => {

  const { story, series, setStory, setSeries } = useSelections();
  const { storiesList, seriesList, setStoriesList, setSeriesList } = useWorksList();
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
          if (storiesList) {
            const storyListIDX = storiesList.findIndex(listItem => listItem.story_id === story.story_id);
            if (storyListIDX !== -1) {
              const newList = [...storiesList];
              newList[storyListIDX] = updatedStory;
              setStoriesList(newList);
            }
          }
          if (series) {
            const idx = series.stories.findIndex(listItem => listItem.story_id === story.story_id);
            if (idx !== -1) {
              const newStoriesList = { ...series.stories };
              newStoriesList[idx] = updatedStory;
              const newSeries = { ...series };
              newSeries.stories = newStoriesList;
              setSeries(newSeries);
            }
            if (seriesList) {
              const seriesListIDX = seriesList.findIndex(listItem => listItem.series_id === series.series_id);
              if (seriesListIDX !== -1) {
                const newList = [...seriesList];
                const listSeriesEntry = newList[seriesListIDX];
                const listSeriesEntriesIDX = listSeriesEntry.stories.findIndex(listItem => listItem.story_id === updatedStory.story_id);
                if (listSeriesEntriesIDX !== -1) {
                  newList[seriesListIDX].stories[listSeriesEntriesIDX] = updatedStory;
                  setSeriesList(newList)
                }
              }
            }
          }
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
          if (seriesList) {
            const seriesListIDX = seriesList.findIndex(listItem => listItem.series_id === updatedSeries.series_id);
            if (seriesListIDX !== -1) {
              const newList = [...seriesList];
              newList[seriesListIDX] = updatedSeries;
              setSeriesList(newList);
            }
          }
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
