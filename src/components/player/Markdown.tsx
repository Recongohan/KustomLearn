import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Lesson text comes from the model, so raw HTML is never rendered (react-markdown's default) and links open safely.
export function Markdown({ children }: { children: string }) {
  return (
    <div className="kl-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
