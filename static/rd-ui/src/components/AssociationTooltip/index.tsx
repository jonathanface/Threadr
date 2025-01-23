import { Box, Tooltip } from "@mui/material";
import React from "react";
import styles from "./association-tooltip.module.css";

interface AssociationTooltipProps {
  portrait: string;
  name: string;
  description: string;
  children: React.ReactElement;
}

export const AssociationTooltip: React.FC<AssociationTooltipProps> = ({
  portrait,
  name,
  description,
  children,
}) => {
  return (
    <Tooltip
      placement="top"
      title={
        <div className={styles.associationTooltipBody}>
          <div className="row">
            <span className={styles.column}>
              <Box
                component="img"
                sx={{
                  maxHeight: 100,
                  margin: "auto",
                }}
                alt={name || "Default Name"}
                src={portrait || "/img/default_association_portrait.jpg"}
              />
            </span>
            <span className={styles.column}>
              {description || "Descriptive text goes here."}
            </span>
          </div>
        </div>
      }
      sx={{
        backgroundColor: "#445c66;",
        border: "1px solid #333",
        borderRadius: "10px",
      }}
    >
      {children}
    </Tooltip>
  );
};
