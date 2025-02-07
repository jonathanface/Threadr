import { useEffect, useMemo, useState } from "react";
import { WorksListContext } from "../contexts/worksList";
import { Story } from "../types/Story";
import { Series } from "../types/Series";
import { useFetchUserData } from "../hooks/useFetchUserData";
import { useLoader } from "../hooks/useLoader";

export const WorksListProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [seriesList, setSeriesList] = useState<Series[] | null>(null);
    const [storiesList, setStoriesList] = useState<Story[] | null>(null);
    const { isLoggedIn } = useFetchUserData();
    const { showLoader, hideLoader } = useLoader();

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
                showLoader();
                const [series, stories] = await Promise.all([fetchSeries(), fetchStories()]);
                setSeriesList(series);
                setStoriesList(stories);
            } catch (error) {
                console.error("Error loading works list data:", error);
            } finally {
                hideLoader();
            }
        };
        if (isLoggedIn) {
            loadData();
        }
    }, [isLoggedIn, hideLoader, showLoader]);

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
