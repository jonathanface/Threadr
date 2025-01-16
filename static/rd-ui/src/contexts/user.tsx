import { createContext, useMemo, useState } from "react";
import { UserDetails } from "../types/User";

export type UserContextType = {
  isLoggedIn: boolean;
  userDetails: UserDetails | null;
  setIsLoggedIn: React.Dispatch<React.SetStateAction<boolean>>;
  setUserDetails: React.Dispatch<React.SetStateAction<UserDetails | null>>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const UserContext = createContext<UserContextType | undefined>(
  undefined
);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  console.log("UserProvider mounted");
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const userValue: UserContextType = useMemo(
    () => ({
      userDetails,
      isLoggedIn,
      setUserDetails,
      setIsLoggedIn,
    }),
    [userDetails, isLoggedIn]
  );

  return (
    <UserContext.Provider value={userValue}>{children}</UserContext.Provider>
  );
};
