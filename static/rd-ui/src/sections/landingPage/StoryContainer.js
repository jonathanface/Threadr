import React, {useState, useEffect} from 'react';
import {setCurrentStoryID} from '../../stores/currentStorySlice';
import {useDispatch} from 'react-redux';
import {setCurrentStoryChapterNumber} from '../../stores/currentStoryChapterNumberSlice';
import '../../css/story-container.css';

const StoryContainer = (props) => {
    const dispatch = useDispatch();
    const [hoverString, setHoverString] = useState("");

    useEffect(() => {
        if (props.series === true) {
            const hoverText = props.data.map(books => {
                return books.volume;
            });
            console.log("concat", hoverText, hoverText.join());
            setHoverString(hoverText.join(", "));
        } else {
            setHoverString(props.title);
        }
    }, [props]);

    const handleClick = () => {
        const history = window.history;
        if (props.series === false) {
            dispatch(setCurrentStoryID(encodeURIComponent(props.title)));
            dispatch(setCurrentStoryChapterNumber(1));
            const title = props.title;
            history.pushState({title}, 'clicked story', '/story/' + encodeURIComponent(props.title) + '?chapter=1');
        }
    }
    
    return (
        <button className="doc-button" title={hoverString} onClick={handleClick}>
            <div>
                <img src="./img/icons/default_doc_icon_blank.png" alt={props.title}/>
                {props.series === true ? <img className="series_badge" alt="series" title="series" src="./img/icons/series_icon.png"/> : ""}
            </div>
            <div>
                <h3>{props.title}</h3>
            </div>
        </button>
    );
}
export default StoryContainer;
