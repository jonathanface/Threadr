import { useContext } from "react";
import { NotificationsContext } from "../contexts/notifications";

export const useNotifications = () => {
  const ctx = useContext(NotificationsContext);
  if (!ctx)
    throw new Error(
      "useNotifications must be used within NotificationsProvider"
    );
  return ctx;
};
