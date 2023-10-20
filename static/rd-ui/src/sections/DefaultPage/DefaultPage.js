import React from 'react';
import '../../css/default-page.css';

const DefaultPage = () => {

    return(
        <div className="default-page">
            <div className="blurb">
                <span className="column leftText">
                    <h2>Organized Imagination</h2>
                    <p>Dive into the world of storytelling with RichDocter's revolutionary online writing application, tailored specifically for novelists like you. Say goodbye to scattered notes, endless tabs, and the frustration of losing track of your characters, places, and events. Say hello to seamless storytelling with our unique Highlight and Reference tool.</p>
                </span>
                <span className="column">
                    <figure>
                    <iframe width="560" height="315" src="https://www.youtube.com/embed/Jr2IjkhCrBQ?si=KQ3FpPMWlbAO1qSN?autoplay=1&muted=1&controls=0" title="RichDocter Demo" frameborder="0" allow="autoplay" allowfullscreen></iframe>
                    </figure>
                </span>
            </div>
            <div className="blurb">
                <span className="column">
                <figure>
                    <img src="./img/crafting.jpg" alt="crafting worlds"/>
                </figure>
                </span>
                <span className="column leftText">
                <h2>Craft Characters, Build Worlds, Tell Stories</h2>
                    <p>
                        <ul>
                            <li>Easily highlight and reference your characters, places, and events while you write.</li>
                            <li>Stay immersed in your story without losing your creative flow.</li>
                            <li>Bring your fictional world to life with the click of a button.</li>
                        </ul>
                    </p>
                </span>
            </div>
            <div className="blurb">
                <span className="column leftText">
                    <h2>Character Backstories at Your Fingertips</h2>
                    <p>
                        <ul>
                            <li>Instantly access in-depth character profiles with a single click.</li>
                            <li>Uncover your characters' hidden depths, motivations, and quirks.</li>
                            <li>Craft multi-dimensional characters that resonate with your readers.</li>
                        </ul>
                    </p>
                </span>
                <span className="column">
                    <figure>
                        <img src="./img/characters.jpg" alt="character backstories"/>
                    </figure>
                </span>
            </div>
            <div className="blurb">
                <span className="column">
                <figure>
                    <img src="./img/lore.jpg" alt="diving deep into lore"/>
                </figure>
                </span>
                <span className="column leftText">
                <h2>Explore Your Story's Universe</h2>
                    <p>
                        <ul>
                            <li>Dive deep into the lore of your story's world and settings.</li>
                            <li>Never lose track of important locations or key events.</li>
                            <li>Maintain consistency and richness throughout your narrative.</li>
                        </ul>
                    </p>
                </span>
            </div>
        </div>
    );
}

export default DefaultPage;