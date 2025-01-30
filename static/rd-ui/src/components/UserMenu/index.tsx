import Person4Icon from "@mui/icons-material/Person4";
import { IconButton } from "@mui/material";
import { useContext, useState } from "react";
import styles from "./user-menu.module.css";
import { useLoader } from "../../hooks/useLoader";
import { UserContext } from "../../contexts/user";

export const UserMenu = () => {
  const userData = useContext(UserContext);
  const { showLoader, hideLoader } = useLoader();

  const [isOpen, setIsOpen] = useState(false);

  const signout = async () => {
    showLoader();
    try {
      const response = await fetch("/logout", {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(`Unable to logout: ${response.status}`);
      }
    } catch (error) {
      console.error(error);
    } finally {
      hideLoader();
    }
  };

  const displayComponent = userData?.isLoggedIn ? (
    <span
      className={styles.menuContainer}
      onClick={() => setIsOpen(!isOpen)}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <span className={styles.icon}>
        <IconButton size="small" sx={{ zIndex: 99 }} aria-label="user menu">
          <Person4Icon fontSize="small" />
        </IconButton>
      </span>
      {isOpen && (
        <ul>
          {/* {userData?.userDetails?.subscription_id === "" && (
            <li onClick={subscribe}>Subscribe</li>
          )}
          <li onClick={showUserSettings}>Settings</li> */}
          <li onClick={signout}>Signout</li>
        </ul>
      )}
    </span>
  ) : (
    <a>Register / SignIn</a>
  );

  return <span className={styles.userMenu}>{displayComponent}</span>;
};
