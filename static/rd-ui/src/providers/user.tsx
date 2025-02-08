import { ReactNode, useEffect, useMemo, useState } from "react";
import { UserContext } from "../contexts/user";
import { useLoader } from "../hooks/useLoader";
import { UserDetails } from "../types/User";

export const UserProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
    const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
    const [userLoading, setUserLoading] = useState(true);
    const { showLoader, hideLoader } = useLoader();

    const fetchUserData = async (): Promise<UserDetails> => {
        const response = await fetch("/api/user", { credentials: "include" });
        if (!response.ok) {
            throw new Error(`Fetch error: ${response.status}`);
        }
        return await response.json();
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
        }
        loadData();
    }, [hideLoader, showLoader]);

    const userValue = useMemo(
        () => ({
            userDetails,
            isLoggedIn,
            userLoading,
            setUserDetails,
            setIsLoggedIn
        }),
        [userDetails, isLoggedIn, userLoading, setIsLoggedIn]
    );

    useEffect(() => {
        console.log("UserProvider mounted");
        return () => {
            console.log("UserProvider unmounted");
        };
    }, []);

    return (
        <UserContext.Provider value={userValue}>
            {children}
        </UserContext.Provider>
    );
};