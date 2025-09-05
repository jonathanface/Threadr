import { IconButton, styled, Tooltip } from "@mui/material";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ExpandMoreToggle = styled((props: any) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _expand, ...other } = props;
  return (
    <Tooltip title={!other.expand ? "open" : "close"}>
      <IconButton size="small" {...other} />
    </Tooltip>
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
})(({ theme, expand }: { theme?: any; expand: boolean }) => ({
  transform: !expand ? "rotate(-90deg)" : "rotate(0deg)",
  transition: theme.transitions.create("transform", {
    duration: theme.transitions.duration.shortest,
  }),
  marginLeft: 4,
}));
