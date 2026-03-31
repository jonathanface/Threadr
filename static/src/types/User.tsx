export interface UserDetails {
  email: string;
  first_name: string;
  last_name: string;
  subscriber: boolean;
  admin?: boolean;
  auth_type?: string;
  email_verified?: boolean;
  showWelcome?: boolean;
  isReturningUser?: boolean;
}

export interface User {
  isLoggedIn: boolean;
  configPanelVisible: boolean;
  loginPanelVisible: boolean;
  userDetails: UserDetails;
}
