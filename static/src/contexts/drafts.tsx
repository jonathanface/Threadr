import { createContext } from "react";
import { Story } from "../types/Story";

export type DraftsContextType = {
  // The ancestry's drafts, keyed by the story id the fetch was keyed on.
  // Null until the first fetch resolves; empty [] when the fetch failed
  // or the user isn't a subscriber. Readers compare storyID to decide if
  // the cached list is for the active story.
  list: Story[] | null;
  storyID: string | null;
  loading: boolean;
  // HTTP status of the last failed fetch, when it failed. Lets the
  // DraftsDialog distinguish a 402 subscriber-only response from a
  // generic error without re-wrapping axios on top of the context.
  errorStatus: number | null;
  // Trigger a fetch for the given story id. Idempotent — repeat calls
  // with the same id are coalesced to a single in-flight request.
  fetch: (storyID: string) => void;
  // Force a re-fetch of the current id. Called after mutations
  // (rename / create / set-primary / delete) so every consumer of the
  // cache (HeaderMenu chip, DraftsDialog list, etc.) sees fresh data
  // without each one wiring its own refetch.
  refresh: () => void;
  // Drop the cache so a subsequent fetch of a different id doesn't
  // briefly serve stale rows from the previous story.
  clear: () => void;
};

export const DraftsContext = createContext<DraftsContextType | undefined>(
  undefined,
);
