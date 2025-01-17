import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { UserContext } from "../contexts/user";
import { useLoader } from "./useLoader";
import { useToaster } from "./useToaster";
import {
  AlertCommandType,
  AlertFunctionCall,
  AlertToastType,
} from "../types/AlertToasts";

export const useFetchUserData = () => {
  const { setIsLoaderVisible } = useLoader();
  const { setAlertState } = useToaster();
  const userContext = useContext(UserContext);
  if (!userContext) {
    throw new Error("UserContext must be used within a UserContext.Provider");
  }
  const { userDetails, setUserDetails, setIsLoggedIn, isLoggedIn } = userContext;
  const [userError, setUserError] = useState<Error | null>(null);

  const isFetchingRef = useRef(false);

  const fetchUserData = useCallback(async () => {
    if (userDetails || isFetchingRef.current) return;
    isFetchingRef.current = true;
    setIsLoaderVisible(true);
    try {
      const response = await fetch("/api/user", { credentials: "include" });
      if (!response.ok) throw new Error(`Fetch error: ${response.status}`);

      const userData = await response.json();

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

      setUserDetails(userData);
      setIsLoggedIn(true);
    } catch (error) {
      console.error("Failed to fetch user data:", error);
      setUserError(error as Error);
    } finally {
      setIsLoaderVisible(false);
    }
    //eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setIsLoaderVisible, setAlertState, setUserDetails, setIsLoggedIn]);

  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);

  return {
    userDetails,
    setUserDetails,
    userError,
    setIsLoggedIn,
    isLoggedIn,
  };
};

