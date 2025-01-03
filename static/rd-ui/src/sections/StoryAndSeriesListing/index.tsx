import AddIcon from "@mui/icons-material/Add";
import { IconButton } from "@mui/material";
import React, { useEffect } from "react";
import { StoryBox } from "../Story";
import styles from "./storyAndSeries.module.css";
import { Series } from "../../types/Series";
import { Story } from "../../types/Story";
import { useFetchSeriesList } from "../../hooks/useFetchSeriesList";
import { useFetchStoriesList } from "../../hooks/useFetchStoriesList";
import { useFetchUserData } from "../../hooks/useFetchUserData";
import { useLoader } from "../../hooks/useLoader";
import { useToaster } from "../../hooks/useToaster";
import { AlertToastType } from "../../types/AlertToasts";

export const StoryAndSeriesListing = () => {
  const { isLoggedIn } = useFetchUserData();
  const { storiesList } = useFetchStoriesList();
  const { seriesList } = useFetchSeriesList();
  const { setIsLoaderVisible } = useLoader();
  const { setAlertState } = useToaster();

  useEffect(() => {
    setIsLoaderVisible(true);
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
  }, [storiesList, seriesList, storiesList?.length, seriesList?.length]);

  const createNewStory = () => {
    //dispatch(flipCreatingNewStory(true));
  };

  // If there are works, we prepare our series and stories components.
  const seriesComponents = seriesList?.map((series: Series) => {
    return <StoryBox key={series.series_id} data={series} />;
  });

  const storyComponents = storiesList?.map((story: Story) => {
    return <StoryBox key={story.story_id} data={story} />;
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
      {isLoggedIn ? (
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
