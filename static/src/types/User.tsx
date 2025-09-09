export interface UserDetails {
  email: string;
  subscriber: boolean;
  admin?: boolean;
}

export interface User {
  isLoggedIn: boolean;
  configPanelVisible: boolean;
  loginPanelVisible: boolean;
  userDetails: UserDetails;
}
