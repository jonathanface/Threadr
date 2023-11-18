import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LoginIcon from '@mui/icons-material/Login';
import LogoutIcon from '@mui/icons-material/Logout';
import TreeItem from '@mui/lab/TreeItem';
import TreeView from '@mui/lab/TreeView';
import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import '../../css/sidebar.css';
import { flipCreatingNewStoryState } from '../../stores/creatingNewStorySlice';
import { flipChapterMenuOpen } from '../../stores/uiSlice';
import { flipLoggedInState } from '../../stores/userSlice';

const Sidebar = (props) => {
  const [stories, setStories] = useState([]);
  const isLoggedIn = useSelector((state) => state.isLoggedIn.value);
  const [isCreatingNewChapter, setIsCreatingNewChapter] = useState(false);
  const isOpen = useSelector((state) => state.ui.isChapterMenuOpen);
  const [expanded, setExpanded] = useState(['story_label']);

  const dispatch = useDispatch();

  useEffect(() => {

  }, [isLoggedIn, dispatch]);

  const signin = () => {
    window.location.href = '/auth/google';
  };

  const signout = () => {
    fetch('/logout/google', {
      method: 'DELETE'
    }).then((response) => {
      if (response.ok) {
        dispatch(flipLoggedInState());
        const history = window.history;
        history.pushState({}, '', '/');
        return;
      }
      throw new Error('Fetch problem logout ' + response.status);
    }).catch((error) => {
      console.error(error);
    });
  };

  const createNewStory = () => {
    dispatch(flipCreatingNewStoryState());
  };

  const updateLocalStoryChaptersList = (bookTitle, seriesTitle, newOrDeletedChapter) => {
    if (!stories) {
      console.error('stories is null or undefined');
      return;
    }
    const storiesWithNewChapter = new Map(
        Array.from(stories.entries()).map(([key, story]) => {
          if (seriesTitle && key === seriesTitle) {
            story.forEach((entry) => {
              if (entry.key === bookTitle) {
                const chapterIndex = entry['chapters'].findIndex((e) => e.chapter_title === newOrDeletedChapter);
                if (chapterIndex >= 0) {
                  entry.chapters.splice(chapterIndex, 1);
                } else {
                  entry.chapters.push({chapter_title: newOrDeletedChapter, chapter_num: parseInt(entry.chapters.length+1)});
                }
              }
            });
          } else if (story['chapters'] && bookTitle === story.key) {
            const chapterIndex = story['chapters'].findIndex((e) => e.chapter_title === newOrDeletedChapter);
            if (chapterIndex >= 0) {
              story['chapters'].splice(chapterIndex, 1);
            } else {
              story['chapters'].push({chapter_title: newOrDeletedChapter, chapter_num: parseInt(story.chapters.length+1)});
            }
          }
          return [key, story];
        })
    );
    setStories(storiesWithNewChapter);
  };

  const updateMenuExpandedNodes = (nodeId) => {
    const index = expanded.indexOf(nodeId);
    const copyExpanded = [...expanded];
    if (index === -1) {
      copyExpanded.push(nodeId);
    } else {
      copyExpanded.splice(index, 1);
    }
    setExpanded(copyExpanded);
  };

  const setNewChapterTitle = (event, bookTitle, seriesTitle, chapterNum) => {
    event.preventDefault();
    event.stopPropagation();
    console.log('setnewch', event, bookTitle, seriesTitle, chapterNum);
    const title = event.target.value;
    if (!title.trim().length) {
      console.error('Chapter title cannot be blank');
      return;
    }
    if (event.keyCode === 13) {
      fetch('/api/stories/' + bookTitle + '/chapter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({chapter_title: title, chapter_num: chapterNum})
      }).then((response) => {
        if (response.ok) {
          updateLocalStoryChaptersList(bookTitle, seriesTitle, title);
          setIsCreatingNewChapter(false);
          dispatch(setCurrentStoryChapterNumber(chapterNum));
          dispatch(setCurrentStoryChapterTitle(title));
          const history = window.history;
          history.pushState({bookTitle}, 'created chapter', '/story/' + encodeURIComponent(bookTitle) + '?chapter=' + chapterNum + '&title=' + title);
          return;
        }
        throw new Error('Fetch problem creating chapter ' + response.status);
      }).catch((error) => {
        console.error(error);
      });
    }
  };

  const flipCreateChapterState = () => {
    setIsCreatingNewChapter(!isCreatingNewChapter);
  };

  const materialStyles = {
    '.MuiTreeItem-group': {
      marginLeft: 0,
      paddingLeft: '10px',
      boxSizing: 'border-box'
    }, '.MuiTreeItem-content': {
      padding: '0px'
    },
    '.MuiTreeItem-label,.MuiTreeItem-iconContainer': {
      marginBottom: '5px',
      marginTop: '5px'
    }
  };

  const deleteChapter = (event, story, seriesTitle, chapterTitle, chapterNum) => {
    event.preventDefault();
    event.stopPropagation();
    const chaptersList = seriesTitle ? stories.get(seriesTitle)[stories.get(seriesTitle).findIndex((e) => e.key === story)].chapters : stories.get(story).chapters;
    if (chaptersList.length === 1) {
      console.error('story must contain at least one chapter');
      return;
    }
    const chapterIndex = chaptersList.findIndex((e) => e.chapter_title === chapterTitle);
    const prevChapter = chaptersList[chapterIndex-1];
    const params = [];
    params[0] = {'chapter_title': chapterTitle, 'chapter_num': chapterNum};
    fetch('/api/stories/' + story + '/chapter', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    }).then((response) => {
      if (response.ok) {
        updateLocalStoryChaptersList(story, seriesTitle, chapterTitle);
        dispatch(setCurrentStoryChapterNumber(prevChapter.chapter_num));
        dispatch(setCurrentStoryChapterTitle(prevChapter.chapter_title));
        const history = window.history;
        history.pushState({story}, 'deleted chapter', '/story/' + encodeURIComponent(story) + '?chapter=' + prevChapter.chapter_num + '&title=' + prevChapter.chapterTitle);
        return;
      }
      throw new Error('Fetch problem deleting chapter ' + response.status);
    }).catch((error) => {
      console.error(error);
    });
  };

  return (
    <nav className="menu-container">
      <span className="checkbox-container">
        <input className="checkbox-trigger" type="checkbox" onChange={() => {dispatch(flipChapterMenuOpen());}} checked={isOpen} />
        <span className="menu-content">
          <TreeView aria-label="documents navigator" onNodeSelect={(event, nodeId) => {updateMenuExpandedNodes(nodeId);}} defaultCollapseIcon={<ExpandMoreIcon />} defaultExpandIcon={<ChevronRightIcon />} expanded={expanded} defaultExpanded={['story_label']}>
            {!isLoggedIn ?
              <TreeItem key="login" nodeId="login" label="Sign In">
                <TreeItem key="google" nodeId="google" label="Google" icon={<LoginIcon/>} onClick={signin}/>
              </TreeItem> :
              <TreeItem key="logout" nodeId="logout" label="Sign Out" icon={<LogoutIcon/>} onClick={signout}/>
            }
          </TreeView>
          <span className="hamburger-menu" />
        </span>
      </span>
    </nav>
  );
};

export default Sidebar;
