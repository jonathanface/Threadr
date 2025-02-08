// src/hooks/useFetchUserData.ts
import { useContext } from "react";
import { UserContext } from "../contexts/user";

export const useFetchUserData = () => {
  const userContext = useContext(UserContext);
  if (!userContext) {
    throw new Error("UserContext must be used within a UserContext.Provider");
  }

  const { userDetails, isLoggedIn, userLoading, setUserDetails, setIsLoggedIn } = userContext;
  return {
    userDetails,
    isLoggedIn,
    userLoading,
    setIsLoggedIn,
    setUserDetails
  };
};
