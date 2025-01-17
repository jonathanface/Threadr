import { useContext, useEffect } from "react";
import { WorksListContext } from "../contexts/worksList";
import { useLoader } from "./useLoader";
import { Series } from "../types/Series";
import { Story } from "../types/Story";
import { APIError } from "../types/API";

export const useWorksList = () => {
    const context = useContext(WorksListContext);
    if (!context) {
        throw new Error(
            "WorksListContext must be used within a WorksListContextProvider"
        );
    }
    const { seriesList, setSeriesList, storiesList, setStoriesList } = context
    const { setIsLoaderVisible } = useLoader();

    const fetchSeries = async () => {
        try {
            setIsLoaderVisible(true);
            const results = await fetch("/api/series", {
                credentials: "include",
            });
            if (!results.ok) {
                throw new Error(`Error fetching series: ${results.statusText}`);
            }
            const userSeries: Series[] = await results.json();
            return userSeries;
        } catch (error: unknown) {
            console.error("Failed to fetch series data:", error);
            const apiError = error as APIError;
            if (apiError.statusCode !== 404) {
                console.error(apiError);
            }
            return [];
        } finally {
            setIsLoaderVisible(false);
        }
    }

    const fetchStories = async (): Promise<Story[]> => {
        try {
            setIsLoaderVisible(true);
            const results = await fetch("/api/stories", {
                credentials: "include",
            });
            if (!results.ok) {
                throw new Error(`Error fetching stories: ${results.statusText}`);
            }
            const userStories: Story[] = await results.json();
            return userStories;
        } catch (error: unknown) {
            console.error("Failed to fetch story data:", error);
            const apiError = error as APIError;
            if (apiError.statusCode !== 404) {
                console.error(apiError);
            }
            return [];
        } finally {
            setIsLoaderVisible(false);
        }
    };

    const loadSeries = async () => {
        if (seriesList === null) {
            const series = await fetchSeries();
            setSeriesList(series);
        }
    }

    const loadStories = async () => {
        if (storiesList === null) {
            const stories = await fetchStories();
            setStoriesList(stories);
        }
    };

    useEffect(() => {
        let isMounted = true; // Flag to avoid updates after unmount

        if (isMounted) {
            loadStories();
            loadSeries();
        }

        return () => {
            isMounted = false; // Cleanup flag
        };
        //eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { seriesList, storiesList, setSeriesList, setStoriesList }
}
