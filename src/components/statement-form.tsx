"use client";

import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import { importStatement } from "@/lib/actions";
import { dayLabel, money } from "@/lib/format";
import { choiceValue, groupRows, type PdfItem, type PdfRow } from "@/lib/statement";
import type { Account, Category } from "@/lib/types";

/**
 * The text of each page of a PDF, with where it sits. The file is opened here in the
 * browser, so neither it nor its password is sent anywhere; only the text goes on to be read.
 */
async function pagesOf(file: File, password: string): Promise<PdfRow[][]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer(), password: password || undefined }).promise;
  const pages: PdfRow[][] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const { items } = await (await doc.getPage(n)).getTextContent();
    pages.push(groupRows(items.filter((item): item is typeof item & PdfItem => "str" in item)));
  }
  return pages;
}

/**
 * Bring a bank or e-wallet statement into one account: choose the file, check it
 * against what is logged, say what each new line is, then import. Both buttons post
 * to the same action; `mode` says which step is wanted. The action is called by hand
 * so that React does not clear the form between the two steps.
 */
export function StatementForm({
  account,
  categories,
  others,
}: {
  account: Pick<Account, "id" | "name">;
  categories: Pick<Category, "id" | "name" | "kind">[];
  /** Your other accounts, for lines that are transfers. */
  others: Pick<Account, "id" | "name">[];
}) {
  const [result, action, pending] = useActionState(importStatement, null);
  const [csv, setCsv] = useState("");
  /** A PDF that has been opened: its name, and the text of its pages as it is sent. */
  const [pdf, setPdf] = useState<{ name: string; pages: string } | null>(null);
  const [password, setPassword] = useState("");
  const [fileNote, setFileNote] = useState<{ text: string; locked?: boolean; busy?: boolean } | null>(null);
  /** What was last sent. The lines on screen belong to it, not to anything chosen or typed since. */
  const [sent, setSent] = useState("");
  /** Choices made by hand, kept for as long as the same reading of the file is on screen. */
  const [picked, setPicked] = useState<{ token?: string; byLine: Record<number, string> }>({ byLine: {} });

  const source = pdf ? pdf.pages : csv;
  const current = result !== null && source === sent;
  const lines = current ? result.lines : undefined;
  const byHand = picked.token === result?.token ? picked.byLine : {};
  const choiceOf = (i: number) => byHand[i] ?? (lines![i].logged ? "" : choiceValue(lines![i].suggestion));
  const chosen = lines ? lines.filter((_, i) => choiceOf(i)).length : 0;
  const spending = categories.filter((c) => c.kind !== "income");
  const income = categories.filter((c) => c.kind === "income");
  const closing = result?.closing;
  const gap = closing ? Math.round((closing.balance - closing.expected) * 100) / 100 : 0;

  async function choose(file: File | undefined) {
    setPdf(null);
    setFileNote(null);
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") return setCsv(await file.text());
    try {
      setFileNote({ text: "Opening…", busy: true });
      const pages = await pagesOf(file, password);
      setCsv("");
      setPdf({ name: file.name, pages: JSON.stringify(pages) });
      setFileNote(null);
    } catch (error) {
      const locked = error instanceof Error && error.name === "PasswordException";
      const text = !locked
        ? "That file could not be opened as a PDF."
        : password
          ? "That password did not open it. Correct it, then choose the file again."
          : "This PDF is locked. Type its password, then choose the file again.";
      setFileNote({ text, locked });
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
        setSent(source);
        startTransition(() => action(data));
      }}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="account" value={account.id} />
      <input type="hidden" name="token" value={result?.token ?? ""} />
      {pdf && <input type="hidden" name="pdf" value={pdf.pages} />}
      <label className="flex flex-col gap-1">
        Choose the statement: a PDF or a CSV file
        <input
          type="file"
          accept=".pdf,application/pdf,.csv,text/csv"
          className="field"
          onChange={(event) => {
            choose(event.target.files?.[0]);
            // So the same file can be chosen again after typing its password.
            event.target.value = "";
          }}
        />
      </label>
      {fileNote && (
        <p className={fileNote.busy ? "text-muted" : "text-red"} role="status">
          {fileNote.text}
        </p>
      )}
      {(fileNote?.locked || password) && (
        <label className="flex flex-col gap-1">
          PDF password
          <input
            type="password"
            autoComplete="off"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="field"
          />
          <span className="text-muted">It is used here in your browser to open the file. It is not saved or sent.</span>
        </label>
      )}
      {pdf ? (
        <p>
          <b>{pdf.name}</b> is open.{" "}
          <button type="button" className="underline" onClick={() => setPdf(null)}>
            Use something else
          </button>
        </p>
      ) : (
        <label className="flex flex-col gap-1">
          or paste CSV here
          <textarea
            name="csv"
            required
            rows={5}
            value={csv}
            onChange={(event) => setCsv(event.target.value)}
            placeholder={"Date,Description,Debit,Credit,Balance\n11/03/2026,POS PURCHASE,250.00,,8750.00"}
            className="field font-mono text-base"
          />
        </label>
      )}

      {current && (
        <div role="status">
          <p className={result.ok ? "text-green" : "text-red"}>{result.message}</p>
          {result.skipped.length > 0 && (
            <ul className="mt-1 text-muted">
              {result.skipped.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          {closing && (
            <p className="mt-1">
              The statement ends {dayLabel(closing.on)} at {money(closing.balance)}.{" "}
              {gap === 0 ? (
                "Your entries add up to the same."
              ) : (
                <>
                  Your entries add up to {money(closing.expected)} for that day, {money(Math.abs(gap))} {gap < 0 ? "more" : "less"}.{" "}
                  <Link href={`/accounts?a=${account.id}&check=1&actual=${closing.balance}&on=${closing.on}`} className="underline">
                    Check the balance
                  </Link>
                </>
              )}
            </p>
          )}
        </div>
      )}

      {lines && (
        <ul className="statement">
          {lines.map((line, i) => (
            <li key={i} data-logged={line.logged || undefined}>
              <span className="text-muted">{dayLabel(line.occurred_on)}</span>
              <span className="truncate" title={line.description}>
                {line.description || "No description"}
                {line.logged && <span className="tag ml-2">Logged already</span>}
              </span>
              <span className={`amount ${line.amount > 0 ? "text-green" : ""}`}>
                {line.amount > 0 ? "+" : "−"}
                {money(Math.abs(line.amount))}
              </span>
              <select
                name={`choice_${i}`}
                aria-label={`What line ${line.line} is`}
                className="field"
                value={choiceOf(i)}
                onChange={(event) => setPicked({ token: result?.token, byLine: { ...byHand, [i]: event.target.value } })}
              >
                <option value="">{line.logged ? "Skip" : "Leave for later"}</option>
                <optgroup label={line.amount > 0 ? "Earned as" : "Spent on"}>
                  {(line.amount > 0 ? income : spending).map((c) => (
                    <option key={c.id} value={`c:${c.id}`}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
                {others.length > 0 && (
                  <optgroup label={line.amount > 0 ? "Moved from" : "Moved to"}>
                    {others.map((a) => (
                      <option key={a.id} value={`a:${a.id}`}>
                        {a.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap">
        <button name="mode" value="check" className="btn" disabled={pending}>
          {pending ? "Reading…" : "Check the file"}
        </button>
        <button name="mode" value="import" className="btn btn-primary" disabled={pending || !lines || chosen === 0} data-sfx="confirm">
          {chosen > 0 ? `Import ${chosen} ${chosen === 1 ? "line" : "lines"}` : "Import"}
        </button>
      </div>
    </form>
  );
}
