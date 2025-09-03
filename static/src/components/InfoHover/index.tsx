import { FC } from "react";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import Tooltip from "@mui/material/Tooltip";
import IconButton from "@mui/material/IconButton";
import styles from "./infohover.module.css";

type InfoProps = {
  text: string;
};

export const InfoHover: FC<InfoProps> = ({ text }) => {
  return (
    <Tooltip className={styles.infoHover} title={text} arrow placement="top">
      <IconButton size="small">
        <InfoOutlinedIcon fontSize="inherit" />
      </IconButton>
    </Tooltip>
  );
};
