import { safeNext } from "./SignInPage";

/** Phase 9: the ?next= target after sign-in must stay on this site. */
describe("safeNext", () => {
  it.each(["/caregiver", "/caregiver/people/42", "/caregiver/visits?range=30", "/family#top"])("keeps %s", (path) => {
    expect(safeNext(path, "/fallback")).toBe(path);
  });

  it.each([
    "//evil.example",
    "/\\evil.example",
    "/\\/evil.example",
    "/caregiver\\..\\..\\evil",
    "https://evil.example",
    "evil.example",
    "/caregiver\n",
    "",
    null,
  ])("refuses %j", (path) => {
    expect(safeNext(path, "/fallback")).toBe("/fallback");
  });
});
