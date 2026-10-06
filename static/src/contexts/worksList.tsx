import { createContext } from "react";
import { Series } from "../types/Series";
import { Story } from "../types/Story";

type WorksListContextType = {
    seriesList: Series[] | null;
    storiesList: Story[] | null;
    setSeriesList: (list: Series[] | null) => void;
    setStoriesList: (list: Story[] | null) => void;
    // Trigger a background re-fetch of both /series and /stories.
    // Callers should invoke this after any action that could change
    // which rows the stories-list filter admits (a draft being
    // promoted, created, or deleted) so the /stories page shows
    // fresh data the next time the user navigates there.
    refresh: () => Promise<void>;
};

export const WorksListContext = createContext<WorksListContextType | undefined>(undefined);
