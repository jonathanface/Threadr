import { useNavigate } from "react-router-dom";
import { ThreadWriterDemo } from "../../components/demoComponents/ThreadWriterDemo";
import { IntroAnimation } from "./IntroAnimation";
import styles from "./splash.module.css";
export const SplashPage = () => {
  const navigate = useNavigate();

  const showLoginPanel = () => {
    navigate("/signin");
  };

  return (
    <div className={styles.splash}>
      <div className={styles.heroSection}>
        <div className={styles.heroContent}>
          <h1 className={styles.heroTitle}>
            Your Characters Remember Everything.{" "}
            <span className={styles.heroTitleAccent}>Now Your Manuscript Can Too.</span>
          </h1>
          <p className={styles.heroSubtitle}>
            Docter embeds your characters, places, and events directly into your
            manuscript. Highlight a name, link it to a profile, and click it
            anytime to recall every detail — without leaving the page you're writing.
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
              Free forever with unlimited stories • Pro unlocks everything for $10/mo
            </p>
          </div>
        </div>
        <div className={styles.heroVisual}>
          <IntroAnimation />
        </div>
      </div>

      <div className={styles.demoSection}>
        <h2 className={styles.sectionTitle}>See It in Action</h2>
        <p className={styles.sectionSubtitle}>No signup required</p>
        <p className={styles.demoInstructions}>
          The highlighted words below are linked story elements. Click one to
          pull up its profile — then try editing the text yourself.
        </p>
        <div className={styles.demo}>
          <ThreadWriterDemo />
        </div>
      </div>

      <div className={styles.howItWorks}>
        <h2 className={styles.sectionTitle}>Three Steps to a Linked Manuscript</h2>
        <div className={styles.steps}>
          <div className={styles.step}>
            <div className={styles.stepNumber}>1</div>
            <h3>Write</h3>
            <p>
              Draft chapters in a clean editor built for long-form fiction.
              Organize by chapter, reorder with drag-and-drop.
            </p>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNumber}>2</div>
            <h3>Link</h3>
            <p>
              Highlight a character's name, a location, or a pivotal event.
              Attach it to a profile with descriptions, images, and notes.
            </p>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNumber}>3</div>
            <h3>Recall</h3>
            <p>
              Click any linked reference to instantly see its full profile.
              No tabs, no searching, no breaking your flow.
            </p>
          </div>
        </div>
      </div>

      <div className={styles.featuresSection}>
        <h2 className={styles.sectionTitle}>Built for the Long Haul</h2>
        <p className={styles.featuresIntro}>
          Novels grow. Characters multiply. Timelines tangle. Docter was
          designed for writers who need to hold an entire world in their head —
          and gives them a tool that actually helps.
        </p>
        <div className={styles.featuresList}>
          <div className={styles.featureItem}>
            <strong>Inline Story Elements</strong>
            Highlight any word or phrase and link it to a character, place, or event — right where you're writing
          </div>
          <div className={styles.featureItem}>
            <strong>One-Click Recall</strong>
            Click a linked reference to see its full profile without navigating away from your chapter
          </div>
          <div className={styles.featureItem}>
            <strong>Series Support</strong>
            Group stories into series, track characters across books, and keep your saga consistent
          </div>
          <div className={styles.featureItem}>
            <strong>Share with Beta Readers</strong>
            Invite readers by email with a unique link. They see your manuscript in a clean, read-only view — no account required
          </div>
          <div className={styles.featureItem}>
            <strong>Inline Reader Comments</strong>
            Readers highlight text and leave comments right on the passage. You see every note anchored to the exact words they're referencing
          </div>
          <div className={styles.featureItem}>
            <strong>Export Your Way</strong>
            Download finished work as PDF, DOCX, or EPUB — formatted and ready to share or submit
          </div>
        </div>
      </div>

      <div className={styles.howItWorks}>
        <div className={styles.blurb}>
          <span className={styles.column + " " + styles.leftText}>
            <h2>What Was Her Eye Color in Chapter Three?</h2>
            <p>
              Every writer knows the feeling — you're 200 pages in and you can't
              remember if the tavern was on Birch Street or Elm, or whether the
              detective's partner was named Torres or Torrez.
            </p>
            <p>
              Docter solves this by turning your manuscript into a connected
              document. Link a character's name once, and their full profile —
              appearance, motivations, history — is one click away from every
              mention in every chapter.
            </p>
            <p>
              No more searching through old chapters. No more separate wikis.
              Your story's world lives inside your story.
            </p>
          </span>
          <span className={styles.column}>
            <figure>
              <img
                src="./img/writerdesk.jpg"
                alt="Writer at desk with notes and manuscript"
              />
            </figure>
          </span>
        </div>
      </div>

      <div className={styles.faqSection}>
        <h2 className={styles.sectionTitle}>Common Questions</h2>
        <div className={styles.faqGrid}>
          <div className={styles.faqItem}>
            <h3>What's free?</h3>
            <p>
              Unlimited stories with up to 10 story elements (characters,
              places, events) each. No time limit, no credit card.
            </p>
          </div>
          <div className={styles.faqItem}>
            <h3>What does Pro add?</h3>
            <p>
              Unlimited story elements per story, document export (PDF, DOCX,
              EPUB), and priority support. $10/month, cancel anytime.
            </p>
          </div>
          <div className={styles.faqItem}>
            <h3>Can I export my manuscript?</h3>
            <p>
              Pro members can export any story as a formatted PDF, DOCX, or
              EPUB. Your content is always stored securely and accessible.
            </p>
          </div>
          <div className={styles.faqItem}>
            <h3>Who owns what I write?</h3>
            <p>
              You do. Everything you create belongs to you. We don't use your
              content for anything — it's yours to export, publish, or delete.
            </p>
          </div>
        </div>
      </div>

      <div className={styles.finalCTA}>
        <h2>Your Next Chapter Is Waiting</h2>
        <p>
          Start writing with the editor that remembers your world so you don't have to.
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
