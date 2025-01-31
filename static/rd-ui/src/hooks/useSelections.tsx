import { useContext } from "react";
import { SelectionsContext } from "../contexts/selections";


export const useSelections = () => {
    const context = useContext(SelectionsContext);
    if (!context) {
        throw new Error("useSelectionsContext must be used within a SelectionsProvider");
    }
    const { story, deselectStory, setStory, series, deselectSeries, setSeries, chapter, setChapter, deselectChapter, associationID, setAssociationID, deselectAssociation, deselectAll } = context;

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

        deselectAll
    }
};