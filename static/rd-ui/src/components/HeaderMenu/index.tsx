import { UserMenu } from "../../sections/UserMenu"

import styles from "./headermenu.module.css";

export const HeaderMenu = () => {

  return (
    <header className={styles.header}>
      <UserMenu />
      <h4>
        <div><span>D</span>octer<span className={styles.tld}>.io</span></div>
        <div className={styles.version}>ver 2.0.0</div>
      </h4>
    </header >
  )
}
