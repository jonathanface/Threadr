import {useState, useEffect} from 'react';
import '../css/sidebar.css';
import { Menu, Item, Separator, Submenu, useContextMenu } from 'react-contexify';


const Sidebar = () => {
    const getLandingData = () => {
        fetch('http://localhost:83/api/stories')
        .then((response) => response.json())
        .then((data) => {
            setStories(data)
        });
    }
    const [stories, setStories] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    useEffect(() => {
        getLandingData();
    },[]);

    const clickStory = (event) => {
        console.log(isOpen, "clicked",event.nativeEvent.target.getAttribute("data-id"))
        setIsOpen(false);
    }
    return (
        <nav className="menu-container">
            <span className="checkbox-container">
                <input className="checkbox-trigger" type="checkbox" onChange={() => {setIsOpen(!isOpen)}} checked={isOpen} />
                <span className="menu-content">
                    <ul>
                        <label className={!stories.length ? "empty" : ""}>Stories</label>
                        {
                            stories.map(story => <li onClick={clickStory} data-id={story.story_id.Value} key={story.story_id.Value}>{story.title.Value}</li>)
                        }
                    </ul>
                    <span className="hamburger-menu" />
                </span>
            </span>
        </nav>
    );
  }
  
  export default Sidebar;