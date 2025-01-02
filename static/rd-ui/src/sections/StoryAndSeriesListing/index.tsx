import AddIcon from "@mui/icons-material/Add";
import { IconButton } from "@mui/material";
import React, { useEffect, useState } from "react";
import { TypedUseSelectorHook, useDispatch, useSelector } from "react-redux";
import { setAlert } from "../../stores/alertSlice";
import { setSeriesList } from "../../stores/seriesSlice";
import { AppDispatch, RootState } from "../../stores/store";
import {
  flipCreatingNewStory,
  setStandaloneList,
} from "../../stores/storiesSlice";
import { setIsLoaderVisible } from "../../stores/uiSlice";
import { StoryBox } from "../Story";
import styles from "./storyAndSeries.module.css";
import { AlertToast, AlertToastType } from "../../types/AlertToasts";
import { Series } from "../../types/Series";
import { Story } from "../../types/Story";

export const StoryAndSeriesListing = () => {
  const useAppDispatch: () => AppDispatch = useDispatch;
  const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
  const dispatch = useAppDispatch();
  const isLoggedIn = useAppSelector((state) => state.user.isLoggedIn);
  const userDetails = useAppSelector((state) => state.user.userDetails);
  const storiesList = useAppSelector((state) => state.stories.standaloneList);
  const seriesList = useAppSelector((state) => state.series.seriesList);

  const [seriesLoaded, setSeriesLoaded] = useState(false);
  const [storiesLoaded, setStoriesLoaded] = useState(false);

  useEffect(() => {
    dispatch(setIsLoaderVisible(true));

    const getSeries = async () => {
      try {
        const results = await fetch("/api/series", {
          credentials: "include",
        });
        if (!results.ok) {
          throw new Error("Fetch problem stories" + results.statusText);
        }

        const json = await results.json();

        const userSeries: Series[] = [];
        for (const key in json) {
          if (Object.prototype.hasOwnProperty.call(json, key)) {
            if (key === userDetails.email && json[key]) {
              userSeries.push(...json[key]);
            }
          }
        }

        dispatch(setSeriesList(userSeries));
        setSeriesLoaded(true);
      } catch (error: unknown) {
        console.error(error);
      }
    };

    const getStories = async () => {
      try {
        const results = await fetch("/api/stories", {
          credentials: "include",
        });
        if (!results.ok) {
          throw new Error("Fetch problem stories" + results.statusText);
        }
        const json = await results.json();
        const userStories: Story[] = [];
        for (const key in json) {
          if (Object.prototype.hasOwnProperty.call(json, key)) {
            if (key === userDetails.email && json[key]) {
              userStories.push(...json[key]);
            }
          }
        }
        dispatch(setStandaloneList(userStories));
        setStoriesLoaded(true);
      } catch (error: unknown) {
        console.error(error);
      }
    };

    if (isLoggedIn) {
      if (!seriesLoaded) {
        getSeries();
      } else if (!storiesLoaded) {
        getStories();
      } else {
        dispatch(setIsLoaderVisible(false));
        if (!seriesList.length && !storiesList.length) {
          const newAlert: AlertToast = {
            title: "The Docter is In",
            message:
              "...but you haven't created any stories yet. Hit the big plus button to make one.",
            open: true,
            severity: AlertToastType.info,
            timeout: undefined,
          };
          dispatch(setAlert(newAlert));
        }
      }
    }
  }, [
    isLoggedIn,
    dispatch,
    seriesLoaded,
    storiesLoaded,
    storiesList.length,
    seriesList.length,
    userDetails.email,
  ]);

  const createNewStory = () => {
    dispatch(flipCreatingNewStory(true));
  };

  // If there are works, we prepare our series and stories components.
  const seriesComponents = seriesList.map((series: Series) => {
    return <StoryBox key={series.series_id} data={series} />;
  });

  const storyComponents = storiesList.map((story: Story) => {
    return <StoryBox key={story.story_id} data={story} />;
  });

  let content = <div />;
  if (
    seriesLoaded &&
    storiesLoaded &&
    (seriesList.length || storiesList.length)
  ) {
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
