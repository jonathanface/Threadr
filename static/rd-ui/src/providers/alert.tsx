import { useMemo, useState } from "react";
import { AlertState, AlertToastType } from "../types/AlertToasts";
import { AlertContext } from "../contexts/alert";

const defaultState: AlertState = {
    open: false,
    severity: AlertToastType.info,
    message: "",
    title: "",
    timeout: undefined,
};

export const AlertProvider: React.FC<{ children: React.ReactNode }> = ({
    children,
}) => {
    const [alertState, setAlertState] = useState<AlertState>(defaultState);

    const clearAlert = () => {
        setAlertState(defaultState);
    };

    const alertValue = useMemo(
        () => ({
            alertState,
            setAlertState,
            clearAlert,
        }),
        [alertState]
    );

    return (
        <AlertContext.Provider value={alertValue}>
            {children}
        </AlertContext.Provider>
    );
};