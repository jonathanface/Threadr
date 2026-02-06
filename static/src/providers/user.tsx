import { ReactNode, useEffect, useMemo, useState } from "react";
import { UserContext } from "../contexts/user";
import { useLoader } from "../hooks/useLoader";
import { UserDetails } from "../types/User";
import { api } from "../api";

export const UserProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [userLoading, setUserLoading] = useState(true);
  const { showLoader, hideLoader } = useLoader();

  const fetchUserData = async (): Promise<UserDetails> => {
    // Check URL for new_user or returning_user flags from auth callback
    const urlParams = new URLSearchParams(window.location.search);
    const params = new URLSearchParams();

    // Check URL parameters first
    const newUserFromUrl = urlParams.get('new_user') === 'true';
    const returningUserFromUrl = urlParams.get('returning_user') === 'true';

    // Store in sessionStorage for persistence across navigations
    if (newUserFromUrl) {
      sessionStorage.setItem('new_user', 'true');
      params.append('new_user', 'true');
    } else if (sessionStorage.getItem('new_user') === 'true') {
      params.append('new_user', 'true');
    }

    if (returningUserFromUrl) {
      sessionStorage.setItem('returning_user', 'true');
      params.append('returning_user', 'true');
    } else if (sessionStorage.getItem('returning_user') === 'true') {
      params.append('returning_user', 'true');
    }

    const queryString = params.toString();
    const url = queryString ? `/user?${queryString}` : '/user';

    const { data } = await api.get<UserDetails>(url, {
      withCredentials: true,
    });

    return data;
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        showLoader();
        const user = await fetchUserData();
        setIsLoggedIn(true);
        setUserDetails(user);
      } catch (error) {
        console.error(`Error retrieving user: ${error}`);
        setIsLoggedIn(false);
      } finally {
        setUserLoading(false);
        hideLoader();
      }
    };
    loadData();
  }, [hideLoader, showLoader]);

  const clearWelcomeFlags = () => {
    if (userDetails) {
      setUserDetails({
        ...userDetails,
        showWelcome: false,
        isReturningUser: false,
      });
    }

    // Clear sessionStorage flags
    sessionStorage.removeItem('new_user');
    sessionStorage.removeItem('returning_user');

    // Clean up URL parameters after a short delay to ensure modal has closed
    setTimeout(() => {
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.delete('new_user');
      currentUrl.searchParams.delete('returning_user');
      window.history.replaceState({}, '', currentUrl.toString());
    }, 100);
  };

  const userValue = useMemo(
    () => ({
      userDetails,
      isLoggedIn,
      userLoading,
      setUserDetails,
      setIsLoggedIn,
      clearWelcomeFlags,
    }),
    [userDetails, setUserDetails, isLoggedIn, userLoading, setIsLoggedIn],
  );

  return (
    <UserContext.Provider value={userValue}>{children}</UserContext.Provider>
  );
};
