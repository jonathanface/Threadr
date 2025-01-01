export interface UserDetails {
  user_id: string;
  email: string;
  renewing: boolean;
  subscription_id: string;
  customer_id: string;
  admin?: boolean;
}

export interface User {
  isLoggedIn: boolean;
  configPanelVisible: boolean;
  loginPanelVisible: boolean;
  userDetails: UserDetails;
}
