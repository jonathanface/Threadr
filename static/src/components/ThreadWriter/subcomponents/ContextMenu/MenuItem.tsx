import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import React, { useEffect, useRef } from "react";
import styles from "./custom-context.module.css";
import { MenuItemEntry } from "../../../../types/MenuItemEntry";

interface MenuItemProps {
  item: MenuItemEntry;
  focused?: boolean;
}

export const MenuItem = (props: MenuItemProps) => {
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (props.focused) {
      buttonRef.current?.focus();
    }
  }, [props.focused]);

  const handleClickAction = (
    item: MenuItemEntry,
    event: React.MouseEvent<HTMLButtonElement, MouseEvent>,
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
      role="menuitem"
      onMouseDown={(event) => event.preventDefault()}
      className={
        hasSubItems
          ? styles.menuItem + " " + styles.hasSubmenu
          : styles.menuItem
      }
    >
      <button
        ref={buttonRef}
        type="button"
        className={`${styles.menuButton} ${props.focused ? styles.focused : ""}`}
        onClick={(event: React.MouseEvent<HTMLButtonElement, MouseEvent>) =>
          handleClickAction(props.item, event)
        }
      >
        <span className={styles.label}>
          {props.item.name}
          {hasSubItems && <KeyboardArrowRightIcon />}
        </span>
      </button>
      {hasSubItems && (
        <ul className={styles.submenu} role="menu">
          {props.item.subItems?.map((subItem, index) => (
            <MenuItem key={index} item={subItem} />
          ))}
        </ul>
      )}
    </li>
  );
};
