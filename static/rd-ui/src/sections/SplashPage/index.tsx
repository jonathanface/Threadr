import styles from "./splash.module.css";

const SplashPage = () => {
  return (
    <div className={styles.splash}>
      <div className={styles.blurb}>
        <span className={styles.column + " " + styles.leftText}>
          <h2>Organized Imagination</h2>
          <p>
            Dive into the world of storytelling with Docter's revolutionary
            online writing application, tailored specifically for novelists like
            you. Say goodbye to scattered notes, endless tabs, and the
            frustration of losing track of your characters, places, and events.
            Say hello to seamless storytelling with our unique Highlight and
            Reference tool.
          </p>
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
        <span className={styles.column}>
          <figure>
            <img src="./img/crafting.jpg" alt="crafting worlds" />
          </figure>
        </span>
        <span className={styles.column + " " + styles.leftText}>
          <h2>Craft Characters, Build Worlds, Tell Stories</h2>
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
            </ul>
          </div>
        </span>
      </div>
      <div className={styles.blurb}>
        <span className={styles.column + " " + styles.leftText}>
          <h2>Assisted Writing with Artifical Intelligence</h2>
          <div>
            <ul>
              <li>
                Our AI story analyzer, The Docter, will read your chapters on
                the fly and provide meaningful feedback.
              </li>
              <li>
                On request, The Docter will provide suggestions or prompts about
                what to write next.
              </li>
              <li>
                Tagged characters, places, or events can be reviewed and
                suggestions made to add greater depth.
              </li>
            </ul>
          </div>
        </span>
        <span className={styles.column}>
          <figure>
            <img src="./img/docter.jpg" alt="AI Enhanced" />
          </figure>
        </span>
      </div>
      <div className={styles.blurb}>
        <span className={styles.column}>
          <figure>
            <img src="./img/characters.jpg" alt="character backstories" />
          </figure>
        </span>
        <span className={styles.column + " " + styles.leftText}>
          <h2>Character Backstories at Your Fingertips</h2>
          <div>
            <ul>
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
      </div>
      <div className={styles.blurb}>
        <span className={styles.column + " " + styles.leftText}>
          <h2>Explore Your Story's Universe</h2>
          <div>
            <ul>
              <li>
                Dive deep into the lore of your story's world and settings.
              </li>
              <li>Never lose track of important locations or key events.</li>
              <li>
                Maintain consistency and richness throughout your narrative.
              </li>
            </ul>
          </div>
        </span>
        <span className={styles.column}>
          <figure>
            <img src="./img/lore.jpg" alt="diving deep into lore" />
          </figure>
        </span>
      </div>
      <div className={styles.blurb}>
        <span className={styles.column}>
          <figure>
            <img src="./img/exporting.jpg" alt="easy document conversion" />
          </figure>
        </span>
        <span className={styles.column + " " + styles.leftText}>
          <h2>Begin with Brilliance, End with Excellence.</h2>
          <div>
            In the digital age, adaptability is not just an advantage—it's a
            necessity. Craft your content with precision and flair, and when
            you're ready, export it with ease into the formats that
            professionals love: PDF, DOCX, and, coming soon, EPUB. Create
            documents compatible with Word and other popular document editors
            with just two clicks.
          </div>
        </span>
      </div>
    </div>
  );
};

export default SplashPage;
