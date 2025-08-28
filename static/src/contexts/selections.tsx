import { createContext } from "react";
import { Story } from "../types/Story";
import { Series } from "../types/Series";
import { Chapter } from "../types/Chapter";
import { SimplifiedAssociation } from "../types/Associations";


type SelectionsContextType = {
    story: Story | undefined;
    setStory: (story: Story | undefined) => void;
    deselectStory: () => void;

    series: Series | undefined;
    setSeries: (series: Series | undefined) => void;
    deselectSeries: () => void;

    association: SimplifiedAssociation | undefined;
    setAssociation: (assoc: SimplifiedAssociation) => void;
    deselectAssociation: () => void;

    chapter: Chapter | undefined;
    setChapter: (chapter: Chapter) => void;
    deselectChapter: () => void;

    deselectAll: () => void;
};

export const SelectionsContext = createContext<SelectionsContextType | undefined>(
    undefined
);
