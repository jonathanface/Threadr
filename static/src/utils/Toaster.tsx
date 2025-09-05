import Alert, { AlertColor } from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Snackbar, { SnackbarOrigin } from "@mui/material/Snackbar";
import { useToaster } from "../hooks/useToaster";

export const Toaster = () => {
  const { alertState, clearAlert, handleFunc } = useToaster();

  const splitByNewline = alertState.message.split("\n");

  const timeout =
    alertState.timeout !== undefined ? alertState.timeout : 10 * 1000;

  const defaultOrigin: SnackbarOrigin = {
    horizontal: "right",
    vertical: "bottom",
  };

  return (
    <Snackbar
      anchorOrigin={alertState.origin ? alertState.origin : defaultOrigin}
      className="alert-toast"
      autoHideDuration={timeout}
      open={alertState.open}
      onClose={clearAlert}
      key="bottom_right"
    >
      <Alert
        severity={alertState.severity.toString() as AlertColor}
        className="alert-popup"
      >
        <AlertTitle>{alertState.title}</AlertTitle>
        {splitByNewline.map((line: string, idx: number) => (
          <div key={idx} className="line">
            {line}
          </div>
        ))}
        {alertState.callback ? (
          <p>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                handleFunc();
              }}
            >
              {alertState.callback.text}
            </a>
          </p>
        ) : null}
        {alertState.link ? (
          <a
            href={alertState.link.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {alertState.link.text}
          </a>
        ) : null}
      </Alert>
    </Snackbar>
  );
};
