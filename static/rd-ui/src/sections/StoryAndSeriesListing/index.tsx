import AddIcon from "@mui/icons-material/Add";
import { IconButton } from "@mui/material";
import React, { useContext, useEffect } from "react";
import { StoryBox } from "../../components/StoryBox";
import styles from "./storyAndSeries.module.css";
import { Series } from "../../types/Series";
import { Story } from "../../types/Story";
import { useToaster } from "../../hooks/useToaster";
import { AlertToastType } from "../../types/AlertToasts";
import { UserContext } from "../../contexts/user";
import { useWorksList } from "../../hooks/useWorksList";
import { useNavigate } from "react-router-dom";


export const StoryAndSeriesListing = () => {
  const userData = useContext(UserContext);
  const { setAlertState } = useToaster();
  const navigate = useNavigate();

  const { seriesList, storiesList } = useWorksList();

  useEffect(() => {
    if (
      seriesList &&
      !seriesList.length &&
      storiesList &&
      !storiesList.length
    ) {
      setAlertState({
        title: "The Docter is In",
        message:
          "...but you haven't created any stories yet. Hit the big plus button to make one.",
        open: true,
        severity: AlertToastType.info,
        timeout: undefined,
      });
    }
  }, [
    storiesList,
    seriesList,
    storiesList?.length,
    seriesList?.length,
    setAlertState,
  ]);

  const createNewStory = () => {
    navigate('/stories/new');
  };

  // If there are works, we prepare our series and stories components.
  const seriesComponents = seriesList?.map((series: Series) => {
    return <StoryBox key={series.series_id} itemData={series} />;
  });

  const storyComponents = storiesList?.map((story: Story) => {
    return <StoryBox key={story.story_id} itemData={story} />;
  });

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

    <div className={styles.listingPage}>
      <div className={styles.btnContainer}></div>
      {userData?.isLoggedIn ? (
        <div>
          <h2>Stories</h2>
          <div className={styles.iconBox}>
            <span className={styles.createStoryButton}>
              <IconButton
                aria-label="add new story"
                sx={{ margin: "0 auto" }}
                component="label"
                onClick={createNewStory}
                title="Create Story"
              >
                <AddIcon
                  sx={{
                    color: "#F0F0F0",
                    fontSize: 100,
                    "&:hover": {
                      fontWeight: "bold",
                      color: "#2a57e3",
                    },
                  }}
                />
              </IconButton>
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
  );
};
