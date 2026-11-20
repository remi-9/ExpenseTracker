"use client";

import { startTransition, useActionState, useRef } from "react";
import { importCsv } from "@/lib/actions";

/**
 * Paste a CSV file or choose one, check what it would bring in, then import it.
 * Both buttons post to the same action; `mode` says which step is wanted. The action
 * is called by hand so that React does not clear the text between the two steps.
 */
export function ImportForm() {
  const [result, action, pending] = useActionState(importCsv, null);
  const box = useRef<HTMLTextAreaElement>(null);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
        startTransition(() => action(data));
      }}
      className="flex flex-col gap-3"
    >
      <label className="flex flex-col gap-1">
        Choose a file
        <input
          type="file"
          accept=".csv,text/csv"
          className="field"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (file && box.current) box.current.value = await file.text();
          }}
        />
      </label>
      <label className="flex flex-col gap-1">
        or paste it here
        <textarea
          ref={box}
          key={result?.imported ? "done" : "csv"}
          name="csv"
          required
          rows={6}
          placeholder={"date,category,amount,note,account\n2026-11-03,Food,250,Lunch,Cash"}
          className="field font-mono text-base"
        />
      </label>
      <div className="flex flex-wrap">
        <button name="mode" value="check" className="btn" disabled={pending}>
          {pending ? "Reading…" : "Check the file"}
        </button>
        <button name="mode" value="import" className="btn btn-primary" disabled={pending || !result?.ok || result.imported} data-sfx="confirm">
          Import
        </button>
      </div>
      {result && (
        <div role="status">
          <p className={result.ok ? "text-green" : "text-red"}>{result.message}</p>
          {result.skipped.length > 0 && (
            <ul className="mt-1 text-muted">
              {result.skipped.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
