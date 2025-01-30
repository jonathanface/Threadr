import { createContext, useEffect, useMemo, useState } from "react"
import { Series } from "../types/Series"
import { Story } from "../types/Story"

type WorksList = {
    seriesList: Series[] | null
    storiesList: Story[] | null

    setSeriesList: (list: Series[] | null) => void;
    setStoriesList: (list: Story[] | null) => void;
}

export const WorksListContext = createContext<WorksList | undefined>(
    undefined
);

export const WorksListProvider: React.FC<{
    children: React.ReactNode;
}> = ({ children }) => {

    useEffect(() => {
        console.log("WorksListProvider mounted");
        return () => {
            console.log("WorksListProvider unmounted");
        };
    }, []);

    const [seriesList, setSeriesList] = useState<Series[] | null>(null);
    const [storiesList, setStoriesList] = useState<Story[] | null>(null);

    const value = useMemo(
        () => ({
            seriesList,
            setSeriesList,
            storiesList,
            setStoriesList,
        }),
        [seriesList, storiesList]
    );

    return (
        <WorksListContext.Provider value={value}>
            {children}
        </WorksListContext.Provider>
    );
};
