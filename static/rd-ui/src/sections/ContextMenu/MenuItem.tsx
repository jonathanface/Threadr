import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import React from "react";
import styles from "./custom-context.module.css";
import { MenuItemEntry } from "../../types/MenuItemEntry";

interface MenuItemProps {
  item: MenuItemEntry;
}

export const MenuItem = (props: MenuItemProps) => {
  const handleClickAction = (
    item: MenuItemEntry,
    event: React.MouseEvent<HTMLAnchorElement, MouseEvent>
  ) => {
    event.stopPropagation();
    event.preventDefault();
    if (item.command) {
      item.command(event);
    }
  };

  const hasSubItems = props.item.subItems && props.item.subItems.length > 0;

  return (
    <li
      onMouseDown={(event) => event.preventDefault()}
      className={
        hasSubItems
          ? styles.menuItem + " " + styles.hasSubmenu
          : styles.menuItem
      }
    >
      <a
        href="#"
        onClick={(event: React.MouseEvent<HTMLAnchorElement, MouseEvent>) =>
          handleClickAction(props.item, event)
        }
      >
        <span className={styles.label}>
          {props.item.name}
          {hasSubItems && <KeyboardArrowRightIcon />}
        </span>
      </a>
      {hasSubItems && (
        <ul className={styles.submenu}>
          {props.item.subItems?.map((subItem, index) => (
            <MenuItem key={index} item={subItem} />
          ))}
        </ul>
      )}
    </li>
  );
};
