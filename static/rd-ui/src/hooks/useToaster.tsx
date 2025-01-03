import { useEffect } from "react";
import { AlertCommandType } from "../types/AlertToasts";
import { useAlertContext } from "../contexts/alert";

export const useToaster = () => {
  const { alertState, clearAlert, setAlertState } = useAlertContext();

  useEffect(() => {
    // Add any side-effects related to alertState changes here
  }, [alertState]);

  const handleFunc = () => {
    if (alertState.callback) {
      switch (alertState.callback.type) {
        case AlertCommandType.subscribe:
          //dispatch(setIsSubscriptionFormOpen(true));
          console.log("Open subscription form"); // Replace with actual logic
          break;
        default:
          break;
      }
    }
  };

  return { alertState, clearAlert, handleFunc, setAlertState };
};
