import AddIcon from '@mui/icons-material/Add';
import { IconButton } from '@mui/material';
import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import '../../css/landing-page.css';
import { setSeriesList } from '../../stores/seriesSlice';
import { flipCreatingNewStory, setStandaloneList } from '../../stores/storiesSlice';
import { setIsLoaderVisible } from '../../stores/uiSlice';
import Story from '../story/Story';

const StoryAndSeriesListing = () => {
  const isLoggedIn = useSelector((state) => state.user.isLoggedIn);
  const storiesList = useSelector((state) => state.stories.standaloneList);
  const seriesList = useSelector((state) => state.series.seriesList);
  const dispatch = useDispatch();
  const [seriesLoaded, setSeriesLoaded] = useState(false);
  const [storiesLoaded, setStoriesLoaded] = useState(false);

  useEffect(() => {
    dispatch(setIsLoaderVisible(true));
    const getSeries = () => {
      fetch('/api/series').then((response) => {
        if (response.ok) {
          return response.json();
        }
        throw new Error('Fetch problem series ' + response.status);
      }).then((data) => {
        const seriesStoriesFromDB = data.map((series) => {
          const seriesObj = {
            series_id: series.series_id,
            series_title: series.series_title,
            series_description: series.series_description,
            stories: [],
            image_url: series.image_url.length ? series.image_url : '/img/icons/story_series_icon.jpg',
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
                image_url: story.image_url.length ? story.image_url : '/img/icons/story_standalone_icon.jpg'
              });
            });
          }
          return seriesObj;
        });
        dispatch(setSeriesList(seriesStoriesFromDB));
        setSeriesLoaded(true);
      });
    };

    const getStories = () => {
      fetch('/api/stories').then((response) => {
        if (response.ok) {
          return response.json();
        }
        throw new Error('Fetch problem stories ' + response.status);
      }).then((data) => {
        const storiesFromDB = data.map((story) => {
          const img = story.image_url.length ? story.image_url : '/img/icons/story_standalone_icon.jpg';
          return {
            story_id: story.story_id,
            title: story.title,
            description: story.description,
            image_url: img,
            created_at: story.created_at,
            chapter: story.chapters
          };
        });
        dispatch(setStandaloneList(storiesFromDB));
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
    return <Story key={series.series_id} id={series.series_id} title={series.series_title} description={series.series_description} stories={series.stories} image_url={series.image_url} />;
  });

  const storyComponents = storiesList.map((story) => {
    return <Story key={story.story_id} id={story.story_id} title={story.title} description={story.description} image_url={story.image_url} />;
  });
  let content = <div/>;
  if (seriesLoaded && storiesLoaded && (seriesList.length || storiesList.length)) {
    content = (
      <React.Fragment>
        {seriesComponents}
        {storyComponents}
      </React.Fragment>
    );
  } else if (seriesLoaded && storiesLoaded) {
    content = <h3>You haven't created any stories yet.<br/>← Click the ridiculously oversized plus button over there to get started.</h3>;
  }


  return (
    <div className="landing-page">
      <div className="btn-container"></div>
      {isLoggedIn ?
        <div>
          <h2>Stories</h2>
          <div className="icon-box">
            <span className="create-story-button">
              <IconButton aria-label="add new story" sx={{margin: '0 auto'}} component="label" onClick={createNewStory} title="Create Story">
                <AddIcon sx={{
                  'color': '#F0F0F0',
                  'fontSize': 100,
                  '&:hover': {
                    fontWeight: 'bold',
                    color: '#2a57e3',
                  }
                }}/>
              </IconButton>
            </span>
            {content}
          </div>
        </div>: ''}
    </div>
  );
};

export default StoryAndSeriesListing;
