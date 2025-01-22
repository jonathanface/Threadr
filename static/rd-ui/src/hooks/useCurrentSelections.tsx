import { useContext } from "react";
import { CurrentSelectionsContext } from "../contexts/selections";


export const useCurrentSelections = () => {
    const context = useContext(CurrentSelectionsContext);
    if (!context) {
        throw new Error("useCurrentSelectionsContext must be used within a CurrentSelectionsProvider");
    }
    const { currentStoryAction, currentStory, deselectStory, setCurrentStoryAction, setCurrentStory, currentSeriesAction, currentSeries, deselectSeries, setCurrentSeries, setCurrentSeriesAction, currentChapter, setCurrentChapter, deselectChapter, currentAssociationID, setCurrentAssociationID, deselectAssociation } = context;
    if (!context) {
        throw new Error(
            "useCurrentSelectionsContext must be used within a StoryProvider"
        );
    }

    return {
        currentStoryAction,
        currentStory,
        deselectStory,
        setCurrentStoryAction,
        setCurrentStory,

        currentSeriesAction,
        currentSeries,
        deselectSeries,
        setCurrentSeries,
        setCurrentSeriesAction,

        currentChapter,
        setCurrentChapter,
        deselectChapter,

        currentAssociationID,
        setCurrentAssociationID,
        deselectAssociation
    }
};