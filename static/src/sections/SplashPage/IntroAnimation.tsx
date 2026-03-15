import { useEffect, useRef, useState } from "react";
import styles from "./intro-animation.module.css";

const LINE1 = '\tThe carriage halted, and Mina stepped into the fog.';
const LINE2 = '\tMina clutched the letter and hurried toward the abbey.';
const CHAR_NAME = "Mina";

// Positions of "Mina" in line 1
const L1_START = LINE1.indexOf(CHAR_NAME);
const L1_END = L1_START + CHAR_NAME.length;

// Positions of "Mina" in line 2
const L2_START = LINE2.indexOf(CHAR_NAME);
const L2_END = L2_START + CHAR_NAME.length;

const TYPING_SPEED = 75;
const PAUSE_AFTER_TYPING = 800;
const HIGHLIGHT_DURATION = 600;
const PAUSE_AFTER_HIGHLIGHT = 400;
const CONTEXT_MENU_DURATION = 1200;
const PAUSE_AFTER_MENU = 300;
const CARD_DISPLAY = 3000;
const PAUSE_AFTER_CARD = 600;
const PAUSE_AFTER_LINE2 = 3000;
const PAUSE_BEFORE_RESTART = 1500;

type Phase =
  | "typing-1"
  | "pause-typed-1"
  | "highlighting"
  | "pause-highlighted"
  | "context-menu"
  | "pause-menu"
  | "card"
  | "pause-card"
  | "typing-2"
  | "pause-typed-2"
  | "fade-out";

