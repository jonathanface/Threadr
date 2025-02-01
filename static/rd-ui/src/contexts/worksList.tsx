import { createContext, useEffect, useMemo, useState } from "react";
import { Series } from "../types/Series";
import { Story } from "../types/Story";

type WorksList = {
    seriesList: Series[] | null;
    storiesList: Story[] | null;
    setSeriesList: (list: Series[] | null) => void;
    setStoriesList: (list: Story[] | null) => void;
};

export const WorksListContext = createContext<WorksList | undefined>(undefined);

export const WorksListProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [seriesList, setSeriesList] = useState<Series[] | null>(null);
    const [storiesList, setStoriesList] = useState<Story[] | null>(null);

    // Fetch function for series and stories
    const fetchSeries = async (): Promise<Series[]> => {
        const response = await fetch("/api/series", { credentials: "include" });
        if (!response.ok) {
            throw new Error(`Error fetching series: ${response.statusText}`);
        }
        return response.json();
    };

    const fetchStories = async (): Promise<Story[]> => {
        const response = await fetch("/api/stories", { credentials: "include" });
        if (!response.ok) {
            throw new Error(`Error fetching stories: ${response.statusText}`);
        }
        return response.json();
    };

    useEffect(() => {
        // Fetch both series and stories when the provider mounts.
        const loadData = async () => {
            try {
                const [series, stories] = await Promise.all([fetchSeries(), fetchStories()]);
                setSeriesList(series);
                setStoriesList(stories);
            } catch (error) {
                console.error("Error loading works list data:", error);
            }
        };

        loadData();
    }, []);

    // Log mounting for debugging
    useEffect(() => {
        console.log("WorksListProvider mounted");
        return () => {
            console.log("WorksListProvider unmounted");
        };
    }, []);

    const value = useMemo(
        () => ({
            seriesList,
            setSeriesList,
            storiesList,
            setStoriesList,
        }),
        [seriesList, storiesList]
    );

    return <WorksListContext.Provider value={value}>{children}</WorksListContext.Provider>;
};
