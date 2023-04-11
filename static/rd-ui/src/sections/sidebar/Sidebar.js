import React, {useState, useEffect} from 'react';
import '../../css/sidebar.css';
import TreeView from '@mui/lab/TreeView';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import LoginIcon from '@mui/icons-material/Login';
import LogoutIcon from '@mui/icons-material/Logout';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import AddBoxIcon from '@mui/icons-material/AddBox';
import DeleteIcon from '@mui/icons-material/Delete';
import EditableTreeItem from './EditableTreeItem';
import FolderIcon from '@mui/icons-material/Folder';
import TreeItem from '@mui/lab/TreeItem';
import {useSelector, useDispatch} from 'react-redux';
import {flipLoggedInState} from '../../stores/loggedInSlice';
import {setCurrentStoryID} from '../../stores/currentStorySlice';
import {setCurrentStoryChapterNumber} from '../../stores/currentStoryChapterNumberSlice';
import {setCurrentStoryChapterTitle} from '../../stores/currentStoryChapterTitleSlice';
import {flipCreatingNewStoryState} from '../../stores/creatingNewStorySlice';
import {flipMenuOpen} from '../../stores/toggleMenuOpenSlice';
import {flipRefreshStoryList} from '../../stores/refreshStoryListSlice';

const Sidebar = (props) => {
  const [stories, setStories] = useState([]);
  const isLoggedIn = useSelector((state) => state.isLoggedIn.value);
  const refreshStoryList = useSelector((state) => state.refreshStoryList.value);
  const [isCreatingNewChapter, setIsCreatingNewChapter] = useState(false);
  const isOpen = useSelector((state) => state.isMenuOpen.value);
  const [expanded, setExpanded] = useState(['story_label']);
  // maybe use this for color coding the active doc...?
  // const currentStoryID = useSelector((state) => state.currentStoryID.value);

  const dispatch = useDispatch();

  const getStories = () => {
    fetch('/api/stories')
        .then((response) => {
          if (response.ok) {
            return response.json();
          }
          throw new Error('Fetch problem stories ' + response.status);
        })
        .then((data) => {
          const stories = new Map();
          Object.keys(data.series).forEach((series) => {
            stories.set(series, []);
            data.series[series].forEach((story) => {
              stories.get(series).push({
                series: series,
                key: story.title,
                label: story.title,
                place: story.place,
                created_at: story.created_at,
                chapters: story.chapters
              });
            });
          });
          Object.keys(data.standalone).forEach((story) => {
            stories.set(story, {
              key: data.standalone[story][0].title,
              label: data.standalone[story][0].title,
              place: data.standalone[story][0].place,
              created_at: data.standalone[story][0].created_at,
              chapters: data.standalone[story][0].chapters
            });
          });
          setStories(stories);
        }).catch((error) => {
          console.error('get stories', error);
        });
  };
  useEffect(() => {
    if (isLoggedIn || refreshStoryList) {
      getStories();
      if (refreshStoryList) {
        dispatch(flipRefreshStoryList());
      }
    }
  }, [isLoggedIn, refreshStoryList, dispatch]);

  const clickStory = (storyID, chapterNumber, chapterTitle) => {
    dispatch(setCurrentStoryID(encodeURIComponent(storyID)));
    dispatch(setCurrentStoryChapterNumber(chapterNumber));
    dispatch(setCurrentStoryChapterTitle(chapterTitle));
    const history = window.history;
    history.pushState({storyID}, 'clicked story chapter', '/story/' + encodeURIComponent(storyID) + '?chapter=' + chapterNumber + '&title=' + chapterTitle);
  };

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
                const chapterIndex = entry["chapters"].findIndex((e) => e.chapter_title === newOrDeletedChapter);
                if (chapterIndex >= 0) {
                  entry.chapters.splice(chapterIndex, 1);
                } else {
                  entry.chapters.push({chapter_title: newOrDeletedChapter, chapter_num: parseInt(entry.chapters.length+1)});
                }
              }
            });
          } else if (story['chapters'] && bookTitle === story.key) {
            const chapterIndex = story["chapters"].findIndex((e) => e.chapter_title === newOrDeletedChapter);
            if (chapterIndex >= 0) {
              story["chapters"].splice(chapterIndex, 1);
            } else {
              story["chapters"].push({chapter_title: newOrDeletedChapter, chapter_num: parseInt(story.chapters.length+1)});
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
      console.error("story must contain at least one chapter")
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
        <input className="checkbox-trigger" type="checkbox" onChange={() => {dispatch(flipMenuOpen());}} checked={isOpen} />
        <span className="menu-content">
          <TreeView aria-label="documents navigator" onNodeSelect={(event, nodeId) => {updateMenuExpandedNodes(nodeId);}} defaultCollapseIcon={<ExpandMoreIcon />} defaultExpandIcon={<ChevronRightIcon />} expanded={expanded} defaultExpanded={['story_label']}>
            {isLoggedIn ?
                        <TreeItem sx={materialStyles} key="story_label" nodeId="story_label" label="Stories" className="stories-parent">
                          <TreeItem key="create_label" nodeId="create_label" label={
                            <div onClick={()=>{createNewStory();}}>
                              <Button size="small" variant="text" sx={{'fontWeight': 'bold', '&:hover': {opacity: 0.8}}}>New Story</Button>
                              <IconButton edge="end" size="small" sx={{
                                float: 'right',
                                marginTop: '2px',
                                marginRight: '0px',
                              }}>
                                <AddBoxIcon fontSize="small" sx={{color: '#a8d5b1'}}/>
                              </IconButton>
                            </div>
                          }/>
                          {
                            [...stories.keys()].map((storyOrSeries) => {
                              const entry = stories.get(storyOrSeries);
                              return Array.isArray(entry) ?
                                <TreeItem className="chapter-listing" key={storyOrSeries} label={
                                  <div>
                                    {storyOrSeries}
                                    <FolderIcon aria-label="series" fontSize="small" sx={{float: 'right', color: '#a8d5b1'}}/>
                                  </div>} nodeId={storyOrSeries}>
                                  {
                                    entry.map((seriesEntry) => {
                                      return <TreeItem key={seriesEntry.key} label={seriesEntry.label} nodeId={seriesEntry.label}>
                                        {
                                          seriesEntry.chapters.map((chapter) => {
                                            return <TreeItem className="chapter-entry" onClick={()=>clickStory(seriesEntry.key, chapter.chapter_num, chapter.chapter_title)} key={chapter.chapter_num} label={
                                              <div>{chapter.chapter_title}
                                                <IconButton aria-label="delete" size="small" sx={{
                                                  'float': 'right',
                                                  '&:hover': {
                                                    opacity: 0.8,
                                                    cursor: 'pointer'
                                                  }
                                                }} onClick={(e)=> {deleteChapter(e, seriesEntry.label, storyOrSeries, chapter.chapter_title, chapter.chapter_num);}}><DeleteIcon fontSize="small" className={'menu-icon'}/>
                                                </IconButton>
                                              </div>
                                            } nodeId={chapter.chapter_title} />;
                                          })
                                        }
                                        <EditableTreeItem isCreating={isCreatingNewChapter} toggleState={flipCreateChapterState} key={seriesEntry.key + '_create_chap'} nodeId={seriesEntry.key + '_create_chap'} onChange={(event)=>{
                                          setNewChapterTitle(event, seriesEntry.key, storyOrSeries, parseInt(seriesEntry.chapters.length+1));
                                        }} keyVal={seriesEntry.key} defaultVal={'Chapter ' + parseInt(seriesEntry.chapters.length+1)}/>
                                      </TreeItem>;
                                    })
                                  }
                                </TreeItem> :
                                <TreeItem key={entry.key} nodeId={entry.key} className="chapter-listing" label={entry.label}>
                                  {
                                    entry.chapters.map((chapter) => {
                                      return <TreeItem className="chapter-entry" onClick={()=>clickStory(entry.key, chapter.chapter_num, chapter.chapter_title)} key={chapter.chapter_num} label={
                                        <div>{chapter.chapter_title}
                                          <IconButton aria-label="delete" size="small" sx={{
                                            'float': 'right',
                                            '&:hover': {
                                              opacity: 0.8,
                                              cursor: 'pointer'
                                            }
                                          }} onClick={(e)=> {deleteChapter(e, entry.label, null, chapter.chapter_title, chapter.chapter_num);}}><DeleteIcon fontSize="small"/>
                                          </IconButton>
                                        </div>
                                      } nodeId={chapter.chapter_title} />;
                                    })
                                  }
                                  <EditableTreeItem isCreating={isCreatingNewChapter} toggleState={flipCreateChapterState} key={entry.key + '_create_chap'} nodeId={entry.key + '_create_chap'} onChange={(event)=>{
                                    setNewChapterTitle(event, entry.key, null, parseInt(entry.chapters.length+1));
                                  }} keyVal={entry.key} defaultVal={'Chapter ' + parseInt(entry.chapters.length+1)}/>
                                </TreeItem>;
                            })
                          }
                        </TreeItem> :
                        ''
            }
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
