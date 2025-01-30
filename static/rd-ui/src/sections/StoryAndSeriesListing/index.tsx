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

interface StoryAndSeriesListingProps {
  seriesList: Series[] | null;
  setSeriesList: (series: Series[]) => void
  storiesList: Story[] | null;
  setStoriesList: (series: Story[]) => void
}

export const StoryAndSeriesListing = (props: StoryAndSeriesListingProps) => {
  const userData = useContext(UserContext);
  const { setAlertState } = useToaster();

  useEffect(() => {
    if (
      props.seriesList &&
      !props.seriesList.length &&
      props.storiesList &&
      !props.storiesList.length
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
    props.storiesList,
    props.seriesList,
    props.storiesList?.length,
    props.seriesList?.length,
    setAlertState,
  ]);

  const createNewStory = () => {
    // setIsCreatingStory(true);
  };

  // If there are works, we prepare our series and stories components.
  const seriesComponents = props.seriesList?.map((series: Series) => {
    return <StoryBox key={series.series_id} data={series} storiesList={props.storiesList || []} seriesList={props.seriesList} setSeriesList={props.setSeriesList} setStoriesList={props.setStoriesList} />;
  });

  const storyComponents = props.storiesList?.map((story: Story) => {
    return <StoryBox key={story.story_id} data={story} storiesList={props.storiesList} seriesList={props.seriesList || []} setSeriesList={props.setSeriesList} setStoriesList={props.setStoriesList} />;
  });

  let content = <div />;
  if (props.seriesList?.length || props.storiesList?.length) {
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
