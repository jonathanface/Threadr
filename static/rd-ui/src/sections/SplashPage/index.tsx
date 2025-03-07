import { useNavigate } from "react-router-dom";
import { ThreadWriterDemo } from "../../components/demoComponents/ThreadWriterDemo";
import styles from "./splash.module.css";
export const SplashPage = () => {

  const navigate = useNavigate();

  const showLoginPanel = () => {
    navigate('/signin');
  }


  return (
    <div className={styles.splash}>
      <div className={styles.introText}>
        <h4>Docter is the writing platform that manages all your story elements – so you can focus on crafting an unforgettable tale.</h4>
        Built with the serious writer in mind, we combine a streamlined text editor with built-in organizational tools for characters, places and events.  You can draft chapters, annotate references on the fly, and keep all story elements neatly connected in one place. It’s a simple, flexible environment that helps you stay focused on writing while effortlessly managing the details of your world.
        <div className={styles.loginBtn}>
          <a onClick={showLoginPanel}>Try It Out</a>
        </div>
      </div>
      <div className={styles.blurb}>
        <div className={styles.demoHeader}>
          <h4>Excerpt: <a href="https://www.amazon.com/Remnants-Dead-Loss-Jonathan-Face-ebook/dp/B071V6BV9J" target="_blank"><i>The Remnants: Dead Loss</i></a> by Jonathan Face</h4>
        </div>
        <div className={styles.demo}>

          <ThreadWriterDemo />
        </div>
      </div>
      <div className={styles.blurb}>
        <span className={styles.column + " " + styles.leftText}>
          <h2>Introducing the Next-Generation Storycrafting Platform...</h2>
          <p><h4>...where every keystroke becomes an immersive journey into your own world.</h4></p>
          <p>Seamlessly draft chapters, forge dynamic annotations, and hyperlink your characters, places, and events with a single click. Whether you're weaving complex epics or penning a heartfelt tale, this writing tool wraps you in an intuitive, distraction-free editor that feels like a natural extension of your creative mind. From powerful organizational features to simple-yet-sophisticated text management, everything is designed to help you focus on what matters most—telling a story that captivates, resonates, and inspires.</p>
          <p>Embrace a writing environment where every character truly comes alive on the page—welcome to your new creative home!</p>
        </span>
        <span className={styles.column}>
          <figure>
            <video width="500" autoPlay muted loop playsInline>
              <source
                src="https://richdocter-demo-videos.s3.amazonaws.com/rd-demo-yt-3.mp4"
                type="video/mp4"
              />
              Unable to play demo video on this browser.
            </video>
          </figure>
        </span>
      </div>
      <div className={styles.blurb}>
        <span className={styles.column + " " + styles.leftText}>
          <h2>Begin with Brilliance, End with Excellence</h2>
          <div>
            <ul>
              <li>
                Easily highlight and reference your characters, places, and
                events while you write.
              </li>
              <li>
                Stay immersed in your story without losing your creative flow.
              </li>
              <li>
                Bring your fictional world to life with the click of a button.
              </li>
              <li>Never lose track of important locations or key events.</li>
              <li>
                Maintain consistency and richness throughout your narrative.
              </li>
              <li>
                Instantly access in-depth character profiles with a single
                click.
              </li>
              <li>
                Uncover your characters' hidden depths, motivations, and quirks.
              </li>
              <li>
                Craft multi-dimensional characters that resonate with your
                readers.
              </li>
            </ul>
          </div>
        </span>
        <span className={styles.column}>
          <figure>
            <img src="./img/crafting.jpg" alt="crafting worlds" />
          </figure>
        </span>
      </div>
    </div>
  );
};
