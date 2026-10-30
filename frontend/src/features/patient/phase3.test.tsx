import { act, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api } from "@/api/client";
import type { CurrentPerson, FamilyMemberDetail, FamilyPhoto } from "@/api/types";
import { axeViolations } from "@/test/axe";
import { idle, john, maybeSarah, photoExtras, sarah, serverStatus, unknownFace } from "@/test/fixtures";
import { installSpeechMock } from "@/test/speech";
import { CameraStatus } from "./CameraStatus";
import { ErrorBoundary } from "./ErrorBoundary";
import { PatientScreen } from "./PatientScreen";
import { derivePatientView } from "./recognitionView";
import { useVisitorMemories } from "./useVisitorMemories";

const photo = (id: string, caption: string, personId: string, name: string): FamilyPhoto => ({
  id: id.repeat(32).slice(0, 32),
  caption,
  story: "",
  taken_on: "1998",
  memory_id: null,
  created_at: "2026-10-01 10:00:00",
  people: [{ id: personId, name, relationship: "" }],
  ...photoExtras,
});

const detail = (who: CurrentPerson, caption: string): FamilyMemberDetail => ({
  person: {
    id: who.person_id!,
    name: who.name!,
    relationship: who.relationship ?? "",
    description: "",
    last_visit_at: null,
    photo_count: 1,
    recent_memory: null,
  },
  memories: [],
  photos: [photo(who.person_id![0], caption, who.person_id!, who.name!)],
  visits: { count: 1, recent: [] },
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function scriptRecognition(...responses: CurrentPerson[]) {
  let i = 0;
  return vi.spyOn(api, "currentPerson").mockImplementation(async () => responses[Math.min(i++, responses.length - 1)]);
}

function renderPatient(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/*" element={<PatientScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.spyOn(api, "status").mockResolvedValue(serverStatus);
  vi.spyOn(api, "album").mockResolvedValue({ memories: [], photos: [] });
  vi.spyOn(api, "family").mockResolvedValue([]);
});

// ── stale-response protection ────────────────────────────────────────
describe("useVisitorMemories", () => {
  it("ignores a late response for a previous visitor", async () => {
    const forSarah = deferred<FamilyMemberDetail>();
    const forJohn = deferred<FamilyMemberDetail>();
    const signals: AbortSignal[] = [];
    vi.spyOn(api, "familyMember").mockImplementation((id, signal) => {
      signals.push(signal!);
      return id === sarah.person_id ? forSarah.promise : forJohn.promise;
    });

    const { result, rerender } = renderHook(({ id }) => useVisitorMemories(id), { initialProps: { id: sarah.person_id } });
    rerender({ id: john.person_id }); // the visitor changes before Sarah's answer arrives
    expect(signals[0].aborted).toBe(true);

    await act(async () => forJohn.resolve(detail(john, "John's photo")));
    await act(async () => forSarah.resolve(detail(sarah, "Sarah's photo"))); // late
    expect(result.current.data?.person.id).toBe(john.person_id);
    expect(result.current.data?.photos[0].caption).toBe("John's photo");
  });

  it("rejects a response whose person doesn't match the request", async () => {
    vi.spyOn(api, "familyMember").mockResolvedValue(detail(john, "wrong person"));
    const { result } = renderHook(() => useVisitorMemories(sarah.person_id));
    await waitFor(() => expect(api.familyMember).toHaveBeenCalled());
    await act(async () => undefined);
    expect(result.current.data).toBeNull();
  });

  it("returns nothing at all for no confirmed person", () => {
    const spy = vi.spyOn(api, "familyMember");
    const { result } = renderHook(() => useVisitorMemories(null));
    expect(result.current).toEqual({ data: null, loading: false, error: false });
    expect(spy).not.toHaveBeenCalled();
  });

  it("drops the previous visitor's data on the very render the visitor changes", async () => {
    vi.spyOn(api, "familyMember").mockImplementation(async (id) => (id === sarah.person_id ? detail(sarah, "S") : new Promise(() => {})));
    const { result, rerender } = renderHook(({ id }) => useVisitorMemories(id), { initialProps: { id: sarah.person_id } });
    await waitFor(() => expect(result.current.data?.person.id).toBe(sarah.person_id));
    rerender({ id: john.person_id });
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(true);
  });
});

// ── live recognition integration ─────────────────────────────────────
describe("patient screen with real API shapes", () => {
  it("fetches fuller memories only for a confirmed identity", async () => {
    const spy = vi.spyOn(api, "familyMember").mockResolvedValue(detail(sarah, "Whitby beach"));
    scriptRecognition(maybeSarah);
    renderPatient();
    await screen.findByRole("heading", { name: "This might be Sarah Johnson" });
    expect(spy).not.toHaveBeenCalled();
    expect(screen.queryByText(/Photos with/)).not.toBeInTheDocument();
  });

  it("shows the visitor's family photos, then replaces them for a different visitor", async () => {
    vi.spyOn(api, "familyMember").mockImplementation(async (id) =>
      id === sarah.person_id ? detail(sarah, "Whitby beach") : detail(john, "Allotment"),
    );
    scriptRecognition(sarah, john);
    renderPatient();
    const section = await screen.findByRole("region", { name: "Photos with Sarah" });
    expect(within(section).getByText("Whitby beach")).toBeInTheDocument();
    expect(within(section).getByRole("link", { name: /See everything with Sarah/ })).toHaveAttribute("href", `/family/${sarah.person_id}`);

    const johnSection = await screen.findByRole("region", { name: "Photos with John" }, { timeout: 3000 });
    expect(within(johnSection).getByText("Allotment")).toBeInTheDocument();
    expect(screen.queryByText("Whitby beach")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Photos with Sarah" })).not.toBeInTheDocument();
  });

  it("clears everything private when the backend reports an unknown face or nobody", async () => {
    vi.spyOn(api, "familyMember").mockResolvedValue(detail(sarah, "Whitby beach"));
    scriptRecognition(sarah, unknownFace, idle);
    renderPatient();
    await screen.findByText("Whitby beach");
    await screen.findByRole("heading", { name: "I don't recognise this person" }, { timeout: 3000 });
    const visitor = document.getElementById("visitor")!;
    expect(visitor.textContent).not.toMatch(/Sarah|Whitby|daughter/i);
    await screen.findByRole("heading", { name: "Waiting for a visitor" }, { timeout: 3000 });
    expect(visitor.textContent).not.toMatch(/Sarah|Whitby|daughter/i);
  });

  it("stops the previous visitor's audio when the face becomes unknown", async () => {
    const speech = installSpeechMock();
    vi.spyOn(api, "familyMember").mockResolvedValue(detail(sarah, "Whitby beach"));
    scriptRecognition(sarah, sarah, sarah, unknownFace);
    renderPatient();
    await userEvent.click(await screen.findByRole("button", { name: "Read aloud" }));
    expect(speech.synth.speak).toHaveBeenCalledTimes(1);
    const before = speech.synth.cancel.mock.calls.length;
    await screen.findByRole("heading", { name: "I don't recognise this person" }, { timeout: 4000 });
    expect(speech.synth.cancel.mock.calls.length).toBeGreaterThan(before);
  });

  it("uses the companion theme for the patient app", async () => {
    scriptRecognition(idle);
    const { container } = renderPatient();
    await screen.findByRole("heading", { name: "Waiting for a visitor" });
    expect(container.firstElementChild).toHaveClass("theme-companion");
  });

  it("has no detectable axe violations with a recognised visitor and photos", async () => {
    vi.spyOn(api, "familyMember").mockResolvedValue(detail(sarah, "Whitby beach"));
    scriptRecognition(sarah);
    const { container } = renderPatient();
    await screen.findByText("Whitby beach");
    expect(await axeViolations(container)).toEqual([]);
  });
});

// ── browsing vs. live recognition ────────────────────────────────────
describe("loved ones gallery", () => {
  it("never claims that a browsed person has been recognised", async () => {
    scriptRecognition(idle);
    vi.spyOn(api, "familyMember").mockResolvedValue({ ...detail(sarah, "Whitby beach"), memories: [] });
    renderPatient(`/family/${sarah.person_id}`);
    await screen.findByRole("heading", { level: 1, name: /sarah johnson/i });
    expect(screen.getByText(/This doesn't mean sarah is here/i)).toBeInTheDocument();
    expect(screen.queryByText("Recognised")).not.toBeInTheDocument();
  });
});

// ── failure states ───────────────────────────────────────────────────
describe("failure handling", () => {
  it("shows a calm full-screen message with a retry if rendering fails", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    function Broken(): JSX.Element {
      throw new Error("boom");
    }
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );
    const alert = screen.getByRole("alert");
    expect(within(alert).getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    expect(within(alert).getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("reports camera and connection problems in the status pill", () => {
    const { rerender } = render(<CameraStatus view={derivePatientView({ detection: idle, failures: 0, cameraProblem: null })} />);
    expect(screen.getByText("Camera on")).toBeInTheDocument();
    rerender(<CameraStatus view={derivePatientView({ detection: idle, failures: 0, cameraProblem: "denied" })} />);
    expect(screen.getByText("Camera off")).toBeInTheDocument();
    rerender(<CameraStatus view={derivePatientView({ detection: null, failures: 5, cameraProblem: null })} />);
    expect(screen.getByText("Reconnecting")).toBeInTheDocument();
  });
});
