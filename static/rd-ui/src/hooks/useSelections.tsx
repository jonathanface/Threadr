import { useContext } from "react";
import { SelectionsContext } from "../contexts/selections";
import { Chapter } from "../types/Chapter";
import { useWorksList } from "./useWorksList";
import { Story } from "../types/Story";
import { Series } from "../types/Series";


export const useSelections = () => {
    const context = useContext(SelectionsContext);
    const { storiesList, setStoriesList, seriesList, setSeriesList } = useWorksList();

    if (!context) {
        throw new Error("useSelectionsContext must be used within a SelectionsProvider");
    }
    const { story, deselectStory, setStory, series, deselectSeries, setSeries, chapter, setChapter, deselectChapter, associationID, setAssociationID, deselectAssociation, deselectAll } = context;

    const propagateChapterUpdates = (updatedChapter: Chapter) => {
        if (story) {
            const idx = story.chapters.findIndex(chap => chap.id === updatedChapter.id);
            if (idx !== -1) {
                const newStory = { ...story };
                const newChapters = [...newStory.chapters];
                newChapters[idx] = updatedChapter;
                newStory.chapters = newChapters;
                setStory(newStory);
                propagateStoryUpdates(newStory);
            }
        }
    }

    const propagateSeriesUpdates = (updatedSeries: Series, updatedStory?: Story) => {
        if (seriesList) {
            const newList = [...seriesList];
            const seriesListIDX = seriesList.findIndex(listItem => listItem.series_id === updatedSeries.series_id);
            if (seriesListIDX !== -1) {
                if (updatedStory) {
                    const listSeriesEntry = newList[seriesListIDX];
                    const newStories = [...listSeriesEntry.stories];
                    const listSeriesEntriesIDX = newStories.findIndex(listItem => listItem.story_id === updatedStory.story_id);
                    if (listSeriesEntriesIDX !== -1) {
                        newStories[listSeriesEntriesIDX] = updatedStory;
                        listSeriesEntry.stories = newStories;
                    }
                    newList[seriesListIDX] = { ...listSeriesEntry }
                }
                newList[seriesListIDX] = updatedSeries;
                setSeriesList(newList);
            }
        }
    }

    const propagateStoryUpdates = (updatedStory: Story) => {
        if (storiesList) {
            const storiesListIDX = storiesList.findIndex(listItem => listItem.story_id === updatedStory.story_id);
            if (storiesListIDX !== -1) {
                const newStoriesList = [...storiesList];
                newStoriesList[storiesListIDX] = updatedStory;
                setStoriesList(newStoriesList);
            }
        }

        if (series) {
            const seriesIDX = series.stories.findIndex(listItem => listItem.story_id === updatedStory.story_id);
            if (seriesIDX !== -1) {
                const newStoriesList = [...series.stories];
                newStoriesList[seriesIDX] = updatedStory;
                const newSeries = { ...series };
                newSeries.stories = newStoriesList;
                setSeries(newSeries);
                propagateSeriesUpdates(newSeries, updatedStory);
            }
        }
    }

    return {
        story,
        deselectStory,
        setStory,

        series,
        deselectSeries,
        setSeries,

        chapter,
        setChapter,
        deselectChapter,

        associationID,
        setAssociationID,
        deselectAssociation,

        deselectAll,
        propagateChapterUpdates,
        propagateStoryUpdates,
        propagateSeriesUpdates
    }
};