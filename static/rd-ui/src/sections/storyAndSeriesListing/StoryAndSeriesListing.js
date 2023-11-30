import AddIcon from "@mui/icons-material/Add";
import { IconButton } from "@mui/material";
import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import "../../css/landing-page.css";
import { setSeriesList } from "../../stores/seriesSlice";
import { flipCreatingNewStory, setStandaloneList } from "../../stores/storiesSlice";
import { setIsLoaderVisible } from "../../stores/uiSlice";
import Story from "../story/Story";

const StoryAndSeriesListing = () => {
  const isLoggedIn = useSelector((state) => state.user.isLoggedIn);
  const userDetails = useSelector((state) => state.user.userDetails);
  const storiesList = useSelector((state) => state.stories.standaloneList);
  const seriesList = useSelector((state) => state.series.seriesList);
  const [othersList, setOthersList] = useState([]);

  const dispatch = useDispatch();
  const [seriesLoaded, setSeriesLoaded] = useState(false);
  const [storiesLoaded, setStoriesLoaded] = useState(false);

  useEffect(() => {
    dispatch(setIsLoaderVisible(true));
    const getSeries = () => {
      fetch("/api/series")
        .then((response) => {
          if (response.ok) {
            return response.json();
          }
          throw new Error("Fetch problem series " + response.status);
        })
        .then((data) => {
          const userSeries = [];
          const otherSeries = [];
          for (let key in data) {
            if (data.hasOwnProperty(key)) {
              if (key === userDetails.email && data[key]) {
                const seriesStoriesFromDB = data[key].map((series) => {
                  const seriesObj = {
                    series_id: series.series_id,
                    series_title: series.series_title,
                    series_description: series.series_description,
                    stories: [],
                    image_url: series.image_url.length ? series.image_url : "/img/icons/story_series_icon.jpg",
                  };
                  if (series.stories) {
                    series.stories.forEach((story) => {
                      seriesObj.stories.push({
                        story_id: story.story_id,
                        series_id: series.series_id,
                        title: story.title,
                        place: story.place,
                        created_at: story.created_at,
                        description: story.description,
                        image_url: story.image_url.length ? story.image_url : "/img/icons/story_standalone_icon.jpg",
                      });
                    });
                  }
                  return seriesObj;
                });
                userSeries.push(...seriesStoriesFromDB);
              } else {
                const seriesStoriesFromDB = data[key].map((series) => {
                  const seriesObj = {
                    author: key,
                    series_id: series.series_id,
                    series_title: series.series_title,
                    series_description: series.series_description,
                    stories: [],
                    image_url: series.image_url.length ? series.image_url : "/img/icons/story_series_icon.jpg",
                  };
                  if (series.stories) {
                    series.stories.forEach((story) => {
                      seriesObj.stories.push({
                        story_id: story.story_id,
                        series_id: series.series_id,
                        title: story.title,
                        place: story.place,
                        created_at: story.created_at,
                        description: story.description,
                        image_url: story.image_url.length ? story.image_url : "/img/icons/story_standalone_icon.jpg",
                      });
                    });
                  }
                  return seriesObj;
                });
                otherSeries.push(...seriesStoriesFromDB);
              }
            }
          }
          setOthersList((othersList) => [...othersList, ...otherSeries]);
          dispatch(setSeriesList(userSeries));
          setSeriesLoaded(true);
        });
    };

    const getStories = () => {
      fetch("/api/stories")
        .then((response) => {
          if (response.ok) {
            return response.json();
          }
          throw new Error("Fetch problem stories " + response.status);
        })
        .then((data) => {
          const userStories = [];
          const otherStories = [];
          for (let key in data) {
            if (data.hasOwnProperty(key)) {
              // Check to avoid inherited properties
              console.log(key, userDetails);

              if (key === userDetails.email && data[key]) {
                const storiesFromDB = data[key].map((story) => {
                  const img = story.image_url.length ? story.image_url : "/img/icons/story_standalone_icon.jpg";
                  return {
                    story_id: story.story_id,
                    title: story.title,
                    description: story.description,
                    image_url: img,
                    created_at: story.created_at,
                    chapter: story.chapters,
                  };
                });
                userStories.push(...storiesFromDB);
              } else {
                const storiesFromDB = data[key].map((story) => {
                  const img = story.image_url.length ? story.image_url : "/img/icons/story_standalone_icon.jpg";
                  return {
                    author: key,
                    story_id: story.story_id,
                    title: story.title,
                    description: story.description,
                    image_url: img,
                    created_at: story.created_at,
                    chapter: story.chapters,
                  };
                });
                otherStories.push(...storiesFromDB);
              }
            }
          }
          setOthersList((othersList) => [...othersList, ...otherStories]);
          dispatch(setStandaloneList(userStories));
          setStoriesLoaded(true);
        });
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
    dispatch(flipCreatingNewStory());
  };

  // If there are works, we prepare our series and stories components.
  const seriesComponents = seriesList.map((series) => {
    return (
      <Story
        key={series.series_id}
        id={series.series_id}
        title={series.series_title}
        description={series.series_description}
        stories={series.stories}
        image_url={series.image_url}
      />
    );
  });

  const storyComponents = storiesList.map((story) => {
    return (
      <Story
        key={story.story_id}
        id={story.story_id}
        title={story.title}
        description={story.description}
        image_url={story.image_url}
      />
    );
  });

  const othersMap = new Map();
  othersList.forEach((story) => {
    // Check if the author already exists in the map
    if (!othersMap.has(story.author)) {
      othersMap.set(story.author, []);
    }

    // Append the Story component to the author's array
    const stories = othersMap.get(story.author);
    if (story.stories) {
      const element = (
        <Story
          key={story.series_id}
          id={story.series_id}
          title={story.series_title}
          description={story.series_description}
          stories={story.stories}
          image_url={story.image_url}
        />
      );
      stories.push(element);
    } else {
      const element = (
        <Story
          key={story.story_id}
          id={story.story_id}
          title={story.title}
          description={story.description}
          image_url={story.image_url}
        />
      );
      stories.push(element);
    }
  });

  // Now create the final components array
  const otherComponents = [];
  othersMap.forEach((stories, author) => {
    otherComponents.push(
      <div key={author}>
        <hr />
        <p>From: {author}</p>
        {stories}
      </div>
    );
  });

  let content = <div />;
  if (seriesLoaded && storiesLoaded && (seriesList.length || storiesList.length)) {
    content = (
      <React.Fragment>
        {seriesComponents}
        {storyComponents}
        {userDetails.admin && <div className="other-stories">{otherComponents}</div>}
      </React.Fragment>
    );
  } else if (seriesLoaded && storiesLoaded) {
    content = (
      <h3>
        You haven't created any stories yet.
        <br />← Click the ridiculously oversized plus button over there to get started.
      </h3>
    );
  }

  return (
    <div className="landing-page">
      <div className="btn-container"></div>
      {isLoggedIn ? (
        <div>
          <div className="greeting">
            <div>
              <h3>Welcome to the RichDocter beta release.</h3>
            </div>
            <div>
              <h4>
                As this application is still under development, making regular offline backup of your work is highly
                recommended.
              </h4>
            </div>
            <div>
              <h4>
                Please send any bugs, feedback, or glowing praise to{" "}
                <a href="mailto:support@docter.io">support@docter.io</a>
              </h4>
            </div>
          </div>
          <h2>Stories</h2>
          <div className="icon-box">
            <span className="create-story-button">
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
    </div>
  );
};

export default StoryAndSeriesListing;
