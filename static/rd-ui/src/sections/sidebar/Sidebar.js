import {useState, useEffect} from 'react';
import '../../css/sidebar.css';
import TreeView from '@mui/lab/TreeView';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import LoginIcon from '@mui/icons-material/Login';
import LogoutIcon from '@mui/icons-material/Logout';
import ArticleIcon from '@mui/icons-material/Article';
import EditIcon from '@mui/icons-material/Edit';
import TreeItem from '@mui/lab/TreeItem';

const groupBySeries = (stories) => {
    const groupedStories = [];
    stories.map(story => {
        if (story.series.Value && story.series.Value.length) {
            const exists = groupedStories.find(e => e.key === story.series.Value);
            if (exists) {
                exists.nodes.push({
                    key: story.story_id.Value,
                    label: story.title.Value,
                    order: story.order.Value,
                    created_at: story.created_at.Value
                })
            } else {
                groupedStories.push({
                    key: story.series.Value,
                    label: story.series.Value,
                    nodes: [{
                        key: story.story_id.Value,
                        label: story.title.Value,
                        order: story.order.Value,
                        created_at: story.created_at.Value
                    }]
                });
            }
        } else {
            groupedStories.push({
                key: story.story_id.Value,
                label: story.title.Value,
                order: story.order.Value,
                created_at: story.created_at.Value
            });
        }
        return groupedStories;
    });
    return groupedStories;
}
// 210-899-1006

const Sidebar = (props) => {

    const [stories, setStories] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoggedIn, setIsLoggedIn] = useState(false);

    const getStories = () => {
        fetch(process.env.REACT_APP_SERVER_URL + '/api/stories')
        .then((response) => {
            if (response.ok) {
                return response.json();
              }
              throw new Error('Fetch problem stories ' + response.status);
        })
        .then((data) => {
            const sortedStories = groupBySeries(data);
            setStories(sortedStories);
        }).catch(error => {
            console.error("get stories", error);
        })
    };
    useEffect(() => {
        if (isLoggedIn) {
            getStories();
        }
    }, [isLoggedIn]);

    if (props.loggedIn != isLoggedIn) {
        setIsLoggedIn(props.loggedIn);
    }

    const clickStory = (storyID) => {
        props.setDocFunc(storyID);
    }

    const signin = () => {
        window.location.href = process.env.REACT_APP_SERVER_URL + '/auth/google/token';
    }
    
    return (
        <nav className="menu-container">
            <span className="checkbox-container">
                <input className="checkbox-trigger" type="checkbox" onChange={() => {setIsOpen(!isOpen)}} checked={isOpen} />
                <span className="menu-content">
                <TreeView  aria-label="documents navigator" defaultCollapseIcon={<ExpandMoreIcon />} defaultExpandIcon={<ChevronRightIcon />} defaultExpanded={["story_label"]}>
                    {isLoggedIn ? 
                        <TreeItem key="story_label" nodeId="story_label" label="Stories">
                            {
                                stories.map(story => {
                                    return <TreeItem onClick={!story.nodes ? ()=>{clickStory(story.key)} : undefined} icon={!story.nodes ? <EditIcon/> : ""} key={story.key} nodeId={story.key} label={story.label}>
                                    {Array.isArray(story.nodes)
                                    ? story.nodes.map((node) => {
                                        return <TreeItem onClick={()=>{clickStory(node.key)}} icon={!story.nodes ? <EditIcon/> : ""} key={node.key} nodeId={node.key} label={node.label}/>
                                    }) : null}                          
                                    </TreeItem>
                                })
                            }
                            <TreeItem key="create_label" nodeId="create_label" label="Create" icon={<ArticleIcon/>}></TreeItem>
                        </TreeItem>
                        : ""
                    }
                    {!isLoggedIn ? 
                        <TreeItem key="login" nodeId="login" label="Sign In">
                            <TreeItem key="google" nodeId="google" label="Google" icon={<LoginIcon/>} onClick={signin}/>
                        </TreeItem>
                    : <TreeItem key="logout" nodeId="logout" label="Sign Out" icon={<LogoutIcon/>} onClick={props.signoutFunc}/>
                    }
                </TreeView>
                <span className="hamburger-menu" />
                </span>
            </span>
        </nav>
    );
  }
  
  export default Sidebar;