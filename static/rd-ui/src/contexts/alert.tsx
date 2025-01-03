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

export const AlertContext = createContext<AlertContextType | undefined>(
  undefined
);

export const AlertProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
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

export const useAlertContext = () => {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error("useAlertContext must be used within an AlertProvider");
  }
  return context;
};
