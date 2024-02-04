import AddIcon from "@mui/icons-material/Add";
import { IconButton } from "@mui/material";
import React, { useEffect, useState } from "react";
import { TypedUseSelectorHook, useDispatch, useSelector } from "react-redux";
import { setSeriesList } from "../../stores/seriesSlice";
import { AppDispatch, RootState } from "../../stores/store";
import { flipCreatingNewStory, setStandaloneList } from "../../stores/storiesSlice";
import { setIsLoaderVisible } from "../../stores/uiSlice";
import { Series, Story } from "../../types";
import StoryBox from "../Story";
import styles from "./storyAndSeries.module.css";

const StoryAndSeriesListing = () => {
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
        for (let key in json) {
          if (json.hasOwnProperty(key)) {
            if (key === userDetails.email && json[key]) {
              userSeries.push(...json[key]);
            }
          }
        }

        dispatch(setSeriesList(userSeries));
        setSeriesLoaded(true);
      } catch (error: any) {}
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
        for (let key in json) {
          if (json.hasOwnProperty(key)) {
            if (key === userDetails.email && json[key]) {
              userStories.push(...json[key]);
            }
          }
        }
        dispatch(setStandaloneList(userStories));
        setStoriesLoaded(true);
      } catch (error: any) {
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
      }
    }
  }, [isLoggedIn, dispatch, seriesLoaded, storiesLoaded]);

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
  if (seriesLoaded && storiesLoaded && (seriesList.length || storiesList.length)) {
    content = (
      <React.Fragment>
        {seriesComponents}
        {storyComponents}
      </React.Fragment>
    );
  } else if (seriesLoaded && storiesLoaded) {
    content = (
      <h3>
        You haven't created any stories yet.
        <br />
        Click the ridiculously oversized plus button to create your first work.
      </h3>
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
                title="Create Story">
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
        <img alt="RichDocter logo" title="RichDocter - Organized Imagination" src="img/logo_trans_scaled.png" />
      </div>
    </div>
  );
};

export default StoryAndSeriesListing;
