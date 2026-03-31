import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { NotificationsContext } from "../contexts/notifications";
import { UserAlert, AlertsResponse } from "../types/Alert";
import { useFetchUserData } from "../hooks/useFetchUserData";
import { api } from "../api";

export const NotificationsProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { isLoggedIn } = useFetchUserData();
  const [alerts, setAlerts] = useState<UserAlert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchAlerts = useCallback(async () => {
    if (!isLoggedIn) return;
    try {
      const { data } = await api.get<AlertsResponse>("/alerts");
      setAlerts(data.alerts);
      setUnreadCount(data.unread_count);
    } catch (error) {
      console.error("Failed to fetch alerts:", error);
    }
  }, [isLoggedIn]);

  const markAsRead = useCallback(
    async (alertId: string) => {
      try {
        await api.put(`/alerts/${alertId}/read`);
        setAlerts((prev) =>
          prev.map((a) =>
            a.alert_id === alertId
              ? { ...a, read: true, read_at: Math.floor(Date.now() / 1000) }
              : a
          )
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch (error) {
        console.error("Failed to mark alert as read:", error);
      }
    },
    []
  );

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const value = useMemo(
    () => ({ alerts, unreadCount, fetchAlerts, markAsRead }),
    [alerts, unreadCount, fetchAlerts, markAsRead]
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
};
