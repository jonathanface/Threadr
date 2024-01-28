import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import React from "react";
import "../../css/custom-context.css";

export interface MenuItemEntry {
  name: string;
  command?: Function;
  subItems?: MenuItemEntry[];
}

interface MenuItemProps {
  item: MenuItemEntry;
}

const MenuItem = (props: MenuItemProps) => {
  const handleClickAction = (item: MenuItemEntry, event: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => {
    event.stopPropagation();
    event.preventDefault();
    if (item.command) {
      item.command(event);
    }
  };

  const hasSubItems = props.item.subItems && props.item.subItems.length > 0;

  return (
    <li onMouseDown={(event) => event.preventDefault()} className={hasSubItems ? "menu-item has-submenu" : "menu-item"}>
      <a
        href="#"
        onClick={(event: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => handleClickAction(props.item, event)}>
        <span className="label">
          {props.item.name}
          {hasSubItems && <KeyboardArrowRightIcon />}
        </span>
      </a>
      {hasSubItems && (
        <ul className="submenu">
          {props.item.subItems?.map((subItem, index) => (
            <MenuItem key={index} item={subItem} />
          ))}
        </ul>
      )}
    </li>
  );
};

export default MenuItem;
