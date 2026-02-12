import { useContext, useEffect, useRef } from "react";
import { UserContext } from "../contexts/user";
import {
  dbEventEmitter,
  SaveErrorPayload,
  DeleteErrorPayload,
  SyncOrderErrorPayload,
} from "../utils/EventEmitter";
import { useToaster } from "./useToaster";
import { AlertToastType } from "../types/AlertToasts";

/**
 * Hook that listens for save/delete/sync errors and displays
 * a visual alert for admin users only.
 *
 * This helps admins identify when the difficult-to-detect
 * "paragraphs not saving" bug occurs.
 */
export const useSaveErrorAlert = () => {
  const userContext = useContext(UserContext);
  const { setAlertState } = useToaster();
  const lastErrorTimeRef = useRef<number>(0);

  const isAdmin = userContext?.userDetails?.admin ?? false;

  useEffect(() => {
    if (!isAdmin) return;

    const handleSaveError = (event: Event) => {
      const customEvent = event as CustomEvent<SaveErrorPayload>;
      const { storyID, chapterID, error } = customEvent.detail;

      // Throttle alerts to avoid spamming (max once per 10 seconds)
      const now = Date.now();
      if (now - lastErrorTimeRef.current < 10000) return;
      lastErrorTimeRef.current = now;

      setAlertState({
        title: "Save Error Detected",
        message: `Failed to save paragraphs for chapter ${chapterID} in story ${storyID}. Error: ${error.message}. The system will retry automatically.`,
        severity: AlertToastType.error,
        open: true,
        timeout: 15000,
      });
    };

    const handleDeleteError = (event: Event) => {
      const customEvent = event as CustomEvent<DeleteErrorPayload>;
      const { storyID, chapterID, error } = customEvent.detail;

      const now = Date.now();
      if (now - lastErrorTimeRef.current < 10000) return;
      lastErrorTimeRef.current = now;

      setAlertState({
        title: "Delete Error Detected",
        message: `Failed to delete paragraphs for chapter ${chapterID} in story ${storyID}. Error: ${error.message}. The system will retry automatically.`,
        severity: AlertToastType.error,
        open: true,
        timeout: 15000,
      });
    };

    const handleSyncOrderError = (event: Event) => {
      const customEvent = event as CustomEvent<SyncOrderErrorPayload>;
      const { storyID, chapterID, error } = customEvent.detail;

      const now = Date.now();
      if (now - lastErrorTimeRef.current < 10000) return;
      lastErrorTimeRef.current = now;

      setAlertState({
        title: "Sync Error Detected",
        message: `Failed to sync paragraph order for chapter ${chapterID} in story ${storyID}. Error: ${error.message}. The system will retry automatically.`,
        severity: AlertToastType.warning,
        open: true,
        timeout: 15000,
      });
    };

    dbEventEmitter.addEventListener("saveError", handleSaveError);
    dbEventEmitter.addEventListener("deleteError", handleDeleteError);
    dbEventEmitter.addEventListener("syncOrderError", handleSyncOrderError);

    return () => {
      dbEventEmitter.removeEventListener("saveError", handleSaveError);
      dbEventEmitter.removeEventListener("deleteError", handleDeleteError);
      dbEventEmitter.removeEventListener("syncOrderError", handleSyncOrderError);
    };
  }, [isAdmin, setAlertState]);
};
