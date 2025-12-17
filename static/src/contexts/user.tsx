// src/contexts/user.tsx
import { createContext } from "react";
import { UserDetails } from "../types/User";


export interface UserContextType {
  userDetails: UserDetails | null;
  isLoggedIn: boolean;
  userLoading: boolean;
  setIsLoggedIn: (value: boolean) => void;
  setUserDetails: (value: UserDetails | null) => void;
  clearWelcomeFlags: () => void;
}

export const UserContext = createContext<UserContextType | undefined>(undefined);
