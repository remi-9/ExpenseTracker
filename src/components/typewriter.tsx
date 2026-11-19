"use client";

import { useEffect, useState } from "react";

const MS_PER_CHARACTER = 22;

/**
 * A dialog box that types its lines out, game-style. Click it to finish at once.
 * The full text is laid out invisibly underneath, so the box never changes size.
 */
export function Typewriter({ lines, plain }: { lines: string[]; plain?: boolean }) {
  const text = lines.join("\n");
  // Keyed by the text, so new text starts typing from the beginning.
  return <Typing key={text} text={text} plain={plain} />;
}

function Typing({ text, plain }: { text: string; plain?: boolean }) {
  const [shown, setShown] = useState(0);
  const done = shown >= text.length;

  useEffect(() => {
    const instant = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = setInterval(() => {
      setShown((n) => {
        if (n >= text.length) clearInterval(timer);
        return instant ? text.length : n + 1;
      });
    }, MS_PER_CHARACTER);
    return () => clearInterval(timer);
  }, [text]);

  return (
    <button
      type="button"
      className={`dialog text-xl ${plain ? "" : "box"}`}
      onClick={() => setShown(text.length)}
      aria-label={text}
    >
      <span className="invisible" aria-hidden>
        {text} ▼
      </span>
      <span aria-hidden>
        {text.slice(0, shown)}
        {done && <span className="blink"> ▼</span>}
      </span>
    </button>
  );
}
