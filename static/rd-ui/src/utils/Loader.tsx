import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import { TypedUseSelectorHook, useSelector } from "react-redux";
import { RootState } from "../stores/store";

export const Loader = () => {
  const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
  const isLoaderVisible = useAppSelector((state) => state.ui.isLoaderVisible);
  return (
    <div
      className="loading-screen"
      style={{ visibility: isLoaderVisible ? "visible" : "hidden" }}
    >
      <Box className="progress-box" />
      <Box className="prog-anim-holder">
        <CircularProgress />
      </Box>
    </div>
  );
};