export const IntroAnimation = () => {
  const [line1Len, setLine1Len] = useState(0);
  const [line2Len, setLine2Len] = useState(0);
  const [phase, setPhase] = useState<Phase>("typing-1");
  const [selStart, setSelStart] = useState(-1);
  const [selEnd, setSelEnd] = useState(-1);
  const [cursorVisible, setCursorVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const id = setInterval(() => setCursorVisible((v) => !v), 530);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const clear = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };

    switch (phase) {
      case "typing-1":
        if (line1Len < LINE1.length) {
          timerRef.current = setTimeout(
            () => setLine1Len((l) => l + 1),
            TYPING_SPEED,
          );
        } else {
          timerRef.current = setTimeout(
            () => setPhase("pause-typed-1"),
            PAUSE_AFTER_TYPING,
          );
        }
        break;

      case "pause-typed-1":
        setSelStart(L1_START);
        setSelEnd(L1_START);
        setPhase("highlighting");
        break;

      case "highlighting":
        if (selEnd < L1_END) {
          timerRef.current = setTimeout(() => {
            setSelEnd((e) => e + 1);
          }, HIGHLIGHT_DURATION / CHAR_NAME.length);
        } else {
          timerRef.current = setTimeout(
            () => setPhase("pause-highlighted"),
            PAUSE_AFTER_HIGHLIGHT,
          );
        }
        break;

      case "pause-highlighted":
        setPhase("context-menu");
        break;

      case "context-menu":
        timerRef.current = setTimeout(() => {
          setPhase("pause-menu");
        }, CONTEXT_MENU_DURATION);
        break;

      case "pause-menu":
        timerRef.current = setTimeout(() => {
          setPhase("card");
        }, PAUSE_AFTER_MENU);
        break;

      case "card":
        timerRef.current = setTimeout(() => {
          setPhase("pause-card");
        }, CARD_DISPLAY);
        break;

      case "pause-card":
        timerRef.current = setTimeout(() => {
          setSelStart(-1);
          setSelEnd(-1);
          setPhase("typing-2");
        }, PAUSE_AFTER_CARD);
        break;

      case "typing-2":
        if (line2Len < LINE2.length) {
          timerRef.current = setTimeout(
            () => setLine2Len((l) => l + 1),
            TYPING_SPEED,
          );
        } else {
          timerRef.current = setTimeout(
            () => setPhase("pause-typed-2"),
            PAUSE_AFTER_LINE2,
          );
        }
        break;

      case "pause-typed-2":
        timerRef.current = setTimeout(() => {
          setPhase("fade-out");
        }, PAUSE_BEFORE_RESTART);
        break;

      case "fade-out":
        timerRef.current = setTimeout(() => {
          setLine1Len(0);
          setLine2Len(0);
          setSelStart(-1);
          setSelEnd(-1);
          setPhase("typing-1");
        }, 1200);
        break;
    }

    return clear;
  }, [phase, line1Len, line2Len, selEnd]);

  const text1 = LINE1.slice(0, line1Len);
  const text2 = LINE2.slice(0, line2Len);

  const isTyping = phase === "typing-1" || phase === "typing-2";
  const isPaused = phase === "pause-typed-1" || phase === "pause-typed-2";
  const showCursor = isTyping || isPaused || phase === "pause-card";
  const cursorOnLine2 = phase === "typing-2" || phase === "pause-card" || phase === "pause-typed-2";

  const showSelection = selStart >= 0 && selEnd > selStart;
  const showMenu = phase === "context-menu";
  const showCard = phase === "card" || phase === "pause-card";

  // After context-menu, "Mina" in line 1 stays green for the rest of the cycle
  const line1Associated =
    phase === "card" ||
    phase === "pause-card" ||
    phase === "typing-2" ||
    phase === "pause-typed-2" ||
    phase === "fade-out";

  // "Mina" in line 2 auto-highlights green as soon as it's fully typed
  const line2Associated =
    line2Len >= L2_END &&
    (phase === "typing-2" || phase === "pause-typed-2" || phase === "fade-out");

  const isFadingOut = phase === "fade-out";

  const renderLine1 = () => {
    if (text1.length === 0) return null;

    // During selection highlighting
    if (showSelection && !line1Associated) {
      const before = text1.slice(0, selStart);
      const selected = text1.slice(selStart, selEnd);
      const after = text1.slice(selEnd);
      return (
        <>
          {before}
          <span className={styles.selection}>{selected}</span>
          {after}
        </>
      );
    }

    // When associated (green)
    if (line1Associated) {
      const before = text1.slice(0, L1_START);
      const name = text1.slice(L1_START, L1_END);
      const after = text1.slice(L1_END);
      return (
        <>
          {before}
          <span className={styles.associated}>
            {name}
            <span className={styles.tooltip}>
              <img
                src="./demo-data/dracula/img/mina.jpg"
                alt="Mina Murray"
                className={styles.tooltipPortrait}
              />
              <span className={styles.tooltipText}>
                <strong>Mina Murray</strong>
                <br />
                A clever and resourceful young woman, engaged to Jonathan Harker.
              </span>
            </span>
          </span>
          {after}
        </>
      );
    }

    return <>{text1}</>;
  };

  const renderLine2 = () => {
    if (text2.length === 0) return null;

    if (line2Associated) {
      const before = text2.slice(0, L2_START);
      const name = text2.slice(L2_START, L2_END);
      const remaining = line2Len > L2_END ? text2.slice(L2_END, line2Len) : "";
      return (
        <>
          {before}
          <span className={styles.associated}>
            {name}
            <span className={styles.tooltip}>
              <img
                src="./demo-data/dracula/img/mina.jpg"
                alt="Mina Murray"
                className={styles.tooltipPortrait}
              />
              <span className={styles.tooltipText}>
                <strong>Mina Murray</strong>
                <br />
                A clever and resourceful young woman, engaged to Jonathan Harker.
              </span>
            </span>
          </span>
          {remaining}
        </>
      );
    }

    return <>{text2}</>;
  };

  return (
    <div className={`${styles.container} ${isFadingOut ? styles.fadeOut : ""}`}>
      <div className={styles.editorChrome}>
        <div className={styles.toolbar}>
          <span className={styles.toolbarBtn}><b>B</b></span>
          <span className={styles.toolbarBtn}><i>I</i></span>
          <span className={styles.toolbarBtn}><u>U</u></span>
          <span className={styles.toolbarBtn}><s>S</s></span>
        </div>
        <div className={styles.editorBody}>
          <p className={styles.line}>
            {renderLine1()}
            {showCursor && !cursorOnLine2 && (
              <span
                className={styles.cursor}
                style={{ opacity: cursorVisible ? 1 : 0 }}
              />
            )}
          </p>
          {(text2.length > 0 || cursorOnLine2) && (
            <p className={styles.line}>
              {renderLine2()}
              {showCursor && cursorOnLine2 && (
                <span
                  className={styles.cursor}
                  style={{ opacity: cursorVisible ? 1 : 0 }}
                />
              )}
            </p>
          )}
        </div>
      </div>

      {/* Context menu */}
      <div
        className={`${styles.contextMenu} ${showMenu ? styles.visible : ""}`}
      >
        <div className={styles.menuItem}>Copy</div>
        <div className={`${styles.menuItem} ${styles.menuItemActive}`}>
          Make Association
          <span className={styles.menuArrow}>&#9656;</span>
        </div>
        <div className={styles.submenu}>
          <div className={`${styles.menuItem} ${styles.menuItemActive}`}>
            Character
          </div>
          <div className={styles.menuItem}>Place</div>
          <div className={styles.menuItem}>Event</div>
        </div>
      </div>

      {/* Association card */}
      <div
        className={`${styles.card} ${showCard ? styles.visible : ""}`}
      >
        <img
          src="./demo-data/dracula/img/mina.jpg"
          alt="Mina Murray"
          className={styles.cardPortrait}
        />
        <div className={styles.cardBody}>
          <strong className={styles.cardName}>Mina Murray</strong>
          <span className={styles.cardType}>Character</span>
          <p className={styles.cardDesc}>
            A clever and resourceful young woman, engaged to Jonathan Harker.
            She is devoted, brave, and serves as the emotional anchor of the group.
          </p>
        </div>
      </div>
    </div>
  );
};
