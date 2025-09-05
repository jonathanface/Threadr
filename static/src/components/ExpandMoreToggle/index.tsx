import { IconButton, IconButtonProps, Tooltip } from "@mui/material";
import { styled } from "@mui/material/styles";
import { forwardRef } from "react";

type ExpandMoreToggleProps = IconButtonProps & {
  expand: boolean;
  tooltipOpenText?: string;
  tooltipCloseText?: string;
  children?: React.ReactNode;
};

const ExpandMoreIconButton = styled(IconButton, {
  shouldForwardProp: (prop) => prop !== "expand",
})<{ expand: boolean }>(({ theme, expand }) => ({
  transform: expand ? "rotate(0deg)" : "rotate(-90deg)",
  transition: theme.transitions.create("transform", {
    duration: theme.transitions.duration.shortest,
  }),
  marginLeft: 4,
}));

export const ExpandMoreToggle = forwardRef<
  HTMLButtonElement,
  ExpandMoreToggleProps
>(function ExpandMoreToggle(
  {
    expand,
    tooltipOpenText = "open",
    tooltipCloseText = "close",
    children,
    ...iconButtonProps
  },
  ref,
) {
  return (
    <Tooltip title={expand ? tooltipCloseText : tooltipOpenText}>
      {/* span wrapper keeps tooltip working when button is disabled */}
      <span>
        <ExpandMoreIconButton {...iconButtonProps} ref={ref} expand={expand}>
          {children}
        </ExpandMoreIconButton>
      </span>
    </Tooltip>
  );
});
