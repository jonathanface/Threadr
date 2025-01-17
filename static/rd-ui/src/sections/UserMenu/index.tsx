import Person4Icon from "@mui/icons-material/Person4";
import { IconButton } from "@mui/material";
import { useContext, useState } from "react";
import styles from "./user-menu.module.css";
import { useLoader } from "../../hooks/useLoader";
import { UserContext } from "../../contexts/user";
import { useAppNavigation } from "../../hooks/useAppNavigation";
import { useCurrentSelections } from "../../hooks/useCurrentSelections";

export const UserMenu = () => {
  const userData = useContext(UserContext);
  const { setIsLoaderVisible } = useLoader();

  const [isOpen, setIsOpen] = useState(false);
  const { setIsLoginPanelOpen, setIsConfigPanelOpen, setIsSubscriptionFormOpen } = useAppNavigation();
  const selectionsData = useCurrentSelections();

  const signout = () => {
    setIsLoaderVisible(false);
    fetch("/logout", {
      method: "DELETE",
    })
      .then((response) => {
        if (response.ok) {
          selectionsData.setCurrentStory(undefined);
          selectionsData.setCurrentSeries(undefined);
          userData?.setIsLoggedIn(true);
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
    setIsSubscriptionFormOpen(true);
  };

  const showUserSettings = () => {
    setIsConfigPanelOpen(true);
  };

  const showLoginPanel = () => {
    setIsLoginPanelOpen(true);
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
          {userData?.userDetails?.subscription_id === "" && (
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
