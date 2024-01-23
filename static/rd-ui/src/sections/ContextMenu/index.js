import React, { useEffect, useState } from "react";
import "../../css/custom-context.css";
import MenuItem from "./MenuItem";

const ContextMenu = (props) => {
  const [visible, setVisible] = useState(false);
  const [inlineStyle, setInlineStyle] = useState({
    display: "none",
    top: "0px",
    left: "0px",
  });

  useEffect(() => {
    if (props.visible !== visible) {
      setInlineStyle({
        display: "block",
        top: props.y.toString() + "px",
        left: props.x.toString() + "px",
      });
      if (!props.visible) {
        setInlineStyle({
          display: "none",
          top: "0px",
          left: "0px",
        });
      }
      setVisible(props.visible);
    }
  });

  return (
    <div className="custom-context" style={inlineStyle}>
      <ul className="menu">
        {props.items.map((item, index) => (
          <MenuItem key={index} item={item} />
        ))}
      </ul>
    </div>
  );
};

export default ContextMenu;
