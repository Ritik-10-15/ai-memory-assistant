import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api } from "@/api/client";
import type { Memory, Person, Visit } from "@/api/types";
import { axeViolations } from "@/test/axe";
import { serverStatus } from "@/test/fixtures";
import { installSpeechMock } from "@/test/speech";
import CaregiverApp from "./CaregiverApp";
import { CHECK_ATTEMPTS, CHECK_INTERVAL_MS } from "./pages/EnrollmentPage";
import { directoryView } from "./pages/PeoplePage";
import { filterVisits, type VisitFilters } from "./pages/VisitsPage";

const base: Person = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Sarah Johnson",
  relationship: "Daughter",
  notes: "Visits on Sundays",
  dob: "1972-05-14",
  tts_greeting: "",
  created_at: "2026-09-01 10:00:00",
  memory_count: 2,
  visit_count: 5,
  last_visit_at: "2026-10-20 14:30:00",
  photo_count: 6,
  embedding_count: 6,
  profile_photo_id: null,
};
const sarah = base;
const john: Person = { ...base, id: "22222222-2222-4222-8222-222222222222", name: "John Smith", relationship: "Neighbour", notes: "", photo_count: 0, embedding_count: 0, memory_count: 5, visit_count: 0, last_visit_at: null, dob: "" };
const ana: Person = { ...base, id: "33333333-3333-4333-8333-333333333333", name: "Ana Lee", relationship: "Carer", photo_count: 3, embedding_count: 0, memory_count: 0, last_visit_at: "2026-10-27 09:00:00" };
const memory: Memory = { id: 7, person_id: sarah.id, person_name: sarah.name, summary: "You talked about the roses.", raw_transcript: null, source: "manual", created_at: "2026-10-20 15:00:00" };
const visit = (id: number, who: Person, started: string): Visit => ({
  id, person_id: who.id, person_name: who.name, relationship: who.relationship, started_at: started, ended_at: started, duration_s: 600, confidence: 0.7,
});

function signedIn() {
  vi.spyOn(api, "session").mockResolvedValue({ caregiver: true, patient: true, patient_pin_required: true });
  vi.spyOn(api, "status").mockResolvedValue(serverStatus);
  vi.spyOn(api, "people").mockResolvedValue([sarah, john, ana]);
  vi.spyOn(api, "stats").mockResolvedValue({ total_people: 3, total_visits: 5, total_memories: 2, today_visits: 1 });
  vi.spyOn(api, "visits").mockResolvedValue([]);
  vi.spyOn(api, "memories").mockResolvedValue([memory]);
  vi.spyOn(api, "photos").mockResolvedValue([]);
  vi.spyOn(api, "analytics").mockResolvedValue({ per_person: [], daily: [], memory_sources: [] });
  vi.spyOn(api, "person").mockResolvedValue({ person: sarah, memories: [memory], visits: [visit(1, sarah, "2026-10-20 14:30:00")] });
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/caregiver/login" element={<p>Sign-in page</p>} />
        <Route path="/caregiver/*" element={<CaregiverApp />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  document.documentElement.style.fontSize = "";
  document.documentElement.classList.remove("reduce-motion");
  localStorage.clear();
});

