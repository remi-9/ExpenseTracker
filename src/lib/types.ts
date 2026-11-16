export type Kind = "income" | "expense" | "saving";

export type Category = {
  id: string;
  name: string;
  kind: Kind;
  icon: string;
  is_fixed: boolean;
  monthly_target: number | null;
  sort_order: number;
  archived_at: string | null;
};

export type Transaction = {
  id: string;
  category_id: string;
  amount: number;
  occurred_on: string; // YYYY-MM-DD
  note: string | null;
  category: Pick<Category, "name" | "kind" | "icon">;
};

/** One row of the `month_totals` view. */
export type MonthTotal = {
  month: string; // YYYY-MM-01
  category_id: string;
  kind: Kind;
  total: number;
  entries: number;
};
