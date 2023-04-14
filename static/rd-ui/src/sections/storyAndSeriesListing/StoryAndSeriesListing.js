import React, {useState, useEffect} from 'react';
import '../../css/landing-page.css';
import {useSelector, useDispatch} from 'react-redux';
import {flipRefreshStoryList} from '../../stores/refreshStoryListSlice';
import StoryContainer from './StoryContainer';

const StoryAndSeriesListing = () => {
  const isLoggedIn = useSelector((state) => state.isLoggedIn.value);
  const refreshStoryList = useSelector((state) => state.refreshStoryList.value);
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
      data.Items.forEach((series) => {
        if (!seriesStoriesFromDB.has(series.series_title.Value)) {
          seriesStoriesFromDB.set(series.series_title.Value, []);
        }
        seriesStoriesFromDB.get(series.series_title.Value).push({
          volume: series.story_title.Value,
          place: series.place.Value,
          created_at: series.created_at.Value
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
    if (isLoggedIn || refreshStoryList) {
      getSeries();
      getStories();
      if (refreshStoryList) {
        dispatch(flipRefreshStoryList());
      }
    }
  }, [isLoggedIn, refreshStoryList, dispatch]);

  return (
    <div className="landing-page">
      {isLoggedIn ?
        <div>
          <h2>Stories</h2>
          <div className="icon-box">
            {
              [...seriesGroup.keys()].map((series) => {
                const entries = seriesGroup.get(series);
                return <StoryContainer key={series} series={true} title={series} data={entries}/>;
              })
            }
            {
              stories.map((story) => {
                return <StoryContainer key={story.title} series={false} title={story.title}/>;
              })
            }
          </div>
        </div>: ''}
    </div>
  );
};

export default StoryAndSeriesListing;
