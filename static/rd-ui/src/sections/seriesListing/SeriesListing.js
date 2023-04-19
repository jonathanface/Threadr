import React, {useState, useEffect} from 'react';
import '../../css/landing-page.css';
import {useSelector, useDispatch} from 'react-redux';
import {flipRefreshStoryList} from '../../stores/refreshStoryListSlice';
// import {refreshStoryList} from '../../stores/refreshStoryListSlice';
import StoryContainer from '../storyAndSeriesListing/StoryContainer';

const SeriesListing = () => {
  const isLoggedIn = useSelector((state) => state.isLoggedIn.value);
  const selectedSeries = useSelector((state) => state.selectedSeries.value);
  const [stories, setStories] = useState([]);
  const dispatch = useDispatch();

  const getSeriesVolumes = () => {
    fetch('/api/series/' + selectedSeries + '/volumes').then((response) => {
      if (response.ok) {
        return response.json();
      }
      throw new Error('Fetch problem series ' + response.status);
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
      getSeriesVolumes();
    }
  }, [isLoggedIn, dispatch]);

  return (
    <div className="landing-page">
      {isLoggedIn ?
        <div>
          <h2>Stories in {decodeURIComponent(selectedSeries)}</h2>
          <div className="icon-box">
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

export default SeriesListing;