// ── Loved ones ───────────────────────────────────────────────────────
describe("loved ones directory", () => {
  it("filters by enrollment status and sorts", () => {
    const names = (ps: Person[]) => ps.map((p) => p.name);
    expect(names(directoryView([sarah, john, ana], "", "enrolled", "name"))).toEqual(["Sarah Johnson"]);
    expect(names(directoryView([sarah, john, ana], "", "pending", "name"))).toEqual(["Ana Lee"]);
    expect(names(directoryView([sarah, john, ana], "", "none", "name"))).toEqual(["John Smith"]);
    expect(names(directoryView([sarah, john, ana], "", "all", "recent"))).toEqual(["Ana Lee", "Sarah Johnson", "John Smith"]);
    expect(names(directoryView([sarah, john, ana], "", "all", "memories"))).toEqual(["John Smith", "Sarah Johnson", "Ana Lee"]);
    expect(names(directoryView([sarah, john, ana], "neigh", "all", "name"))).toEqual(["John Smith"]);
  });

  it("filter buttons narrow the list and report the count", async () => {
    signedIn();
    const user = userEvent.setup();
    renderAt("/caregiver/people");
    await screen.findByRole("heading", { name: "Sarah Johnson" });
    await user.click(screen.getByRole("button", { name: "Not recognisable yet" }));
    expect(screen.getByRole("button", { name: "Not recognisable yet" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: "Ana Lee" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Sarah Johnson" })).not.toBeInTheDocument();
    expect(screen.getByText("Showing 1 of 3 people")).toBeInTheDocument();
  });

  it("profile shows details, memories and visits, and deletes only after confirmation", async () => {
    signedIn();
    const del = vi.spyOn(api, "deletePerson").mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    renderAt(`/caregiver/people/${sarah.id}`);
    expect(await screen.findByRole("heading", { level: 1, name: "Sarah Johnson" })).toBeInTheDocument();
    expect(screen.getByText("Visits on Sundays")).toBeInTheDocument();
    expect(screen.getByText(/Born/)).toBeInTheDocument();
    expect(screen.getByText("You talked about the roses.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit details" })).toHaveAttribute("href", `/caregiver/people/${sarah.id}/edit`);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("dialog", { name: "Delete Sarah Johnson?" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(del).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete permanently" }));
    expect(del).toHaveBeenCalledWith(sarah.id);
  });

  it("editing a person saves and returns to their profile with confirmation", async () => {
    signedIn();
    const update = vi.spyOn(api, "updatePerson").mockResolvedValue({ person: { ...sarah, relationship: "Eldest daughter" }, photos: [] });
    const user = userEvent.setup();
    renderAt(`/caregiver/people/${sarah.id}/edit`);
    const rel = await screen.findByLabelText("Relationship to the patient");
    await waitFor(() => expect(rel).toHaveValue("Daughter")); // form filled from the loaded person
    await user.clear(rel);
    await user.type(rel, "Eldest daughter");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(update).toHaveBeenCalledWith(sarah.id, expect.objectContaining({ relationship: "Eldest daughter" }), []);
    expect(await screen.findByText("Changes saved.")).toBeInTheDocument();
  });
});

// ── Memories ─────────────────────────────────────────────────────────
describe("memory management", () => {
  it("edits a memory in place, validates, and can cancel", async () => {
    signedIn();
    const update = vi.spyOn(api, "updateMemory").mockImplementation(async (id, summary) => ({ ...memory, id, summary }));
    const user = userEvent.setup();
    renderAt("/caregiver/memories");
    await screen.findByText("You talked about the roses.");
    await user.click(screen.getByRole("button", { name: /^Edit memory from/ }));
    const box = screen.getByLabelText(/Edit memory from/);
    expect(box).toHaveFocus();
    await user.clear(box);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Please write the memory first.")).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
    await user.type(box, "You planted roses together.");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(update).toHaveBeenCalledWith(7, "You planted roses together.");
    expect(await screen.findByText("You planted roses together.")).toBeInTheDocument();
    expect(screen.queryByText("You talked about the roses.")).not.toBeInTheDocument();
  });

  it("previews a memory aloud and stops", async () => {
    signedIn();
    const speech = installSpeechMock();
    const user = userEvent.setup();
    renderAt("/caregiver/memories");
    await user.click(await screen.findByRole("button", { name: /Listen to the memory from/ }));
    expect(speech.spoken.at(-1)?.text).toBe("You talked about the roses.");
    await user.click(screen.getByRole("button", { name: "Stop" }));
    expect(speech.synth.cancel).toHaveBeenCalled();
  });
});

// ── Enrollment wizard ────────────────────────────────────────────────
describe("face enrollment wizard", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it("step 1 adds someone new and moves on to photos", async () => {
    signedIn();
    const fresh: Person = { ...john, id: "44444444-4444-4444-8444-444444444444", name: "Grace Miller" };
    const create = vi.spyOn(api, "createPerson").mockResolvedValue({ person: fresh, photos: [] });
    vi.spyOn(api, "person").mockResolvedValue({ person: fresh, memories: [], visits: [] });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderAt("/caregiver/enroll");
    await screen.findByRole("heading", { name: "Who are you enrolling?" });
    await user.click(screen.getByRole("button", { name: "Add and continue" }));
    expect(screen.getByText("Please enter a name.")).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Full name/), "Grace Miller");
    await user.click(screen.getByRole("button", { name: "Add and continue" }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: "Grace Miller" }), []);
    expect(await screen.findByRole("heading", { name: "Add photos of Grace" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Check enrollment" })).toBeDisabled();
  });

  it("declares success only when the backend reports new face samples", async () => {
    signedIn();
    const enrolled = { ...john, photo_count: 1, embedding_count: 0 };
    const responses = [enrolled, { ...enrolled, embedding_count: 0 }, { ...enrolled, embedding_count: 1 }];
    let call = 0;
    vi.spyOn(api, "person").mockImplementation(async () => ({ person: responses[Math.min(call++, responses.length - 1)], memories: [], visits: [] }));
    vi.spyOn(api, "updatePerson").mockResolvedValue({ person: enrolled, photos: [{ filename: "face.jpg", status: "accepted" }] });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderAt(`/caregiver/enroll/${john.id}`);
    await screen.findByRole("heading", { name: "Add photos of John" });

    await user.upload(screen.getByLabelText("Face photos"), new File(["x"], "face.jpg", { type: "image/jpeg" }));
    await user.click(screen.getByRole("button", { name: /Upload 1 photo/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Check enrollment" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Check enrollment" }));
    expect(await screen.findByText(/processing John's photos/)).toBeInTheDocument();
    expect(screen.queryByText(/can now be recognised/)).not.toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 2));
    expect(await screen.findByRole("heading", { name: "John can now be recognised" })).toBeInTheDocument();
    expect(screen.getByText(/confirmed 1 new usable face sample/)).toBeInTheDocument();
  });

  it("explains when the photos produced no usable face", async () => {
    signedIn();
    const none = { ...john, photo_count: 2, embedding_count: 0 };
    vi.spyOn(api, "person").mockResolvedValue({ person: none, memories: [], visits: [] });
    vi.spyOn(api, "updatePerson").mockResolvedValue({ person: none, photos: [{ filename: "face.jpg", status: "accepted" }] });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderAt(`/caregiver/enroll/${john.id}`);
    await screen.findByRole("heading", { name: "Add photos of John" });
    await user.upload(screen.getByLabelText("Face photos"), new File(["x"], "face.jpg", { type: "image/jpeg" }));
    await user.click(screen.getByRole("button", { name: /Upload 1 photo/ }));
    await user.click(await screen.findByRole("button", { name: "Check enrollment" }));
    await act(() => vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * (CHECK_ATTEMPTS + 1)));
    expect(await screen.findByText("John can't be recognised yet")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to photos" }));
    expect(screen.getByRole("heading", { name: "Add photos of John" })).toBeInTheDocument();
  });

  it("reports a failed upload", async () => {
    signedIn();
    vi.spyOn(api, "person").mockResolvedValue({ person: john, memories: [], visits: [] });
    vi.spyOn(api, "updatePerson").mockRejectedValue(new Error("Can't reach the Memory Assistant server."));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderAt(`/caregiver/enroll/${john.id}`);
    await screen.findByRole("heading", { name: "Add photos of John" });
    await user.upload(screen.getByLabelText("Face photos"), new File(["x"], "face.jpg", { type: "image/jpeg" }));
    await user.click(screen.getByRole("button", { name: /Upload 1 photo/ }));
    expect(await screen.findByText("Can't reach the Memory Assistant server.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check enrollment" })).toBeDisabled();
  });
});

// ── Visits ───────────────────────────────────────────────────────────
describe("visit history", () => {
  const vs = [visit(1, sarah, "2026-10-01 10:00:00"), visit(2, john, "2026-10-15 10:00:00"), visit(3, sarah, "2026-10-25 10:00:00")];
  const f = (patch: Partial<VisitFilters>): VisitFilters => ({ person: "", query: "", range: 0, from: "", to: "", sort: "newest", ...patch });

  it("searches, filters by custom dates, and sorts", () => {
    expect(filterVisits(vs, f({})).map((v) => v.id)).toEqual([3, 2, 1]);
    expect(filterVisits(vs, f({ sort: "oldest" })).map((v) => v.id)).toEqual([1, 2, 3]);
    expect(filterVisits(vs, f({ query: "neighbour" })).map((v) => v.id)).toEqual([2]);
    expect(filterVisits(vs, f({ range: "custom", from: "2026-10-10", to: "2026-10-20" })).map((v) => v.id)).toEqual([2]);
    expect(filterVisits(vs, f({ range: 7 }), new Date("2026-10-27T12:00:00Z").getTime()).map((v) => v.id)).toEqual([3]);
  });

  it("shows custom date fields and flags an impossible range", async () => {
    signedIn();
    vi.spyOn(api, "visits").mockResolvedValue(vs);
    const user = userEvent.setup();
    renderAt("/caregiver/visits");
    await screen.findByLabelText("Period");
    await user.selectOptions(screen.getByLabelText("Period"), "custom");
    await user.type(screen.getByLabelText("From"), "2026-10-20");
    await user.type(screen.getByLabelText("To"), "2026-10-10");
    expect(screen.getByText(/"To" date is before the "From" date/)).toBeInTheDocument();
  });
});

// ── Settings, security, theme ────────────────────────────────────────
describe("settings and access", () => {
  it("display preferences apply immediately and persist on this device", async () => {
    signedIn();
    const user = userEvent.setup();
    renderAt("/caregiver/settings");
    const larger = await screen.findByRole("switch", { name: "Larger text" });
    expect(larger).toHaveAttribute("aria-checked", "false");
    await user.click(larger);
    expect(larger).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement.style.fontSize).toBe("112.5%");
    await user.click(screen.getByRole("switch", { name: "Reduce motion" }));
    expect(document.documentElement).toHaveClass("reduce-motion");
    expect(JSON.parse(localStorage.getItem("memory-assistant:caregiver-prefs")!)).toEqual({ largerText: true, reduceMotion: true });
  });

  it("an expired session mid-task returns to sign-in (real API client, 401 from the server)", async () => {
    signedIn();
    vi.spyOn(api, "updateMemory").mockRestore();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Caregiver sign-in required" }), { status: 401 })));
    const user = userEvent.setup();
    renderAt("/caregiver/memories");
    await screen.findByText("You talked about the roses.");
    await user.click(screen.getByRole("button", { name: /^Edit memory from/ }));
    await user.type(screen.getByLabelText(/Edit memory from/), " again");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Sign-in page")).toBeInTheDocument();
  });

  it("uses the companion theme and closes the mobile menu with Escape", async () => {
    signedIn();
    const user = userEvent.setup();
    const { container } = renderAt("/caregiver");
    await screen.findByRole("heading", { name: "Overview" });
    expect(container.querySelector(".theme-companion")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    expect(document.getElementById("mobile-nav")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(document.getElementById("mobile-nav")).not.toBeInTheDocument();
  });

  it("profile, enrollment and settings pages have no detectable axe violations", async () => {
    signedIn();
    for (const [path, heading] of [
      [`/caregiver/people/${sarah.id}`, "Sarah Johnson"],
      ["/caregiver/enroll", "Who are you enrolling?"],
      ["/caregiver/settings", "Settings"],
    ]) {
      const { container, unmount } = renderAt(path);
      await screen.findByRole("heading", { name: heading });
      expect(await axeViolations(container), path).toEqual([]);
      unmount();
    }
  });
});
