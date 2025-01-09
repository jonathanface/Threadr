import { useLoader } from "./useLoader";
import { APIError } from "../types/API";
import { useContext, useEffect } from "react";
import { Story } from "../types/Story";
import { WorksListContext } from "../contexts/worksList";

export const useFetchStoriesList = () => {
  const { setIsLoaderVisible } = useLoader();
  const context = useContext(WorksListContext);
  if (!context) {
    throw new Error(
      "WorksListContext must be used within a WorksListContextProvider"
    );
  }
  const { storiesList, setStoriesList } = context

  useEffect(() => {
    if (storiesList === undefined) {
      setIsLoaderVisible(true);
      const fetchStoriesList = async () => {
        try {
          const results = await fetch("/api/stories", {
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
    }
  }, [setIsLoaderVisible]);

  return {
    storiesList, setStoriesList
  };
};
