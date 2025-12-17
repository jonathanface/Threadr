import AddIcon from "@mui/icons-material/Add";
import { IconButton, Tooltip } from "@mui/material";
import React, { useContext, useEffect } from "react";
import { StoryBox } from "../../components/StoryBox";
import styles from "./storyAndSeries.module.css";
import { Series } from "../../types/Series";
import { Story } from "../../types/Story";
import { UserContext } from "../../contexts/user";
import { useWorksList } from "../../hooks/useWorksList";
import { useNavigate } from "react-router-dom";
import { SeriesBox } from "../../components/SeriesBox";
import { useSelections } from "../../hooks/useSelections";
import { WelcomeModal } from "../Welcome";
import { useFetchUserData } from "../../hooks/useFetchUserData";


export const StoryAndSeriesListing = () => {
  const userData = useContext(UserContext);
  const navigate = useNavigate();
  const { userDetails, clearWelcomeFlags } = useFetchUserData();

  const { seriesList, storiesList } = useWorksList();
  const { deselectAll } = useSelections();

  const showWelcome = userDetails?.showWelcome || userDetails?.isReturningUser || false;
  const isReturningUser = userDetails?.isReturningUser || false;
  const isNewUser = userDetails?.showWelcome && !userDetails?.isReturningUser;

  console.log('StoryAndSeriesListing render:', {
    showWelcome,
    isReturningUser,
    isNewUser,
    userDetails
  });

  const handleCloseWelcome = () => {
    console.log('handleCloseWelcome called');
    clearWelcomeFlags();
  };

  useEffect(() => {
    // Deselect all on mount
    deselectAll();
  }, [deselectAll]);

  const createNewStory = () => {
    navigate('/stories/new');
  };

  // If there are works, we prepare our series and stories components.
  const seriesComponents = seriesList?.map((series: Series) => {
    return <SeriesBox key={series.series_id} series={series} />;
  });

  const storyComponents = storiesList?.map((story: Story) => {
    return <StoryBox key={story.story_id} story={story} />;
  });

  const hasNoContent = (!seriesList || seriesList.length === 0) && (!storiesList || storiesList.length === 0);

  let content = <div />;
  if (seriesList?.length || storiesList?.length) {
    content = (
      <React.Fragment>
        {seriesComponents}
        {storyComponents}
      </React.Fragment>
    );
  }

  return (
    <>
      <WelcomeModal
        open={showWelcome}
        isReturningUser={isReturningUser}
        onClose={handleCloseWelcome}
      />
      <div className={styles.listingPage}>
        <div className={styles.btnContainer}></div>
        {userData?.isLoggedIn ? (
          <div>
            <h2>Stories</h2>
            <div className={styles.iconBox}>
              <span className={`${styles.createStoryButton} ${isNewUser ? styles.pulse : ''}`}>
                <Tooltip title="Create Story" placement="top">
                  <IconButton
                    aria-label="add new story"
                    sx={{
                      margin: "0 auto",
                      ...(isNewUser && {
                        animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                        '@keyframes pulse': {
                          '0%, 100%': {
                            opacity: 1,
                          },
                          '50%': {
                            opacity: 0.7,
                          },
                        },
                      }),
                    }}
                    component="label"
                    onClick={createNewStory}
                  >
                    <AddIcon
                      sx={{
                        color: "#F0F0F0",
                        fontSize: 100,
                        "&:hover": {
                          fontWeight: "bold",
                          color: "#2a57e3",
                        },
                        ...(isNewUser && {
                          filter: 'drop-shadow(0 0 20px rgba(42, 87, 227, 0.6))',
                        }),
                      }}
                    />
                  </IconButton>
                </Tooltip>
                {hasNoContent && (
                  <div className={styles.emptyStateInline}>
                    <h3>No Stories Yet</h3>
                    <p>
                      Click the plus button to start writing your first story!
                    </p>
                  </div>
                )}
              </span>
              {content}
            </div>
          </div>
        ) : (
          ""
        )}
        <div className={styles.logoContainer}>
          <img
            alt="RichDocter logo"
            title="RichDocter - Organized Imagination"
            src="/img/logo_trans_scaled.png"
          />
        </div>
      </div>
    </>
  );
};
