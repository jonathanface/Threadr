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

export type AlertState = {
  open: boolean;
  severity: string;
  message: string;
  title: string;
  timeout?: number | null;
  link?: { url: string; text: string };
  callback?: AlertFunctionCall;
};
