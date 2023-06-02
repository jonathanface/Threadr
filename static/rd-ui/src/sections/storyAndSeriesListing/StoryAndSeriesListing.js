import React, {useState, useEffect} from 'react';
import '../../css/landing-page.css';
import {useSelector, useDispatch} from 'react-redux';
import Story from '../story/Story';
import AddIcon from '@mui/icons-material/Add';
import {IconButton} from '@mui/material';
import {flipCreatingNewStoryState} from '../../stores/creatingNewStorySlice';

const StoryAndSeriesListing = () => {
  const isLoggedIn = useSelector((state) => state.isLoggedIn.value);
  const [stories, setStories] = useState([]);
  const [seriesGroup, setSeriesGroups] = useState([]);
  const dispatch = useDispatch();

  const getSeries = () => {
    fetch('/api/series').then((response) => {
      if (response.ok) {
        return response.json();
      }
      throw new Error('Fetch problem series ' + response.status);
    }).then((data) => {
      const seriesStoriesFromDB = new Map();
      data.forEach((series) => {
        if (!seriesStoriesFromDB.has(series.series_title)) {
          seriesStoriesFromDB.set(series.series_title, []);
        }
        seriesStoriesFromDB.get(series.series_title).push({
          volume: series.story_title,
          place: series.place,
          created_at: series.created_at
        });
      });
      setSeriesGroups(seriesStoriesFromDB);
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
        return {
          title: story.title,
          description: story.description,
          created_at: story.created_at,
          chapter: story.chapters
        };
      });
      setStories(storiesFromDB);
    });
  };

  useEffect(() => {
    if (isLoggedIn) {
      getSeries();
      getStories();
    }
  }, [isLoggedIn, dispatch]);

  const createNewStory = () => {
    dispatch(flipCreatingNewStoryState());
  };

  return (
    <div className="landing-page">
      <div className="btn-container">

      </div>
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
            {
              [...seriesGroup.keys()].map((series) => {
                const entries = seriesGroup.get(series);
                return <Story key={series} series={true} title={series} data={entries}/>;
              })
            }
            {
              stories.map((story) => {
                return <Story key={story.title} series={false} title={story.title} description={story.description}/>;
              })
            }
          </div>
        </div>: ''}
    </div>
  );
};

export default StoryAndSeriesListing;
