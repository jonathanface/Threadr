export interface UserAlert {
  alert_id: string;
  subject: string;
  message: string;
  link?: string;
  alert_type: "announcement" | "personal";
  target_email: string;
  created_at: number;
  created_by: string;
  read: boolean;
  read_at?: number;
}

export interface AlertsResponse {
  alerts: UserAlert[];
  unread_count: number;
}
