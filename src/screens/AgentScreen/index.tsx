import { AgentChat } from "@/components/AgentChat";
import styles from "./style.module.css";

/**
 * Temporary screen hosting the agent while the portfolio design is built.
 * Routed from app/agent/page.tsx.
 */
export function AgentScreen() {
  return (
    <main className={styles.screen}>
      <div className={styles.frame}>
        <AgentChat
          greeting="Hi! I'm Izaan's assistant. Ask me about his work, experience, or the projects he's shipped — or leave him a message."
          suggestions={[
            "What does Izaan work on?",
            "What's his experience with React?",
            "How can I get in touch?",
          ]}
        />
      </div>
    </main>
  );
}
