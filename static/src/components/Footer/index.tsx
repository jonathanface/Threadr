import styles from "./footer.module.css";

export const Footer = () => {

    return (
        <span className={styles.logo}>
            <div><span>D</span>octer<span className={styles.tld}>.io</span></div>
            <div className={styles.version}>ver 2.0.0</div>
        </span>
    )
}