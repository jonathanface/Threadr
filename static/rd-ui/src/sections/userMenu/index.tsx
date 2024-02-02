import Person4Icon from "@mui/icons-material/Person4";
import { IconButton } from "@mui/material";
import React, { useEffect, useState } from "react";
import { TypedUseSelectorHook, useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "../../stores/store";
import { setSelectedStory } from "../../stores/storiesSlice";
import { setIsLoaderVisible, setIsSubscriptionFormOpen } from "../../stores/uiSlice";
import { UserDetails, flipConfigPanelVisible, flipLoggedInState, flipLoginPanelVisible } from "../../stores/userSlice";
import styles from "./user-menu.module.css";

interface UserMenuProps {
  isLoggedIn: boolean;
  userDetails: UserDetails | null;
  isParentLoading: boolean;
}
const UserMenu = (props: UserMenuProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const useAppDispatch: () => AppDispatch = useDispatch;
  const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
  const dispatch = useAppDispatch();
  const isLoggedIn = useAppSelector((state) => state.user.isLoggedIn);
  const userDetails = useAppSelector((state) => state.user.userDetails);

  const showLoginPanel = () => {
    dispatch(flipLoginPanelVisible());
  };

  const showUserSettings = () => {
    dispatch(flipConfigPanelVisible());
  };

  useEffect(() => {}, [userDetails.subscription_id]);

  const signout = () => {
    dispatch(setIsLoaderVisible(false));
    fetch("/logout", {
      method: "DELETE",
    })
      .then((response) => {
        if (response.ok) {
          dispatch(setSelectedStory(null));
          dispatch(flipLoggedInState());
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
    dispatch(setIsSubscriptionFormOpen(true));
  };
  console.log("deets", userDetails);
  //
  const displayComponent = !props.isParentLoading ? (
    isLoggedIn ? (
      <span
        className={styles.menuContainer}
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}>
        <span className={styles.icon}>
          <IconButton size="small" sx={{ zIndex: 99 }} aria-label="user menu">
            <Person4Icon fontSize="small" />
          </IconButton>
        </span>
        {isOpen && (
          <ul>
            {userDetails && userDetails.subscription_id === "" && <li onClick={subscribe}>Subscribe</li>}
            <li onClick={showUserSettings}>Settings</li>
            <li onClick={signout}>Signout</li>
          </ul>
        )}
      </span>
    ) : (
      <a onClick={showLoginPanel}>Register / SignIn</a>
    )
  ) : (
    <div />
  );

  return <span className={styles.userMenu}>{displayComponent}</span>;
};

export default UserMenu;
