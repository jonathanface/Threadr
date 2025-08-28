import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import { useLoader } from "../hooks/useLoader";

export const Loader = () => {
  const { loadingCount } = useLoader();

  if (loadingCount === 0) {
    return null; // Don't render anything if not loading
  }
  return (
    <div className="loading-screen">
      <Box className="progress-box" />
      <Box className="prog-anim-holder">
        <CircularProgress />
      </Box>
    </div>
  );
};
