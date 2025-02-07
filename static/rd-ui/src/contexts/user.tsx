// src/contexts/user.tsx
import { createContext } from "react";
import { UserDetails } from "../types/User";


interface UserContextType {
  userDetails: UserDetails | null;
  isLoggedIn: boolean;
  userLoading: boolean;
  setIsLoggedIn: (value: boolean) => void;
}

export const UserContext = createContext<UserContextType | undefined>(undefined);
