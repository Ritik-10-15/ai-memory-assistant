import { formatRelativeDay, initials, parseServerTime, titleCase } from "./format";

describe("format helpers", () => {
  it("builds initials from words that start with a letter", () => {
    expect(initials("Sarah Johnson")).toBe("SJ");
    expect(initials("Priya Patel (demo)")).toBe("PP");
    expect(initials("Mary-Ann O'Neil")).toBe("MO");
    expect(initials("Zoë")).toBe("Z");
    expect(initials("")).toBe("?");
  });

  it("treats SQLite timestamps as UTC", () => {
    expect(parseServerTime("2026-10-20 14:30:00")?.toISOString()).toBe("2026-10-20T14:30:00.000Z");
    expect(parseServerTime("not a date")).toBeNull();
  });

  it("phrases recent days gently", () => {
    const now = new Date(2026, 9, 29, 12);
    const iso = (d: Date) => d.toISOString().replace("T", " ").slice(0, 19);
    expect(formatRelativeDay(iso(new Date(2026, 9, 29, 9)), now)).toBe("today");
    expect(formatRelativeDay(iso(new Date(2026, 9, 28, 9)), now)).toBe("yesterday");
    expect(formatRelativeDay(iso(new Date(2026, 9, 26, 9)), now)).toBe("3 days ago");
  });

  it("title-cases stored names", () => {
    expect(titleCase("sarah johnson")).toBe("Sarah Johnson");
  });
});
