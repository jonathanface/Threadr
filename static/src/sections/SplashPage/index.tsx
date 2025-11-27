import { useNavigate } from "react-router-dom";
import { ThreadWriterDemo } from "../../components/demoComponents/ThreadWriterDemo";
import styles from "./splash.module.css";
export const SplashPage = () => {
  const navigate = useNavigate();

  const showLoginPanel = () => {
    navigate("/signin");
  };

  return (
    <div className={styles.splash}>
      <div className={styles.heroSection}>
        <h1 className={styles.heroTitle}>
          The Writing Platform That Keeps Your Story Organized
        </h1>
        <p className={styles.heroSubtitle}>
          Link characters, places, and events directly in your text. Click any
          reference to see details without losing your place.
        </p>
        <div className={styles.heroCTA}>
          <button
            type="button"
            onClick={showLoginPanel}
            className={styles.primaryCTA}
          >
            Start Writing Free
          </button>
          <p className={styles.ctaSubtext}>
            Free: Unlimited stories + 20 story elements • Pro ($5/mo): Unlimited
          </p>
        </div>
      </div>
      <div className={styles.demoSection}>
        <h2 className={styles.sectionTitle}>Try It Now - No Signup Required</h2>
        <p className={styles.demoInstructions}>
          Click on any highlighted text to see character, place, or event
          details. Edit the text to see how easy it is to write with Docter.
        </p>
        <div className={styles.demo}>
          <ThreadWriterDemo />
        </div>
        <p className={styles.demoAttribution}>
          Demo text from{" "}
          <a
            href="https://www.amazon.com/Remnants-Dead-Loss-Jonathan-Face-ebook/dp/B071V6BV9J"
            target="_blank"
            rel="noopener noreferrer"
          >
            <i>The Remnants: Dead Loss</i>
          </a>{" "}
          by Jonathan Face
        </p>
      </div>

      <div className={styles.howItWorks}>
        <h2 className={styles.sectionTitle}>How It Works</h2>
        <div className={styles.steps}>
          <div className={styles.step}>
            <div className={styles.stepNumber}>1</div>
            <h3>Write Your Story</h3>
            <p>
              Draft chapters in a clean, distraction-free editor designed for
              long-form writing.
            </p>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNumber}>2</div>
            <h3>Link Story Elements</h3>
            <p>
              Highlight text and create references to characters, places, and
              events as you write.
            </p>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNumber}>3</div>
            <h3>Stay Organized</h3>
            <p>
              Click any reference to view details. Keep track of names, dates,
              and details without losing your place.
            </p>
          </div>
        </div>
      </div>
      <div className={styles.featuresSection}>
        <h2 className={styles.sectionTitle}>Write Smarter, Not Harder</h2>
        <p className={styles.featuresIntro}>
          Built for writers working on novels, series, and complex narratives.
          Docter helps you maintain consistency and track details across
          hundreds of pages without interrupting your creative flow.
        </p>
        <div className={styles.featuresList}>
          <div className={styles.featureItem}>
            <strong>Inline References:</strong> Highlight any text and link it
            to a character, place, or event profile
          </div>
          <div className={styles.featureItem}>
            <strong>Quick Access:</strong> Click any reference to instantly view
            full details without leaving your chapter
          </div>
          <div className={styles.featureItem}>
            <strong>No Context Switching:</strong> Everything you need stays in
            one window while you write
          </div>
          <div className={styles.featureItem}>
            <strong>Export Ready (Pro):</strong> Download your work as formatted
            PDF, DOCX, or EPUB documents
          </div>
        </div>
      </div>
      <div className={styles.blurb}>
        <span className={styles.column + " " + styles.leftText}>
          <h2>Perfect for Complex Storytelling</h2>
          <ul>
            <li>Track multiple character arcs across your entire series</li>
            <li>
              Never forget what a place looks like or when an event occurred
            </li>
            <li>Maintain consistency in names, locations, and timelines</li>
            <li>
              Create rich, detailed character profiles with motivations and
              backgrounds
            </li>
            <li>
              Reference past events without searching through hundreds of pages
            </li>
            <li>Keep your world-building organized and accessible</li>
          </ul>
        </span>
        <span className={styles.column}>
          <figure>
            <img
              src="./img/writerdesk.jpg"
              alt="Writer organizing story elements"
            />
          </figure>
        </span>
      </div>

      <div className={styles.faqSection}>
        <h2 className={styles.sectionTitle}>Frequently Asked Questions</h2>
        <div className={styles.faqGrid}>
          <div className={styles.faqItem}>
            <h3>Is there a free plan?</h3>
            <p>
              Yes! Free accounts get unlimited stories and up to 20 story
              elements (characters, places, events) per story. Perfect for
              trying out Docter.
            </p>
          </div>
          <div className={styles.faqItem}>
            <h3>What do I get with Pro?</h3>
            <p>
              Pro members ($5/month) get unlimited stories, unlimited story
              elements, and document export (PDF, DOCX, EPUB). Great for authors
              working on multiple books or complex series.
            </p>
          </div>
          <div className={styles.faqItem}>
            <h3>Can I export my work?</h3>
            <p>
              Pro members can export their stories as PDF, DOCX, or EPUB
              documents. Your work is always securely stored on our servers.
            </p>
          </div>
          <div className={styles.faqItem}>
            <h3>Do I own my content?</h3>
            <p>
              Absolutely. You own 100% of everything you write. Your stories are
              yours, and Pro members can export them at any time.
            </p>
          </div>
        </div>
      </div>

      <div className={styles.finalCTA}>
        <h2>Ready to Organize Your Story?</h2>
        <p>
          Join writers who keep their characters, places, and events organized
        </p>
        <button
          type="button"
          onClick={showLoginPanel}
          className={styles.primaryCTA}
        >
          Start Writing Free
        </button>
        <p className={styles.ctaSubtext}>
          No credit card required • Free forever
        </p>
      </div>
    </div>
  );
};
