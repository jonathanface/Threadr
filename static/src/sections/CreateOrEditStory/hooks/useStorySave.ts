import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { api } from "../../../api";
import { useLoader } from "../../../hooks/useLoader";
import { useToaster } from "../../../hooks/useToaster";
import { useWorksList } from "../../../hooks/useWorksList";
import { useSelections } from "../../../hooks/useSelections";
import { AlertToastType } from "../../../types/AlertToasts";
import { Story } from "../../../types/Story";
import { Series } from "../../../types/Series";
import { buildStoryFormData } from "../utils/formDataBuilder";
import { usePostHog } from "@posthog/react";

interface AvailableSeries {
  series_id?: string;
  series_name: string;
}

interface SaveStoryParams {
  storyID?: string;
  title: string;
  description: string;
  imageFile?: File;
  importFile?: File;
  skipFirstPage?: boolean;
  selectedSeries: AvailableSeries | null;
  initialSeriesID?: string;
}

export const useStorySave = () => {
  const posthog = usePostHog();
  const { showLoader, hideLoader } = useLoader();
  const { setAlertState } = useToaster();
  const { seriesList, setSeriesList, storiesList, setStoriesList } = useWorksList();
  const { propagateSeriesUpdates, propagateStoryUpdates } = useSelections();
  const navigate = useNavigate();

  const updateStoriesAndSeriesLists = useCallback(
    (updatedStory: Story, seriesName?: string) => {
      if (updatedStory.series_id) {
        const newSeries: Series = {
          series_id: updatedStory.series_id,
          series_title: seriesName || "New Series",
          series_description: "",
          stories: [updatedStory],
          image_url: "/img/icons/story_series_icon.jpg",
        };

        if (seriesList) {
          const foundSeriesIndex = seriesList.findIndex(
            (srs) => srs.series_id === updatedStory.series_id
          );
          if (foundSeriesIndex !== -1) {
            const updatedSeries = { ...seriesList[foundSeriesIndex] };
            updatedSeries.stories = [...(updatedSeries.stories || []), updatedStory];
            propagateSeriesUpdates(updatedSeries, updatedStory);
          } else {
            setSeriesList([...seriesList, newSeries]);
          }
        } else {
          setSeriesList([newSeries]);
        }

        if (storiesList) {
          propagateStoryUpdates(updatedStory);
          const updatedStoriesList = storiesList.filter(
            (story) => story.story_id !== updatedStory.story_id
          );
          setStoriesList(updatedStoriesList);
        }
      } else if (storiesList) {
        const existingIndex = storiesList.findIndex(
          (s) => s.story_id === updatedStory.story_id
        );
        if (existingIndex !== -1) {
          // Update existing story
          const updated = [...storiesList];
          updated[existingIndex] = updatedStory;
          setStoriesList(updated);
        } else {
          // Add new story
          setStoriesList([...storiesList, updatedStory]);
        }
      } else {
        setStoriesList([updatedStory]);
      }
    },
    [seriesList, storiesList, setSeriesList, setStoriesList, propagateSeriesUpdates, propagateStoryUpdates]
  );

  const saveStory = useCallback(
    async (params: SaveStoryParams): Promise<void> => {
      const { storyID, title, description, imageFile, importFile, skipFirstPage, selectedSeries, initialSeriesID } = params;
      const isEdit = Boolean(storyID);

      try {
        showLoader();

        const formData: Record<string, string | File | number | undefined> = {
          title: title.trim(),
          description: description.trim(),
          image: imageFile,
        };

        if (isEdit) {
          formData.story_id = storyID;
        }

        // Handle series assignment
        if (selectedSeries) {
          if (selectedSeries.series_id) {
            // Assigning to existing series
            const foundSeries = seriesList?.find(
              (srs) => srs.series_id === selectedSeries.series_id
            );
            if (foundSeries) {
              formData.series_id = foundSeries.series_id;
              formData.series_name = foundSeries.series_title.trim();
              // Only set series_place for new additions (not when keeping same series)
              if (!isEdit || selectedSeries.series_id !== initialSeriesID) {
                formData.series_place = foundSeries.stories?.length || 1;
              }
            }
          } else if (selectedSeries.series_name) {
            // Creating new series
            const foundSeries = seriesList?.find(
              (srs) => srs.series_title === selectedSeries.series_name
            );
            if (foundSeries) {
              formData.series_id = foundSeries.series_id;
              formData.series_place = foundSeries.stories?.length || 1;
            } else {
              formData.series_title = selectedSeries.series_name.trim();
              formData.series_place = 1;
            }
          }
        }

        const endpoint = isEdit ? `/stories/${storyID}/details` : `/stories`;
        const method = isEdit ? "put" : "post";

        const { data: savedStory } = await api[method]<Story>(
          endpoint,
          buildStoryFormData(formData),
          {
            withCredentials: true,
            headers: { "Content-Type": "multipart/form-data" },
          }
        );

        // Import document if a file was provided (only on create)
        if (importFile && !isEdit && savedStory.story_id) {
          try {
            const importFormData = new FormData();
            importFormData.append("file", importFile);
            if (skipFirstPage) {
              importFormData.append("skip_first_page", "true");
            }

            await api.post(
              `/stories/${savedStory.story_id}/import`,
              importFormData,
              {
                withCredentials: true,
                headers: { "Content-Type": "multipart/form-data" },
              }
            );
            posthog?.capture("document_imported", { story_id: savedStory.story_id });
          } catch (importError) {
            if (axios.isAxiosError(importError)) {
              console.error("Document import failed:", importError.response?.data);
            }
            setAlertState({
              title: "Story created, but document import failed",
              message: "Your story was created. You can try importing the document again later.",
              severity: AlertToastType.warning,
              open: true,
            });
            navigate(`/stories/${savedStory.story_id}`);
            return;
          }
        }

        updateStoriesAndSeriesLists(
          savedStory,
          (formData.series_name || formData.series_title) as string | undefined
        );

        if (isEdit) {
          posthog?.capture("story_updated", { story_id: savedStory.story_id, title: savedStory.title, has_series: Boolean(savedStory.series_id) });
        } else {
          posthog?.capture("story_created", { story_id: savedStory.story_id, title: savedStory.title, has_series: Boolean(savedStory.series_id), has_import: Boolean(importFile) });
        }

        setAlertState({
          title: isEdit
            ? "Story updated successfully"
            : importFile
              ? "Story created and document imported"
              : "Story created successfully",
          message: "",
          severity: AlertToastType.success,
          open: true,
        });

        navigate(isEdit ? `/stories/` : `/stories/${savedStory.story_id}`);
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          const statusText = error.response?.statusText || error.message;
          const payload =
            typeof error.response?.data === "string"
              ? error.response?.data
              : JSON.stringify(error.response?.data || {});
          console.error(`Save story failed: ${status} ${statusText} ${payload}`);
        } else {
          console.error(error);
        }

        setAlertState({
          title: isEdit ? "Error updating story" : "Error creating story",
          severity: AlertToastType.error,
          message: "Please try again later or contact support.",
          open: true,
        });
      } finally {
        hideLoader();
      }
    },
    [
      posthog,
      showLoader,
      hideLoader,
      setAlertState,
      navigate,
      seriesList,
      updateStoriesAndSeriesLists,
    ]
  );

  return { saveStory };
};
