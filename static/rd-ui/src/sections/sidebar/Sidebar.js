import React, {useState, useEffect} from 'react';
import '../../css/sidebar.css';
import TreeView from '@mui/lab/TreeView';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import LoginIcon from '@mui/icons-material/Login';
import LogoutIcon from '@mui/icons-material/Logout';
import ArticleIcon from '@mui/icons-material/Article'; 
import EditIcon from '@mui/icons-material/Edit'; 
import TreeItem from '@mui/lab/TreeItem';
import { useSelector, useDispatch } from 'react-redux'
import { flipLoggedInState } from '../../stores/loggedInSlice'
import { setCurrentStoryID } from '../../stores/currentStorySlice' 
import { flipCreatingNewStoryState } from '../../stores/creatingNewStorySlice';
import { flipMenuOpen } from '../../stores/toggleMenuOpenSlice';
import { flipRefreshStoryList } from '../../stores/refreshStoryListSlice';

const groupBySeries = (stories) => {
    const groupedStories = [];
    stories.map(story => { 
        if (story.series.Value) {
            const exists = groupedStories.find(e => e.key === story.series.Value);
            if (exists) {
                exists.nodes.push({ 
                    key: story.title.Value,
                    label: story.title.Value, 
                    place: story.place.Value,
                    created_at: story.created_at.Value
                })
            } else {
                groupedStories.push({
                    key: story.series.Value,
                    label: story.series.Value,
                    nodes: [{
                        key: story.title.Value,
                        label: story.title.Value,
                        place: story.place.Value,
                        created_at: story.created_at.Value
                    }]
                });
            }
        } else {
            groupedStories.push({
                key: story.title.Value,
                label: story.title.Value,
                place: story.place.Value,
                created_at: story.created_at.Value
            });
        }
        return groupedStories;
    });
    groupedStories.forEach((story) => {
        if (story.nodes) {
            story.nodes.sort((a, b) => a.place > b.place)
        }
    });
    return groupedStories;
}

const Sidebar = (props) => {
    const [stories, setStories] = useState([]);
    const isLoggedIn = useSelector((state) => state.isLoggedIn.value);
    const refreshStoryList = useSelector((state) => state.refreshStoryList.value);
    const isOpen = useSelector((state) => state.isMenuOpen.value);
    // maybe use this for color coding the active doc...?
    const currentStoryID = useSelector((state) => state.currentStoryID.value);

    const dispatch = useDispatch()
 
    const getStories = () => {
        fetch('/api/stories')
        .then((response) => {
            if (response.ok) {
                return response.json();
              }
              throw new Error('Fetch problem stories ' + response.status);
        })
        .then((data) => {
            const sortedStories = groupBySeries(data);
            console.log("stories", sortedStories);
            setStories(sortedStories);
        }).catch(error => {
            console.error("get stories", error);
        })
    };
    useEffect(() => {
        if (isLoggedIn || refreshStoryList) {
            getStories();
            if (refreshStoryList) {
                dispatch(flipRefreshStoryList());
            }
        }
    }, [isLoggedIn, refreshStoryList]);

    const clickStory = (storyID) => {
        dispatch(flipMenuOpen())
        dispatch(setCurrentStoryID(storyID))
        history.pushState({storyID}, 'clicked story', '/story/' + encodeURIComponent(storyID));
    }

    const signin = () => { 
        window.location.href = '/auth/google';
    }

    const signout = () => {
        fetch('/logout/google', {
            method: "DELETE"
        })
        .then((response) => {
            if (response.ok) {
                dispatch(flipLoggedInState())
                history.pushState({}, '', '/');
                return;
            }
            throw new Error('Fetch problem logout ' + response.status);
        }).catch(error => {
            console.error(error);
        })
    }

    const createNewStory = () => {
        dispatch(flipCreatingNewStoryState())
    }
    
    return (
        <nav className="menu-container">
            <span className="checkbox-container">
                <input className="checkbox-trigger" type="checkbox" onChange={() => {dispatch(flipMenuOpen())}} checked={isOpen} />
                <span className="menu-content">
                <TreeView  aria-label="documents navigator" defaultCollapseIcon={<ExpandMoreIcon />} defaultExpandIcon={<ChevronRightIcon />} defaultExpanded={["story_label"]}>
                    {isLoggedIn ? 
                        <TreeItem key="story_label" nodeId="story_label" label="Stories">
                            <TreeItem key="create_label" nodeId="create_label" label="Create" icon={<ArticleIcon/>} onClick={createNewStory} sx={{
                                '& .MuiTreeItem-label': { fontWeight: 'bold' },
                            }}></TreeItem>
                            {
                                stories.map(story => {
                                    return <TreeItem onClick={!story.nodes ? ()=>{clickStory(story.key)} : undefined} icon={!story.nodes ? <EditIcon/> : ""} key={story.key} nodeId={story.key} label={story.label}>
                                    {Array.isArray(story.nodes)
                                    ? story.nodes.map((node) => {
                                        return <TreeItem onClick={()=>{clickStory(node.key)}} icon={<EditIcon/>} key={node.key} nodeId={node.key} label={node.label}/>
                                    }) : null}                          
                                    </TreeItem>
                                })
                            }
                        </TreeItem>
                        : ""
                    }
                    {!isLoggedIn ? 
                        <TreeItem key="login" nodeId="login" label="Sign In">
                            <TreeItem key="google" nodeId="google" label="Google" icon={<LoginIcon/>} onClick={signin}/>
                        </TreeItem>
                    : <TreeItem key="logout" nodeId="logout" label="Sign Out" icon={<LogoutIcon/>} onClick={signout}/>
                    }
                </TreeView>
                <span className="hamburger-menu" />
                </span>
            </span>
        </nav>
    );
  }
  
  export default Sidebar;