import React, { useEffect, useState } from "react";
import MenuItem, { MenuItemEntry } from "./MenuItem";
import styles from "./custom-context.module.css";

interface ContextMenuProps {
  name: string;
  visible: boolean;
  y: number;
  x: number;
  items: MenuItemEntry[];
}

const ContextMenu = (props: ContextMenuProps) => {
  const [visible, setVisible] = useState(false);
  const [inlineStyle, setInlineStyle] = useState({
    display: "none",
    top: "0px",
    left: "0px",
  });

  useEffect(() => {
    if (props.visible !== visible) {
      if (props.visible) {
        setInlineStyle({
          display: "block",
          top: props.y.toString() + "px",
          left: props.x.toString() + "px",
        });
      } else {
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
    <div className={styles.customContext} style={inlineStyle}>
      <ul className={styles.menu}>
        {props.items.map((item, index) => (
          <MenuItem key={index} item={item} />
        ))}
      </ul>
    </div>
  );
};

export default ContextMenu;
