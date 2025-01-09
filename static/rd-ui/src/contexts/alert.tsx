import React, { createContext, useContext, useState } from "react";
import { AlertState, AlertToastType } from "../types/AlertToasts";

type AlertContextType = {
  alertState: AlertState;
  setAlertState: (state: AlertState) => void;
  clearAlert: () => void;
};

const defaultState: AlertState = {
  open: false,
  severity: AlertToastType.info,
  message: "",
  title: "",
  timeout: undefined,
};
// eslint-disable-next-line react-refresh/only-export-components
export const AlertContext = createContext<AlertContextType | undefined>(
  undefined
);

export const AlertProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  console.log("AlertProvider mounted");
  const [alertState, setAlertState] = useState<AlertState>(defaultState);

  const clearAlert = () => {
    setAlertState(defaultState);
  };

  return (
    <AlertContext.Provider value={{ alertState, setAlertState, clearAlert }}>
      {children}
    </AlertContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAlertContext = () => {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error("useAlertContext must be used within an AlertProvider");
  }
  return context;
};
