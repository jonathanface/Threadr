import { useLoader } from "./useLoader";
import { APIError } from "../types/API";
import { useEffect, useState } from "react";
import { Story } from "../types/Story";

export const useFetchStoriesList = () => {
  const { setIsLoaderVisible } = useLoader();
  const [storiesList, setStoriesList] = useState<Story[] | undefined>(
    undefined
  );

  useEffect(() => {
    setIsLoaderVisible(true);
    const fetchStoriesList = async () => {
      try {
        const results = await fetch("/api/story", {
          credentials: "include",
        });
        if (!results.ok) {
          throw new Error(`Error fetching stories: ${results.statusText}`);
        }
        const userStories: Story[] = await results.json();
        setStoriesList(userStories);
      } catch (error: unknown) {
        console.error("Failed to fetch story data:", error);
        const apiError = error as APIError;
        if (apiError.statusCode !== 404) {
          console.error(apiError);
        } else {
          setStoriesList([]);
        }
      } finally {
        setIsLoaderVisible(false);
      }
    };

    fetchStoriesList();
  }, [setIsLoaderVisible]);

  return {
    storiesList, setStoriesList
  };
};
