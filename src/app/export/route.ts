// Every entry as a CSV file, with the columns the import reads.
import { toCsv } from "@/lib/csv";
import { getAccounts, getAllTransactions } from "@/lib/data";

export async function GET() {
  const [entries, accounts] = await Promise.all([getAllTransactions(), getAccounts()]);
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const rows = [
    ["date", "kind", "category", "amount", "note", "account", "moved_to"],
    ...entries.map((t) => [
      t.occurred_on,
      t.category.kind,
      t.category.name,
      t.amount,
      t.note,
      accountName.get(t.account_id ?? "") ?? null,
      accountName.get(t.to_account_id ?? "") ?? null,
    ]),
  ];
  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="entries.csv"',
      "Cache-Control": "no-store",
    },
  });
}
