import { useLoader } from "./useLoader";
import { Series } from "../types/Series";
import { APIError } from "../types/API";
import { useEffect, useState } from "react";

export const useFetchSeriesList = () => {
  const { setIsLoaderVisible } = useLoader();
  const [seriesList, setSeriesList] = useState<Series[] | undefined>(undefined);

  useEffect(() => {
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
        const apiError = error as APIError;
        if (apiError.statusCode !== 404) {
          console.error("Failed to fetch user data:", error);
        } else {
          setSeriesList([]);
        }
      } finally {
        setIsLoaderVisible(false);
      }
    };

    fetchSeriesList();
  }, [setIsLoaderVisible]);

  return {
    seriesList, setSeriesList
  };
};
