export enum AlertToastType {
  success = "success",
  info = "info",
  warning = "warning",
  error = "error",
}

export enum AlertCommandType {
  subscribe = "subscribe",
}

export interface AlertLink {
  url: string;
  text: string;
  sameWindow?: boolean;
}

export interface AlertFunctionCall {
  type: AlertCommandType;
  text: string;
}

export interface AlertToast {
  message: string;
  open: boolean;
  title: string;
  severity: AlertToastType;
  timeout?: number;
  link?: AlertLink;
  func?: AlertFunctionCall;
}
