// src/contexts/user.tsx
import React, { createContext, useMemo, useState, ReactNode, useEffect } from "react";
import { UserDetails } from "../types/User";


interface UserContextType {
  userDetails: UserDetails | null;
  setUserDetails: React.Dispatch<React.SetStateAction<UserDetails | null>>;
  isLoggedIn: boolean;
  setIsLoggedIn: React.Dispatch<React.SetStateAction<boolean>>;
}

export const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);

  const userValue = useMemo(
    () => ({
      userDetails,
      setUserDetails,
      isLoggedIn,
      setIsLoggedIn,
    }),
    [userDetails, isLoggedIn]
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
