import { useCallback, useEffect, useMemo, useState } from "react";
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

  // Load both lists in parallel. Shared by the mount effect and the
  // refresh() action exposed on the context; the loader param flips the
  // user-visible spinner off for in-flight actions that are already
  // signaling their own progress (e.g. the DraftsDialog's clone
  // indicator).
  const loadData = useCallback(async (opts?: { silent?: boolean }) => {
    try {
      if (!opts?.silent) showLoader();
      const [series, stories] = await Promise.all([
        fetchSeries(),
        fetchStories(),
      ]);
      setSeriesList(series);
      setStoriesList(stories);
    } catch (error) {
      console.error("Error loading works list data:", error);
    } finally {
      if (!opts?.silent) hideLoader();
    }
  }, [showLoader, hideLoader]);

  useEffect(() => {
    if (isLoggedIn) {
      // Data fetch on mount / login change; setState inside is intentional
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadData();
    }
  }, [isLoggedIn, loadData]);

  // refresh() silently re-fetches so callers (DraftsDialog's
  // post-create / set-current / delete handlers) can keep the list in
  // sync without flashing the global loader on top of their own
  // progress UI.
  const refresh = useCallback(() => loadData({ silent: true }), [loadData]);

  const value = useMemo(
    () => ({
      seriesList,
      setSeriesList,
      storiesList,
      setStoriesList,
      refresh,
    }),
    [seriesList, storiesList, refresh],
  );

  return (
    <WorksListContext.Provider value={value}>
      {children}
    </WorksListContext.Provider>
  );
};
