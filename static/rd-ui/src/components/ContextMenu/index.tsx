import { useEffect, useState } from "react";
import { MenuItem } from "./MenuItem";
import styles from "./custom-context.module.css";
import { MenuItemEntry } from "../../types/MenuItemEntry";

export interface ContextMenuProps {
  name: string;
  visible: boolean;
  y: number;
  x: number;
  items: MenuItemEntry[];
}

export const ContextMenu = (props: ContextMenuProps) => {
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
  }, [props]);

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
