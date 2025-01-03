import Alert, { AlertColor } from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Snackbar from "@mui/material/Snackbar";
import { useToaster } from "../hooks/useToaster";

export const Toaster = () => {
  const { alertState, clearAlert, handleFunc } = useToaster();

  const splitByNewline = alertState.message.split("\n");

  const timeout = alertState.timeout ? alertState.timeout : 5000;

  return (
    <Snackbar
      className="alert-toast"
      autoHideDuration={timeout}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
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
