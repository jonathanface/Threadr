import { useLoader } from "./useLoader";
import { Series } from "../types/Series";
import { APIError } from "../types/API";
import { useContext, useEffect, useRef } from "react";
import { WorksListContext } from "../contexts/worksList";

export const useFetchSeriesList = () => {
  const context = useContext(WorksListContext);
  if (!context) {
    throw new Error(
      "WorksListContext must be used within a WorksListContextProvider"
    );
  }
  const { seriesList, setSeriesList } = context
  const { setIsLoaderVisible } = useLoader();
  const loadInProgress = useRef(false);

  useEffect(() => {
    if (seriesList === undefined && !loadInProgress.current) {
      loadInProgress.current = true;
      setIsLoaderVisible(true);
      const fetchSeriesList = async () => {
        try {
          const results = await fetch("/api/series", {
            credentials: "include",
          });
          if (!results.ok) {
            throw new Error(`Error fetching series: ${results.statusText}`);
          }
          const userSeries: Series[] = await results.json();
          setSeriesList(userSeries);
        } catch (error: unknown) {
          console.error("Failed to fetch series data:", error);
          const apiError = error as APIError;
          if (apiError.statusCode !== 404) {
            console.error(apiError);
          } else {
            setSeriesList([]);
          }
        } finally {
          setIsLoaderVisible(false);
          loadInProgress.current = false;
        }
      };
      fetchSeriesList();
    }
  }, [seriesList, setIsLoaderVisible, setSeriesList]);

  return {
    seriesList, setSeriesList
  };
};
