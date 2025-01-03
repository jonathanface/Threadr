import { createContext, useState } from "react";
import { UserDetails } from "../types/User";

// Define types for your context values
export type UserContextType = {
  isLoggedIn: boolean;
  userDetails: UserDetails | null;
  setIsLoggedIn: React.Dispatch<React.SetStateAction<boolean>>;
  setUserDetails: React.Dispatch<React.SetStateAction<UserDetails | null>>;
};

// Create contexts
export const UserContext = createContext<UserContextType | undefined>(
  undefined
);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const userValue: UserContextType = {
    userDetails,
    isLoggedIn,
    setUserDetails,
    setIsLoggedIn,
  };

  return (
    <UserContext.Provider value={userValue}>{children}</UserContext.Provider>
  );
};
