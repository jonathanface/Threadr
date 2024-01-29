import { Box, Tooltip } from "@mui/material";
import React, { ReactElement, useEffect, useState } from "react";
import "../../css/association-tooltip.css";

interface AssociationTooltipProps {
  portrait: string;
  name: string;
  description: string;
  children: ReactElement;
}

const AssociationTooltip: React.FC<AssociationTooltipProps> = (props) => {
  const [portrait, setPortrait] = useState("/img/default_association_portrait.jpg");
  const [name, setName] = useState("someone or something");
  const [description, setDescription] = useState("Descriptive text goes here.");

  useEffect(() => {
    setPortrait(props.portrait);
    setName(props.name);
    setDescription(props.description);
  }, [props]);

  return (
    <Tooltip
      placement="top"
      title={
        <div className="association-tooltip-body">
          <div className="row">
            <span className="column">
              <Box
                component="img"
                sx={{
                  maxHeight: 100,
                  margin: "auto",
                }}
                alt={name}
                src={portrait}
              />
            </span>
            <span className="column">{description}</span>
          </div>
        </div>
      }
      sx={{
        backgroundColor: "#445c66;",
        border: "1px solid #333",
        borderRadius: "10px",
        textOverflow: "ellipsis",
      }}>
      {props.children}
    </Tooltip>
  );
};

export default AssociationTooltip;
