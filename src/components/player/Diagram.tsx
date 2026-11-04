"use client";
import { useEffect, useId, useState, useSyncExternalStore } from "react";

function useTheme() {
  return useSyncExternalStore(
    (cb) => {
      const obs = new MutationObserver(cb);
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      return () => obs.disconnect();
    },
    () => document.documentElement.dataset.theme ?? "dark",
    () => "dark",
  );
}

/** Draws a Mermaid diagram in strict mode (no scripts, no HTML labels). Shows the source if it can't be drawn. */
export function Diagram({ source, title }: { source: string; title: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const theme = useTheme();
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: theme === "light" ? "neutral" : "dark", fontFamily: "inherit" });
        const { svg } = await mermaid.render(`kl-diagram-${id}-${theme}`, source);
        if (live) setSvg(svg);
      } catch {
        if (live) setFailed(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [id, source, theme]);

  if (failed)
    return (
      <figure className="rounded-2xl bg-panel-2 p-4">
        <figcaption className="mb-2 text-sm text-muted">This diagram couldn&apos;t be drawn. Its source:</figcaption>
        <pre className="overflow-x-auto text-sm"><code>{source}</code></pre>
      </figure>
    );
  return (
    <figure className="overflow-x-auto rounded-2xl bg-panel-2 p-4" aria-label={`Diagram: ${title}`}>
      {svg ? (
        // Mermaid's strict mode sanitizes this SVG with DOMPurify before we get it.
        <div className="kl-diagram mx-auto w-fit max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="h-48 animate-pulse rounded-xl bg-track" />
      )}
    </figure>
  );
}
