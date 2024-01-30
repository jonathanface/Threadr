import Alert, { AlertColor } from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Snackbar from "@mui/material/Snackbar";
import React, { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";

import type { TypedUseSelectorHook } from "react-redux";
import type { AppDispatch, RootState } from "../stores/store";

import { clearAlert } from "../stores/alertSlice";

export enum AlertToastType {
  success = "success",
  info = "info",
  warning = "warning",
  error = "error",
}

export interface AlertLink {
  url: string;
  text: string;
  sameWindow?: boolean;
}

export interface AlertFunctionCall {
  func: Function;
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

const Toaster = () => {
  const useAppDispatch: () => AppDispatch = useDispatch;
  const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
  const dispatch = useAppDispatch();

  const open = useAppSelector((state) => state.alerts.open);
  const severity = useAppSelector((state) => state.alerts.severity);
  const alertMessage = useAppSelector((state) => state.alerts.message);
  const title = useAppSelector((state) => state.alerts.title);
  const timeout = useAppSelector((state) => state.alerts.timeout);
  const link = useAppSelector((state) => state.alerts.link);
  const func = useAppSelector((state) => state.alerts.func);

  const alertState = useAppSelector((state) => state.alerts);

  const handleClose = () => {
    dispatch(clearAlert());
  };

  const splitByNewline = alertMessage.split("\n");

  useEffect(() => {}, [alertState]);

  return (
    <Snackbar
      className="alert-toast"
      autoHideDuration={timeout}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      open={open}
      onClose={handleClose}
      key="bottom_right">
      <Alert severity={severity.toString() as AlertColor} className="alert-popup">
        <AlertTitle>{title}</AlertTitle>
        {splitByNewline.map((line, idx) => {
          return (
            <div key={idx} className="line">
              {line}
            </div>
          );
        })}
        {func ? (
          <p>
            <a href="#" onClick={dispatch(func.func())}>
              {func.text}
            </a>
          </p>
        ) : null}
        {link ? (
          <a href={link.url} target="_blank">
            {link.text}
          </a>
        ) : null}
      </Alert>
    </Snackbar>
  );
};
export default Toaster;
