import { createContext } from "react";
import { UserAlert } from "../types/Alert";

export interface NotificationsContextType {
  alerts: UserAlert[];
  unreadCount: number;
  fetchAlerts: () => Promise<void>;
  markAsRead: (alertId: string) => Promise<void>;
}

export const NotificationsContext =
  createContext<NotificationsContextType | null>(null);
