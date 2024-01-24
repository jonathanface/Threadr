import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import React from "react";
import "../../css/custom-context.css";

const MenuItem = (props) => {
  const handleClickAction = (item, event) => {
    event.stopPropagation();
    event.preventDefault();
    if (item.command) {
      item.command(event);
    }
  };
  const hasSubItems = props.item.subItems && props.item.subItems.length > 0;
  return (
    <li onMouseDown={(event) => event.preventDefault()} className={hasSubItems ? "menu-item has-submenu" : "menu-item"}>
      <a href="#" onClick={(event) => handleClickAction(props.item, event)}>
        <span className="label">
          {props.item.name}
          {hasSubItems && <KeyboardArrowRightIcon />}
        </span>
      </a>
      {hasSubItems && (
        <ul className="submenu">
          {props.item.subItems.map((subItem, index) => (
            <MenuItem key={index} item={subItem} />
          ))}
        </ul>
      )}
    </li>
  );
};

export default MenuItem;
