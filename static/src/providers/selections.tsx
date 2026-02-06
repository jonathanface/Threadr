import { useState } from "react";
import { SelectionsContext } from "../contexts/selections";
import { Chapter } from "../types/Chapter";
import { Series } from "../types/Series";
import { Story } from "../types/Story";
import { SimplifiedAssociation } from "../types/Associations";

export const SelectionsProvider: React.FC<{
    children: React.ReactNode;
}> = ({ children }) => {


    const [story, setStory] = useState<Story | undefined>(
        undefined
    );


    const deselectStory = () => {
        setStory(undefined);
    };

    const [series, setSeries] = useState<Series | undefined>(
        undefined
    );
    const deselectSeries = () => {
        setSeries(undefined);
    };

    const [chapter, setChapter] = useState<Chapter | undefined>(
        undefined
    );
    const deselectChapter = () => {
        setChapter(undefined);
    };

    const [association, setAssociation] = useState<SimplifiedAssociation | undefined>(
        undefined
    );

    const deselectAssociation = () => {
        setAssociation(undefined);
    }

    const deselectAll = () => {
        deselectAssociation();
        deselectChapter();
        deselectStory();
        deselectSeries();
    }

    return (
        <SelectionsContext.Provider
            value={{
                story,
                deselectStory,
                setStory,

                series,
                deselectSeries,
                setSeries,

                chapter,
                setChapter,
                deselectChapter,

                association,
                setAssociation,
                deselectAssociation,

                deselectAll
            }}
        >
            {children}
        </SelectionsContext.Provider>
    );
};