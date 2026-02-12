import Person4Icon from "@mui/icons-material/Person4";
import { IconButton } from "@mui/material";
import { useContext, useState } from "react";
import styles from "./user-menu.module.css";
import { useLoader } from "../../hooks/useLoader";
import { UserContext } from "../../contexts/user";
import { useNavigate } from "react-router-dom";
import { useFetchUserData } from "../../hooks/useFetchUserData";
import { api } from "../../api";
import axios from "axios";
import { useSelections } from "../../hooks/useSelections";

export const UserMenu = () => {
  const userData = useContext(UserContext);
  const { showLoader, hideLoader } = useLoader();
  const { setIsLoggedIn } = useFetchUserData();
  const { setStory } = useSelections();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);

  const signout = async () => {
    showLoader();
    try {
      await api.delete("/auth/logout", { baseURL: "" });

      setIsLoggedIn(false);
      navigate("/");
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(
          `Unable to logout: ${error.response?.status} ${error.message}`,
        );
      } else {
        console.error(error);
      }
    } finally {
      setStory(undefined);
      hideLoader();
    }
  };

  const showLoginPanel = () => {
    navigate("/signin");
  };

  const showSettingsPanel = () => {
    navigate("/account/subscription");
  };

  const showAdminPanel = () => {
    navigate("/admin");
  };

  const isAdmin = userData?.userDetails?.admin ?? false;

  const displayComponent = userData?.isLoggedIn ? (
    <span
      className={styles.menuContainer}
      onClick={() => setIsOpen(!isOpen)}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <span className={styles.icon}>
        <IconButton
          size="small"
          sx={{
            zIndex: 99,
            padding: 0,
            color: "#1a1a1a",
            "&:hover": {
              backgroundColor: "transparent",
            },
          }}
          aria-label="user menu"
        >
          <Person4Icon sx={{ fontSize: 18 }} />
        </IconButton>
      </span>
      {isOpen && (
        <ul>
          {isAdmin && <li onClick={showAdminPanel}>Admin</li>}
          <li onClick={showSettingsPanel}>Account</li>
          <li onClick={signout}>Signout</li>
        </ul>
      )}
    </span>
  ) : window.location.pathname === "/signin" ? (
    ""
  ) : (
    <a onClick={showLoginPanel}>Register / SignIn</a>
  );

  return <span className={styles.userMenu}>{displayComponent}</span>;
};
