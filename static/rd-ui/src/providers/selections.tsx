import { useEffect, useState } from "react";
import { SelectionsContext } from "../contexts/selections";
import { Chapter } from "../types/Chapter";
import { Series } from "../types/Series";
import { Story } from "../types/Story";

export const SelectionsProvider: React.FC<{
    children: React.ReactNode;
}> = ({ children }) => {

    useEffect(() => {
        console.log("SelectionsProvider mounted");
        return () => {
            console.log("SelectionsProvider unmounted");
        };
    }, []);

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

    const [associationID, setAssociationID] = useState<string | undefined>(
        undefined
    );

    const deselectAssociation = () => {
        setAssociationID(undefined);
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

                associationID,
                setAssociationID,
                deselectAssociation,

                deselectAll
            }}
        >
            {children}
        </SelectionsContext.Provider>
    );
};