import Person4Icon from "@mui/icons-material/Person4";
import { IconButton } from "@mui/material";
import { useState } from "react";
import styles from "./user-menu.module.css";
import { useFetchUserData } from "../../hooks/useFetchUserData";
import { useLoader } from "../../hooks/useLoader";

export const UserMenu = () => {
  const { userDetails, setIsLoggedIn, isLoggedIn } = useFetchUserData();
  const { setIsLoaderVisible } = useLoader();

  const [isOpen, setIsOpen] = useState(false);

  const signout = () => {
    setIsLoaderVisible(false);
    fetch("/logout", {
      method: "DELETE",
    })
      .then((response) => {
        if (response.ok) {
          //dispatch(setSelectedStory(null));
          setIsLoggedIn(true);
          const history = window.history;
          history.pushState({}, "", "/");
          return;
        }
        throw new Error("Fetch problem logout " + response.status);
      })
      .catch((error) => {
        console.error(error);
      });
  };

  const subscribe = () => {
    //dispatch(setIsSubscriptionFormOpen(true));
  };

  const showUserSettings = () => {
    // TO-DO
  };

  const showLoginPanel = () => {
    // TO-DO
  };

  const displayComponent = isLoggedIn ? (
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
          {userDetails && userDetails.subscription_id === "" && (
            <li onClick={subscribe}>Subscribe</li>
          )}
          <li onClick={showUserSettings}>Settings</li>
          <li onClick={signout}>Signout</li>
        </ul>
      )}
    </span>
  ) : (
    <a onClick={showLoginPanel}>Register / SignIn</a>
  );

  return <span className={styles.userMenu}>{displayComponent}</span>;
};
