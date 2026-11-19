"use client";

import { useEffect, useRef, useState } from "react";
import { textPace } from "@/lib/options";
import { play } from "@/lib/sfx";

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
  const count = useRef(0); // shared with the click handler so a click can jump to the end
  const done = shown >= text.length;

  useEffect(() => {
    const instant = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = setInterval(() => {
      const n = (count.current = instant ? text.length : Math.min(text.length, count.current + 1));
      setShown(n);
      if (n % 3 === 0 && text[n - 1] !== " ") play("tick"); // a soft tick as the text appears
      if (n >= text.length) clearInterval(timer);
    }, MS_PER_CHARACTER * textPace());
    return () => clearInterval(timer);
  }, [text]);

  return (
    <button
      type="button"
      className={`dialog text-xl ${plain ? "" : "window"}`}
      data-sfx="none"
      onClick={() => setShown((count.current = text.length))}
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
