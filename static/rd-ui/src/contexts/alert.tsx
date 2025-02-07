import { createContext } from "react";
import { AlertState } from "../types/AlertToasts";

type AlertContextType = {
  alertState: AlertState;
  setAlertState: (state: AlertState) => void;
  clearAlert: () => void;
};

 
export const AlertContext = createContext<AlertContextType | undefined>(
  undefined
);
