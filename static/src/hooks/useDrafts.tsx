import { useContext } from "react";
import { DraftsContext } from "../contexts/drafts";

export const useDrafts = () => {
  const ctx = useContext(DraftsContext);
  if (!ctx) {
    throw new Error("useDrafts must be used within a DraftsProvider");
  }
  return ctx;
};
