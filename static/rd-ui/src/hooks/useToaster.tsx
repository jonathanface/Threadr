// src/hooks/useToaster.ts
import { useEffect, useCallback } from "react";
import { AlertCommandType } from "../types/AlertToasts";
import { useAlertContext } from "../contexts/alert";

export const useToaster = () => {
  const { alertState, clearAlert, setAlertState } = useAlertContext();

  useEffect(() => {
    // Handle side-effects related to alertState changes here
    // For example, automatically clear alerts after a timeout
  }, [alertState]);

  const handleFunc = useCallback(() => {
    if (alertState?.callback) {
      switch (alertState.callback.type) {
        case AlertCommandType.subscribe:
          // Implement the actual logic here
          console.log("Open subscription form");
          break;
        default:
          break;
      }
    }
  }, [alertState]);

  return { alertState, clearAlert, handleFunc, setAlertState };
};
