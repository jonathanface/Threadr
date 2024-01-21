import React, { useEffect, useState } from "react";
import "../../css/custom-context.css";

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
      <ul>
        <li>Copy</li>
        <li>
          <ul>
            <li>
              Create Association
              <ul>
                <li>Character</li>
                <li>Location</li>
                <li>Event</li>
              </ul>
            </li>
          </ul>
        </li>
      </ul>
    </div>
  );
};

export default ContextMenu;
