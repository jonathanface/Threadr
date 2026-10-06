import axios from "axios";
import { useCallback, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { DraftsContext } from "../contexts/drafts";
import { Story } from "../types/Story";

export const DraftsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [storyID, setStoryID] = useState<string | null>(null);
  const [list, setList] = useState<Story[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  // Guards against stale responses: if a second fetch starts for a
  // different story before the first completes, only the latest
  // request's result is written.
  const latestID = useRef<string | null>(null);

  const doFetch = useCallback(async (id: string) => {
    latestID.current = id;
    setLoading(true);
    setErrorStatus(null);
    try {
      const res = await api.get<Story[]>(`/stories/${id}/drafts`);
      if (latestID.current === id) {
        setStoryID(id);
        setList(res.data || []);
      }
    } catch (err) {
      const status =
        axios.isAxiosError(err) && err.response?.status
          ? err.response.status
          : null;
      if (axios.isAxiosError(err)) {
        console.error(
          `Error loading drafts: ${err.response?.status} ${err.message}`,
        );
      }
      if (latestID.current === id) {
        setStoryID(id);
        setList([]);
        setErrorStatus(status);
      }
    } finally {
      if (latestID.current === id) {
        setLoading(false);
      }
    }
  }, []);

  // Fetch — but only if we don't already hold the list for this id.
  // Fetches during an in-flight request for the same id are no-ops.
  const fetch = useCallback(
    (id: string) => {
      if (!id) return;
      if (latestID.current === id && (list !== null || loading)) return;
      doFetch(id);
    },
    [doFetch, list, loading],
  );

  const refresh = useCallback(() => {
    if (latestID.current) doFetch(latestID.current);
  }, [doFetch]);

  const clear = useCallback(() => {
    latestID.current = null;
    setStoryID(null);
    setList(null);
    setErrorStatus(null);
  }, []);

  const value = useMemo(
    () => ({ list, storyID, loading, errorStatus, fetch, refresh, clear }),
    [list, storyID, loading, errorStatus, fetch, refresh, clear],
  );

  return (
    <DraftsContext.Provider value={value}>{children}</DraftsContext.Provider>
  );
};
