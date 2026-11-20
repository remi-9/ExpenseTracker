import { describe, expect, test } from "bun:test";
import { startCategory } from "./picks";

const choices = [{ id: "rent" }, { id: "food" }, { id: "transport" }];

describe("startCategory", () => {
  test("starts on the category just saved, when it is one of the choices", () => {
    expect(startCategory(choices, "transport", ["food"])).toBe("transport");
  });

  test("otherwise on the most recently logged one among the choices", () => {
    // "salary" is income, so not offered on the Spent form: the next one counts.
    expect(startCategory(choices, undefined, ["salary", "food", "rent"])).toBe("food");
  });

  test("ignores a saved category that is not offered here", () => {
    expect(startCategory(choices, "salary", ["transport"])).toBe("transport");
  });

  test("falls back to the first choice when nothing has been logged", () => {
    expect(startCategory(choices, undefined, [])).toBe("rent");
  });

  test("gives nothing when there is nothing to choose", () => {
    expect(startCategory([], "food", ["food"])).toBeUndefined();
  });
});
