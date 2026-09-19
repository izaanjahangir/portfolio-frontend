import type { Metadata } from "next";
import { AgentScreen } from "@/screens/AgentScreen";
import { SITE } from "@/config/site";

export const metadata: Metadata = {
  title: "Ask the assistant",
  description: `Ask an AI assistant about ${SITE.name}'s work, experience and projects, or leave a message.`,
  alternates: { canonical: "/agent" },
};

/** Route files stay thin — the screen holds the UI. */
export default function AgentPage() {
  return <AgentScreen />;
}
