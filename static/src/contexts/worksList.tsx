import { createContext } from "react";
import { Series } from "../types/Series";
import { Story } from "../types/Story";

type WorksListContextType = {
    seriesList: Series[] | null;
    storiesList: Story[] | null;
    setSeriesList: (list: Series[] | null) => void;
    setStoriesList: (list: Story[] | null) => void;
};

export const WorksListContext = createContext<WorksListContextType | undefined>(undefined);
