import { useEffect, useMemo, useState } from "react";
import { WorksListContext } from "../contexts/worksList";
import { Story } from "../types/Story";
import { Series } from "../types/Series";
import { useFetchUserData } from "../hooks/useFetchUserData";
import { useLoader } from "../hooks/useLoader";
import { api } from "../api";

export const WorksListProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [seriesList, setSeriesList] = useState<Series[] | null>(null);
  const [storiesList, setStoriesList] = useState<Story[] | null>(null);
  const { isLoggedIn } = useFetchUserData();
  const { showLoader, hideLoader } = useLoader();

  // Fetch function for series and stories
  const fetchSeries = async (): Promise<Series[]> => {
    const { data } = await api.get<Series[]>("/series", {
      withCredentials: true,
    });
    return data;
  };

  const fetchStories = async (): Promise<Story[]> => {
    const { data } = await api.get<Story[]>("/stories", {
      withCredentials: true,
    });
    return data;
  };

  useEffect(() => {
    // Fetch both series and stories when the provider mounts.
    const loadData = async () => {
      try {
        showLoader();
        const [series, stories] = await Promise.all([
          fetchSeries(),
          fetchStories(),
        ]);
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


  const value = useMemo(
    () => ({
      seriesList,
      setSeriesList,
      storiesList,
      setStoriesList,
    }),
    [seriesList, storiesList],
  );

  return (
    <WorksListContext.Provider value={value}>
      {children}
    </WorksListContext.Provider>
  );
};
