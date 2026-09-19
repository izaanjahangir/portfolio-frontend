"use client";

import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import styles from "./style.module.css";

/**
 * Renders agent answers as markdown: GFM tables, task lists, autolinks,
 * plus syntax-highlighted code blocks.
 *
 * Raw HTML is deliberately NOT enabled (no rehype-raw): answers come from
 * a model, so treating them as inert text is the safe default.
 */

const components: Components = {
  a: ({ children, ...props }) => (
    <a {...props} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  table: ({ children, ...props }) => (
    <div className={styles.tableWrapper}>
      <table {...props}>{children}</table>
    </div>
  ),
  pre: ({ children, ...props }) => (
    <pre className={styles.pre} {...props}>
      {children}
    </pre>
  ),
};

export interface MarkdownProps {
  children: string;
}

function MarkdownImpl({ children }: MarkdownProps) {
  return (
    <div className={styles.markdown}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

/** Memoized: message content never changes once rendered. */
export const Markdown = memo(MarkdownImpl);
