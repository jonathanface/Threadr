import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import { useLoader } from "../hooks/useLoader";

export const Loader = () => {
  const { isLoaderVisible } = useLoader();
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
