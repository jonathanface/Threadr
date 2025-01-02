import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { setUserDetails, flipLoggedInState } from "../stores/userSlice";
import { setAlert } from "../stores/alertSlice";
import { setIsLoaderVisible } from "../stores/uiSlice";
import {
  AlertCommandType,
  AlertFunctionCall,
  AlertToast,
  AlertToastType,
} from "../types/AlertToasts";

export const useFetchUserData = () => {
  const [isLoading, setIsLoading] = useState(true);
  const dispatch = useDispatch();

  useEffect(() => {
    const fetchUserData = async () => {
      dispatch(setIsLoaderVisible(true));
      try {
        const response = await fetch("/api/user", { credentials: "include" });
        if (!response.ok) throw new Error(`Fetch error: ${response.status}`);
        const userData = await response.json();

        dispatch(setUserDetails(userData));
        dispatch(flipLoggedInState());
        setIsLoading(false);

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
          dispatch(setAlert(newAlert));
        }
      } catch (error) {
        console.error("Failed to fetch user data:", error);
        setIsLoading(false);
      } finally {
        dispatch(setIsLoaderVisible(false));
      }
    };

    fetchUserData();
  }, [dispatch]);

  return { isLoading };
};
