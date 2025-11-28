export interface UserDetails {
  email: string;
  first_name?: string;
  last_name?: string;
  subscriber: boolean;
  admin?: boolean;
}

export interface User {
  isLoggedIn: boolean;
  configPanelVisible: boolean;
  loginPanelVisible: boolean;
  userDetails: UserDetails;
}
