import { useCurrentSelections } from "../../hooks/useCurrentSelections";
import { UserMenu } from "..//UserMenu"

import styles from "./headermenu.module.css";

export const HeaderMenu = () => {

  const { currentStory, currentSeries } = useCurrentSelections();

  return (
    <header className={styles.header}>
      <span className={styles.leftPane}>
        <img className={styles.logoImage}
          alt="RichDocter logo"
          title="RichDocter - Organized Imagination"
          src="/img/logo_trans_scaled.png"
        />
        <span className={styles.storyInfo}>
          <div>{currentStory?.title}</div>
          <div className={styles.seriesInfo}>{currentSeries?.series_title}</div>
        </span>
      </span>
      <UserMenu />
    </header >
  )
}
