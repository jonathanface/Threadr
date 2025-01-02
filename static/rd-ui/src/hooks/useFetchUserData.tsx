import { useContext, useEffect, useState } from "react";

import {
  AlertCommandType,
  AlertFunctionCall,
  AlertToast,
  AlertToastType,
} from "../types/AlertToasts";
import { LoaderContext } from "../contexts/loader";
import { UserContext } from "../contexts/user";

export const useFetchUserData = () => {
  const loaderContext = useContext(LoaderContext);
  if (!loaderContext) {
    throw new Error(
      "LoaderContext must be used within a LoaderContext.Provider"
    );
  }
  const userContext = useContext(UserContext);
  if (!userContext) {
    throw new Error("UserContext must be used within a UserContext.Provider");
  }
  const [isLoadingUser, setIsLoadingUser] = useState(false);
  const { setIsLoaderVisible } = loaderContext;
  const { userDetails, setUserDetails } = userContext;
  useEffect(() => {
    setIsLoaderVisible(true);
    setIsLoadingUser(true);
    const fetchUserData = async () => {
      try {
        const response = await fetch("/api/user", { credentials: "include" });
        if (!response.ok) throw new Error(`Fetch error: ${response.status}`);
        const userData = await response.json();

        setUserDetails(userData);
        setIsLoadingUser(false);
        if (userData.expired) {
          const alertFunction: AlertFunctionCall = {
            type: AlertCommandType.subscribe,
            text: "subscribe",
          };
          const newAlert: AlertToast = {
            title: "Subscription expired",
            message:
              "Your subscription expired, and you didn't have auto-renewal enabled. Any additional stories you had created have been removed from your account, but may be recovered by re-subscribing within 30 days.",
            open: true,
            func: alertFunction,
            severity: AlertToastType.warning,
            timeout: undefined,
          };
          // dispatch(setAlert(newAlert));
        }
      } catch (error) {
        console.error("Failed to fetch user data:", error);
        setIsLoadingUser(false);
      } finally {
        setIsLoaderVisible(false);
      }
    };

    fetchUserData();
  }, []);

  return { userDetails, isLoadingUser, setUserDetails };
};
