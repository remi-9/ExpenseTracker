export type Kind = "income" | "expense" | "saving";

export type Category = {
  id: string;
  name: string;
  kind: Kind;
  icon: string;
  monthly_target: number | null;
  sort_order: number;
  archived_at: string | null;
};

export type AccountKind = "bank" | "ewallet" | "cash" | "card";

/** Somewhere money is kept: a bank account, an e-wallet, cash, or a credit card. */
export type Account = {
  id: string;
  name: string;
  kind: AccountKind;
  /** Same choices as a category icon; usually a Pokémon ("pkmn-143"). */
  icon: string;
  /** What it held before the first entry was logged. */
  opening_balance: number;
  sort_order: number;
  archived_at: string | null;
};

export type Transaction = {
  id: string;
  category_id: string;
  amount: number;
  occurred_on: string; // YYYY-MM-DD
  note: string | null;
  /** The account the money came out of or went into. Null on entries from before accounts existed. */
  account_id: string | null;
  /** Savings only: the account the money was moved to. Null means it stayed where it was. */
  to_account_id: string | null;
  /** The bill this entry pays, if any. */
  bill_id: string | null;
  category: Pick<Category, "name" | "kind" | "icon">;
};

/** Money moved between two of your own accounts. Neither income nor spending. */
export type Transfer = {
  id: string;
  from_account: string;
  to_account: string;
  amount: number;
  occurred_on: string;
  note: string | null;
};

/** Something that comes round on a schedule: rent, a subscription, a savings goal, or your pay. */
export type Bill = {
  id: string;
  name: string;
  category_id: string;
  /** The account it is usually paid from (or into). */
  account_id: string | null;
  /** The usual amount, or null when it varies. */
  amount: number | null;
  /** Day of the month, 1 to 31. Shorter months use their last day. */
  due_day: number;
  cadence: "monthly" | "yearly";
  /** Yearly bills only: the month, 1 to 12. */
  due_month: number | null;
  archived_at: string | null;
};

/** One row of the `month_totals` view. */
export type MonthTotal = {
  month: string; // YYYY-MM-01
  category_id: string;
  kind: Kind;
  total: number;
  entries: number;
  /** Income only: the part of `total` that landed late in the month before (see withLatePay in game.ts). */
  early?: number;
};
