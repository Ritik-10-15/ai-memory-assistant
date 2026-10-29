import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api, ApiError } from "@/api/client";
import type { CurrentPerson } from "@/api/types";
import { axeViolations } from "@/test/axe";
import { idle, john, maybeSarah, sarah, serverStatus, unknownFace } from "@/test/fixtures";
import { installSpeechMock } from "@/test/speech";
import { PatientScreen } from "./PatientScreen";
import { POLL_INTERVAL_MS } from "./useRecognition";

/** Feed /api/current-person responses one poll at a time. */
function scriptRecognition(...responses: Array<CurrentPerson | Error>) {
  let i = 0;
  return vi.spyOn(api, "currentPerson").mockImplementation(async () => {
    const next = responses[Math.min(i++, responses.length - 1)];
    if (next instanceof Error) throw next;
    return next;
  });
}

async function nextPoll() {
  await act(() => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS + 10));
}

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/*" element={<PatientScreen />} />
        <Route path="/patient/login" element={<p>PIN page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const visitor = () => document.getElementById("visitor")!;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.spyOn(api, "status").mockResolvedValue(serverStatus);
  vi.spyOn(api, "album").mockResolvedValue({ memories: [], photos: [] });
  vi.spyOn(api, "family").mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

describe("PatientScreen recognition states", () => {
  it("shows a known person with relationship, last visit and last conversation", async () => {
    installSpeechMock();
    scriptRecognition(sarah);
    renderScreen();
    expect(await screen.findByRole("heading", { name: "This is Sarah Johnson" })).toBeInTheDocument();
    expect(screen.getByText("Your daughter")).toBeInTheDocument();
    expect(screen.getByText("Recognised")).toBeInTheDocument();
    expect(screen.getAllByText(sarah.last_memory!)[0]).toBeInTheDocument();
    expect(screen.getByText("She brought photos from the beach trip.")).toBeInTheDocument();
    expect(screen.getByText(/You last saw Sarah/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Read aloud" })).toBeInTheDocument();
    // No raw model scores on the patient screen.
    expect(screen.queryByText(/72|0\.72|%/)).not.toBeInTheDocument();
  });

  it("never presents an uncertain match as confirmed", async () => {
    installSpeechMock();
    scriptRecognition(maybeSarah);
    renderScreen();
    expect(await screen.findByRole("heading", { name: "This might be Sarah Johnson" })).toBeInTheDocument();
    expect(screen.getByText("Not sure yet")).toBeInTheDocument();
    expect(screen.queryByText("Recognised")).not.toBeInTheDocument();
    expect(screen.queryByText(sarah.last_memory!)).not.toBeInTheDocument();
    expect(screen.queryByText("Your daughter")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Read aloud" })).not.toBeInTheDocument();
    expect(within(visitor()).queryByRole("img")).not.toBeInTheDocument();
  });

  it("shows an unknown person without any name", async () => {
    scriptRecognition(unknownFace);
    renderScreen();
    expect(await screen.findByRole("heading", { name: "I don't recognise this person" })).toBeInTheDocument();
  });

  it("shows a waiting state when no face is detected", async () => {
    scriptRecognition(idle);
    renderScreen();
    expect(await screen.findByRole("heading", { name: "Waiting for a visitor" })).toBeInTheDocument();
  });

  it("switches cleanly between visitors", async () => {
    installSpeechMock();
    scriptRecognition(sarah, john);
    renderScreen();
    await screen.findByRole("heading", { name: "This is Sarah Johnson" });
    await nextPoll();
    expect(await screen.findByRole("heading", { name: "This is John Smith" })).toBeInTheDocument();
    expect(screen.getByText("Your neighbour")).toBeInTheDocument();
    expect(within(visitor()).queryByText(/Sarah/)).not.toBeInTheDocument();
    expect(screen.queryByText(sarah.last_memory!)).not.toBeInTheDocument();
  });

  it("clears the previous identity when the backend reports unknown, then nobody", async () => {
    scriptRecognition(sarah, unknownFace, idle);
    renderScreen();
    await screen.findByRole("heading", { name: "This is Sarah Johnson" });
    await nextPoll();
    await screen.findByRole("heading", { name: "I don't recognise this person" });
    expect(within(visitor()).queryByText(/Sarah/)).not.toBeInTheDocument();
    await nextPoll();
    await screen.findByRole("heading", { name: "Waiting for a visitor" });
    expect(within(visitor()).queryByText(/Sarah|daughter/i)).not.toBeInTheDocument();
  });

  it("hides the identity and reports a problem when the service stops answering", async () => {
    const down = new ApiError("down", 0);
    scriptRecognition(sarah, down, down);
    renderScreen();
    await screen.findByRole("heading", { name: "This is Sarah Johnson" });
    await nextPoll();
    await nextPoll();
    expect(await screen.findByRole("heading", { name: "I can't connect right now" })).toBeInTheDocument();
    expect(within(visitor()).queryByText(/Sarah/)).not.toBeInTheDocument();
  });

  it("sends the patient to the PIN page when the session is not signed in", async () => {
    scriptRecognition(new ApiError("Not signed in", 401));
    vi.spyOn(api, "status").mockRejectedValue(new ApiError("Not signed in", 401));
    renderScreen();
    expect(await screen.findByText("PIN page")).toBeInTheDocument();
  });

  it("announces changes to screen readers", async () => {
    scriptRecognition(sarah);
    const { container } = renderScreen();
    await screen.findByRole("heading", { name: "This is Sarah Johnson" });
    const live = container.querySelector('[aria-live="polite"][aria-atomic="true"]');
    await waitFor(() => expect(live).toHaveTextContent("This is Sarah Johnson, your daughter."));
  });
});

describe("PatientScreen audio controls", () => {
  // Real timers: user-event clicks and speech state don't need a fake clock.
  beforeEach(() => vi.useRealTimers());

  it("reads the last conversation aloud and can be stopped", async () => {
    const speech = installSpeechMock();
    scriptRecognition(sarah);
    renderScreen();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Read aloud" }));
    expect(speech.synth.speak).toHaveBeenCalledTimes(1);
    expect(speech.spoken[0].text).toMatch(/^Last time you spoke with Sarah Johnson/);
    expect(speech.spoken[0].text).toContain("roses in the back garden");

    const stop = screen.getByRole("button", { name: "Stop" });
    await user.click(stop);
    expect(speech.synth.cancel).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Read aloud" })).toBeInTheDocument();
  });

  it("returns to Read aloud when speech finishes", async () => {
    const speech = installSpeechMock();
    scriptRecognition(sarah);
    renderScreen();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Read aloud" }));
    act(() => speech.finish());
    expect(screen.getByRole("button", { name: "Read aloud" })).toBeInTheDocument();
  });

  it("stops speaking as soon as a different visitor appears", async () => {
    const speech = installSpeechMock();
    scriptRecognition(sarah, sarah, john);
    renderScreen();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Read aloud" }));
    const cancelsBefore = speech.synth.cancel.mock.calls.length;
    await screen.findByRole("heading", { name: "This is John Smith" }, { timeout: 3000 });
    expect(speech.synth.cancel.mock.calls.length).toBeGreaterThan(cancelsBefore);
    expect(screen.getByRole("button", { name: "Read aloud" })).toBeInTheDocument();
  });

  it("explains when the browser cannot read aloud", async () => {
    scriptRecognition(sarah);
    renderScreen();
    expect(await screen.findByText("Reading aloud isn't available in this browser.")).toBeInTheDocument();
  });
});

describe("PatientScreen accessibility", () => {
  it.each([
    ["known", sarah],
    ["uncertain", maybeSarah],
    ["unknown", unknownFace],
    ["no face", idle],
  ])("has no detectable axe violations (%s)", async (_label, detection) => {
    installSpeechMock();
    scriptRecognition(detection);
    const { container } = renderScreen();
    await screen.findByRole("heading", { level: 3 });
    vi.useRealTimers();
    expect(await axeViolations(container)).toEqual([]);
  });
});
