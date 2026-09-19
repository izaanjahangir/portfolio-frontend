import Link from "next/link";
import { SITE } from "@/config/site";
import styles from "./style.module.css";

/**
 * Home screen.
 *
 * A semantic shell: one <h1>, real section headings, and crawlable text.
 * Replace the copy with your own — the structure is what matters for SEO,
 * and it is a server component so all of it ships in the prerendered HTML.
 */
export function HomeScreen() {
  return (
    <main className={styles.screen}>
      <article className={styles.content}>
        <header className={styles.header}>
          <h1 className={styles.title}>{SITE.name}</h1>
          <p className={styles.tagline}>{SITE.jobTitle}</p>
        </header>

        <section aria-labelledby="about-heading">
          <h2 id="about-heading" className={styles.heading}>
            About
          </h2>
          <p className={styles.body}>{SITE.description}</p>
        </section>

        <section aria-labelledby="agent-heading">
          <h2 id="agent-heading" className={styles.heading}>
            Ask me anything
          </h2>
          <p className={styles.body}>
            Rather than read, just ask. The assistant answers questions about my
            work, experience and projects — and can pass a message along.
          </p>
          <Link href="/agent" className={styles.cta}>
            Open the assistant
          </Link>
        </section>
      </article>
    </main>
  );
}
