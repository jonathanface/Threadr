import { useCallback, useEffect } from "react";
import { StoryAction, useCurrentStoryContext } from "../contexts/selections";

const fetchStoryDetails = async (storyID: string) => {
  const url = `/api/stories/${storyID}`;
  try {
    const response = await fetch(url, {
      credentials: "include",
    });
    if (!response.ok)
      throw new Error(`Error fetching story: ${response.statusText}`);
    return await response.json();
  } catch (error) {
    console.error("Failed to fetch story details:", error);
    return null;
  }
};

export const useHandleNavigationHandler = () => {
  const { setCurrentStory, deselectStory, setCurrentStoryAction, currentStory } =
    useCurrentStoryContext();

  const handleNavChange = useCallback(async () => {
    const location = window.location.pathname;
    const splitDirectories = location.split("/");
    if (splitDirectories[1] === "story" && splitDirectories[2]?.trim()) {
      const storyID = splitDirectories[2].trim();

      // Avoid fetching if the current story is already loaded
      if (!currentStory || currentStory.story_id !== storyID) {
        const story = await fetchStoryDetails(storyID);
        setCurrentStory(story);
      }
      setCurrentStoryAction(StoryAction.editing);
    } else {
      deselectStory();
    }
  }, [currentStory, deselectStory, setCurrentStory, setCurrentStoryAction]);

  useEffect(() => {
    window.addEventListener("popstate", handleNavChange);
    handleNavChange(); // Run it once on mount to handle the current path
    return () => window.removeEventListener("popstate", handleNavChange);
  }, [handleNavChange]);

  return { handleNavChange };
};
