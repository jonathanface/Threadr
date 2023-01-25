import {useState, useEffect} from 'react';
import '../../css/sidebar.css';
import Document from '../document/Document';
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
    const getLandingData = () => {
        fetch('http://localhost:83/api/stories')
        .then((response) => response.json())
        .then((data) => {
            //setStories(data)
            const sortedStories = groupBySeries(data);
            setStories(sortedStories);
            //setStories(sortedStories)
        });
    }
    const [stories, setStories] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    useEffect(() => {
        getLandingData();
    },[]);

    const clickStory = (storyID) => {
        console.log("clicked", storyID)
        props.setDocFunc(storyID);
    }

    return (
        <nav className="menu-container">
            <span className="checkbox-container">
                <input className="checkbox-trigger" type="checkbox" onChange={() => {setIsOpen(!isOpen)}} checked={isOpen} />
                <span className="menu-content">
                <TreeView  aria-label="documents navigator" defaultCollapseIcon={<ExpandMoreIcon />} defaultExpandIcon={<ChevronRightIcon />} defaultExpanded={["story_label"]}>
                    <TreeItem key="story_label" nodeId="story_label" label="Stories" sx={{
                        color:'inherit', backgroundColor:'transparent',paddingTop:'0px'
                    }}>
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
                </TreeView>
                <span className="hamburger-menu" />
                </span>
            </span>
        </nav>
    );
  }
  
  export default Sidebar;