import {useState, useEffect} from 'react';
import '../../css/sidebar.css';
import TreeView from '@mui/lab/TreeView';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
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

const Sidebar = (props) => {
    const getStories = () => {
        if (!isLoggedIn) {
            return;
        }
        fetch(process.env.REACT_APP_SERVER_URL + '/api/stories')
        .then((response) => {
            if (!response.ok) {
                return Promise.reject(response)
            }
            return response.json()
        })
        .then((data) => {
            const sortedStories = groupBySeries(data);
            setStories(sortedStories);
        }).catch(error => {
            console.error(error);
        })
    }
    const [stories, setStories] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoggedIn, setIsLoggedIn] = useState(props.loggedIn);

    console.log("rec prop", props.loggedIn)
    useEffect(() => {
        console.log("setting prop", props.loggedIn)
        setIsLoggedIn(props.loggedIn);
        getStories();
    },[props.loggedIn]);


    const clickStory = (storyID) => {
        props.setDocFunc(storyID);
    }

    const signin = () => {
        window.location.href = process.env.REACT_APP_SERVER_URL + '/auth/google/token';
    }

    const signout = () => {
        fetch(process.env.REACT_APP_SERVER_URL + '/auth/logout', {
            method: "DELETE"
        })
        .then((response) => {
            if (!response.ok) {
                return Promise.reject(response)
            }
            setIsLoggedIn(false);
        }).catch(error => {
            console.error(error);
        })
    }
    return (
        <nav className="menu-container">
            <span className="checkbox-container">
                <input className="checkbox-trigger" type="checkbox" onChange={() => {setIsOpen(!isOpen)}} checked={isOpen} />
                <span className="menu-content">
                <TreeView  aria-label="documents navigator" defaultCollapseIcon={<ExpandMoreIcon />} defaultExpandIcon={<ChevronRightIcon />} defaultExpanded={["story_label"]}>
                    <TreeItem key="story_label" nodeId="story_label" label="Stories">
                        {
                            stories.map(story => {
                                return <TreeItem onClick={!story.nodes ? ()=>{clickStory(story.key)} : undefined} key={story.key} nodeId={story.key} label={story.label}>
                                {Array.isArray(story.nodes)
                                ? story.nodes.map((node) => {
                                    return <TreeItem onClick={()=>{clickStory(node.key)}} key={node.key} nodeId={node.key} label={node.label}/>
                                }) : null}                          
                                </TreeItem>
                            })
                        }
                    </TreeItem>
                    {!isLoggedIn ? 
                        <TreeItem key="login" nodeId="login" label="Sign In">
                            <TreeItem key="google" nodeId="google" label="Google" onClick={signin}/>
                        </TreeItem>
                    : <TreeItem key="logout" nodeId="logout" label="Sign Out" onClick={signout}/>
                    }
                </TreeView>
                
                <span className="hamburger-menu" />
                </span>
            </span>
        </nav>
    );
  }
  
  export default Sidebar;