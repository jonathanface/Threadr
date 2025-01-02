import { useCallback, useEffect } from "react";
import { useDispatch } from "react-redux";
import { setSelectedStory } from "../stores/storiesSlice";

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
  const dispatch = useDispatch();

  const handleNavChange = useCallback(async () => {
    const location = window.location.pathname;
    const splitDirectories = location.split("/");
    if (splitDirectories[1] === "story" && splitDirectories[2]?.trim()) {
      const story = await fetchStoryDetails(splitDirectories[2].trim());
      dispatch(setSelectedStory(story));
    } else {
      dispatch(setSelectedStory(null));
    }
  }, [dispatch]);

  useEffect(() => {
    window.addEventListener("popstate", handleNavChange);
    handleNavChange(); // Run it once on mount to handle the current path
    return () => window.removeEventListener("popstate", handleNavChange);
  }, [handleNavChange]);

  return { handleNavChange };
};
