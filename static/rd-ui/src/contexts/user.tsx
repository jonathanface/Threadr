import { createContext } from "react";
import { UserDetails } from "../types/User";

// Define types for your context values
export type UserContextType = {
  isLoggedIn: boolean;
  userDetails: UserDetails | null;
  setUserDetails: (user: UserDetails) => void;
};

// Create contexts
export const UserContext = createContext<UserContextType | undefined>(
  undefined
);
