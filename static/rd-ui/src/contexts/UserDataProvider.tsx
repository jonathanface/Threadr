import React, { createContext, useContext, useEffect, useState } from "react";
import { useLoader } from "../hooks/useLoader";
import { useToaster } from "../hooks/useToaster";
import {
  AlertCommandType,
  AlertFunctionCall,
  AlertToastType,
} from "../types/AlertToasts";

interface UserDataContextType {
  userDetails: any;
  setUserDetails: React.Dispatch<React.SetStateAction<any>>;
  isLoadingUser: boolean;
  userError: Error | null;
  setIsLoggedIn: React.Dispatch<React.SetStateAction<boolean>>;
  isLoggedIn: boolean;
}

const UserDataContext = createContext<UserDataContextType | undefined>(
  undefined
);

export const UserDataProvider: React.FC = ({ children }) => {
  const { setIsLoaderVisible } = useLoader();
  const { setAlertState } = useToaster();
  const [userDetails, setUserDetails] = useState<any>(null);
  const [userError, setUserError] = useState<Error | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    setIsLoaderVisible(true);
    const fetchUserData = async () => {
      try {
        const response = await fetch("/api/user", { credentials: "include" });
        if (!response.ok) throw new Error(`Fetch error: ${response.status}`);
        const userData = await response.json();
        setUserDetails(userData);
        setIsLoggedIn(true);
        if (userData.expired) {
          const alertFunction: AlertFunctionCall = {
            type: AlertCommandType.subscribe,
            text: "subscribe",
          };
          setAlertState({
            title: "Subscription expired",
            message:
              "Your subscription expired, and you didn't have auto-renewal enabled. Any additional stories you had created have been removed from your account, but may be recovered by re-subscribing within 30 days.",
            open: true,
            callback: alertFunction,
            severity: AlertToastType.warning,
            timeout: undefined,
          });
        }
      } catch (error: unknown) {
        console.error("Failed to fetch user data:", error);
        setUserError(error as Error);
      } finally {
        setIsLoaderVisible(false);
        setIsLoadingUser(false);
      }
    };
    fetchUserData();
  }, [setIsLoaderVisible, setAlertState]);

  return (
    <UserDataContext.Provider
      value={{
        userDetails,
        setUserDetails,
        isLoadingUser,
        userError,
        setIsLoggedIn,
        isLoggedIn,
      }}
    >
      {children}
    </UserDataContext.Provider>
  );
};

export const useUserData = () => {
  const context = useContext(UserDataContext);
  if (!context) {
    throw new Error("useUserData must be used within a UserDataProvider");
  }
  return context;
};
