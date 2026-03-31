import { useCallback, useContext, useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { api } from "../../api";
import { UserContext } from "../../contexts/user";
import { useLoader } from "../../hooks/useLoader";
import styles from "./adminarea.module.css";

interface AdminStoryInfo {
  title: string;
  series_title?: string;
}

interface AdminUserSummary {
  email: string;
  first_name: string;
  last_name: string;
  subscriber: boolean;
  last_accessed: number;
  stories: AdminStoryInfo[];
}

export const AdminArea = () => {
  const userContext = useContext(UserContext);
  const { showLoader, hideLoader } = useLoader();
  const navigate = useNavigate();
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = userContext?.userDetails?.admin ?? false;

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/stories");
    }
  };

  const fetchUsers = useCallback(async () => {
    if (!isAdmin) return;
    try {
      showLoader();
      const response = await api.get<AdminUserSummary[]>("/admin/users");
      setUsers(response.data);
    } catch {
      setError("Failed to load users");
    } finally {
      hideLoader();
    }
  }, [isAdmin, showLoader, hideLoader]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleDeleteUser = async (email: string, name: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete the account for ${name || email}? This will soft-delete the user and all their stories.`
    );
    if (!confirmed) return;

    try {
      await api.delete(`/admin/users/${encodeURIComponent(email)}`);
      fetchUsers();
    } catch {
      setError(`Failed to delete user ${email}`);
    }
  };

  // Redirect non-admins
  if (!isAdmin) {
    return <Navigate to="/stories" replace />;
  }

  const formatDate = (timestamp: number) => {
    if (!timestamp) return "Never";
    return new Date(timestamp * 1000).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className={styles.adminArea}>
      <button
        className={styles.closeButton}
        onClick={handleBack}
        aria-label="Go back"
      >
        &times;
      </button>
      <h1>Admin Area</h1>
      <p className={styles.subtitle}>User Management</p>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.tableContainer}>
        <table className={styles.usersTable}>
          <thead>
            <tr>
              <th>User</th>
              <th>Email</th>
              <th>Subscriber</th>
              <th>Last Accessed</th>
              <th>Stories</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.email}>
                <td>
                  {user.first_name || user.last_name
                    ? `${user.first_name} ${user.last_name}`.trim()
                    : "-"}
                </td>
                <td>{user.email}</td>
                <td>
                  <span
                    className={
                      user.subscriber ? styles.subscriberYes : styles.subscriberNo
                    }
                  >
                    {user.subscriber ? "Yes" : "No"}
                  </span>
                </td>
                <td>{formatDate(user.last_accessed)}</td>
                <td>
                  {user.stories && user.stories.length > 0 ? (
                    <ul className={styles.storyList}>
                      {user.stories.map((story, idx) => (
                        <li key={idx}>
                          {story.title}
                          {story.series_title && (
                            <span className={styles.seriesTag}>
                              {story.series_title}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className={styles.noStories}>No stories</span>
                  )}
                </td>
                <td>
                  <button
                    className={styles.deleteButton}
                    onClick={() =>
                      handleDeleteUser(
                        user.email,
                        `${user.first_name} ${user.last_name}`.trim()
                      )
                    }
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {users.length === 0 && !error && (
        <p className={styles.emptyState}>No users found</p>
      )}
    </div>
  );
};
