import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axeViolations } from "@/test/axe";
import { installSpeechMock } from "@/test/speech";
import { DemoExperience } from "./DemoExperience";
import { PEOPLE } from "./model";

const { daniel, ruth } = PEOPLE;

function setup() {
  const user = userEvent.setup();
  const utils = render(<DemoExperience />);
  const preview = () => utils.container.querySelector("figure")!;
  const status = () => within(preview()).getByTestId("recognition-status");
  const next = () => user.click(screen.getByRole("button", { name: /^Next/ }));
  const choose = (name: RegExp) => user.click(screen.getByRole("radio", { name }));
  return { user, ...utils, preview, status, next, choose };
}

describe("Scenario A — known visitor", () => {
  it("walks from detection to a confirmed identity, then memories", async () => {
    const t = setup();
    expect(screen.getByText("Simulation / Demo mode")).toBeInTheDocument();
    expect(t.status()).toHaveTextContent("Face detected");
    expect(within(t.preview()).getByText("Someone is here")).toBeInTheDocument();

    await t.next();
    expect(t.status()).toHaveTextContent("Recognised");
    expect(within(t.preview()).getByText(`This is ${daniel.name}`)).toBeInTheDocument();
    expect(within(t.preview()).getByText(daniel.relationship)).toBeInTheDocument();
    expect(within(t.preview()).getByText(/Last visited last Sunday/)).toBeInTheDocument();
    expect(within(t.preview()).queryByTestId("memory-card")).not.toBeInTheDocument();

    await t.next();
    const memory = within(t.preview()).getByTestId("memory-card");
    expect(within(memory).getByText(daniel.conversation)).toBeInTheDocument();
    expect(within(t.preview()).getByTestId("family-memory")).toHaveTextContent(daniel.memory.story);
    expect(within(t.preview()).getByRole("heading", { name: daniel.memory.title })).toBeInTheDocument();
  });
});

describe("Scenario B — unknown visitor", () => {
  it("shows 'Unknown visitor' with no name and no memories", async () => {
    const t = setup();
    await t.choose(/Unknown visitor/);
    await t.next();
    expect(t.status()).toHaveTextContent("Unknown visitor");
    await t.next();
    expect(within(t.preview()).getByText(/isn't enrolled/)).toBeInTheDocument();
    expect(within(t.preview()).queryByTestId("memory-card")).not.toBeInTheDocument();
    expect(within(t.preview()).queryByTestId("family-memory")).not.toBeInTheDocument();
    expect(within(t.preview()).queryByText(/Daniel|Ruth/)).not.toBeInTheDocument();
  });

  it("known → unknown removes the previous visitor from the page entirely", async () => {
    const t = setup();
    for (let i = 0; i < 3; i++) await t.next(); // A: reconnect, Daniel + memory on screen
    expect(t.container).toHaveTextContent(daniel.conversation);
    await t.next(); // continues into B, step 1
    await t.next(); // B: identify → unknown
    expect(t.status()).toHaveTextContent("Unknown visitor");
    // Not hidden with CSS — gone from the DOM.
    expect(t.container.textContent).not.toContain(daniel.name);
    expect(t.container.textContent).not.toContain(daniel.conversation);
    expect(t.container.textContent).not.toContain(daniel.memory.story);
  });
});

describe("Scenario C — no face detected", () => {
  it("holds briefly, then clears to a calm waiting state", async () => {
    const t = setup();
    await t.choose(/No face detected/);
    expect(within(t.preview()).getByText(`This is ${daniel.name}`)).toBeInTheDocument();
    await t.next();
    expect(t.status()).toHaveTextContent("Holding briefly");
    await t.next();
    expect(t.status()).toHaveTextContent("Waiting");
    expect(within(t.preview()).getByText("Waiting for a visitor")).toBeInTheDocument();
    expect(t.preview().textContent).not.toContain(daniel.name);
    expect(t.preview().textContent).not.toContain(daniel.conversation);
  });
});

describe("Scenario D — different visitor", () => {
  it("replaces Daniel with Ruth, including the memory", async () => {
    const t = setup();
    await t.choose(/Different visitor/);
    expect(t.preview()).toHaveTextContent(daniel.conversation);

    await t.next(); // a new face
    expect(t.status()).toHaveTextContent("Face detected");
    expect(t.preview().textContent).not.toContain(daniel.name);
    expect(t.preview().textContent).not.toContain(daniel.conversation);

    await t.next(); // Ruth identified
    expect(within(t.preview()).getByText(`This is ${ruth.name}`)).toBeInTheDocument();
    await t.next(); // Ruth's memory
    expect(t.preview()).toHaveTextContent(ruth.conversation);
    expect(within(t.preview()).getByRole("heading", { name: ruth.memory.title })).toBeInTheDocument();
    expect(t.preview().textContent).not.toContain(daniel.memory.title);
    expect(t.preview().textContent).not.toContain("Daniel");
  });
});

describe("Scenario E — uncertain recognition", () => {
  it("never confirms a possible match, and withholds memories until confirmed", async () => {
    const t = setup();
    await t.choose(/Uncertain recognition/);
    await t.next();
    expect(t.status()).toHaveTextContent("Not sure yet");
    expect(within(t.preview()).getByText("This might be Daniel")).toBeInTheDocument();
    expect(t.preview().textContent).not.toContain(daniel.name);
    expect(t.preview().textContent).not.toContain(daniel.relationship);

    await t.next();
    expect(within(t.preview()).getByText(/stay private until the match is confirmed/)).toBeInTheDocument();
    expect(within(t.preview()).queryByTestId("memory-card")).not.toBeInTheDocument();

    await t.next(); // confirmed
    expect(t.status()).toHaveTextContent("Recognised");
    expect(within(t.preview()).getByTestId("memory-card")).toHaveTextContent(daniel.conversation);
  });
});

describe("navigation and controls", () => {
  it("restart returns to scenario A step 1 and puts focus on the first scenario", async () => {
    const t = setup();
    await t.choose(/Different visitor/);
    await t.next();
    await t.user.click(screen.getByRole("button", { name: "Restart demo" }));
    expect(screen.getByRole("radio", { name: /Known visitor/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Scenario A · step 1 of 4")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("radio", { name: /Known visitor/ })).toHaveFocus());
  });

  it("Previous is disabled at the start and Next at the very end", async () => {
    const t = setup();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    await t.choose(/Uncertain recognition/);
    for (let i = 0; i < 3; i++) await t.next();
    expect(screen.getByRole("button", { name: "End of the demo" })).toBeDisabled();
  });

  it("jumps to any step from the progress indicator", async () => {
    const t = setup();
    const steps = screen.getByRole("navigation", { name: "Steps in scenario A" });
    await t.user.click(within(steps).getByRole("button", { name: /Reconnect/ }));
    expect(within(steps).getByRole("button", { name: /Reconnect/ })).toHaveAttribute("aria-current", "step");
    expect(within(t.preview()).getByTestId("memory-card")).toBeInTheDocument();
  });

  it("switches scenarios with arrow, Home and End keys", async () => {
    const t = setup();
    screen.getByRole("radio", { name: /Known visitor/ }).focus();
    await t.user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: /Unknown visitor/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /Unknown visitor/ })).toHaveFocus();
    await t.user.keyboard("{End}");
    expect(screen.getByRole("radio", { name: /Uncertain recognition/ })).toHaveFocus();
    await t.user.keyboard("{Home}");
    expect(screen.getByRole("radio", { name: /Known visitor/ })).toHaveAttribute("aria-checked", "true");
  });

  it("announces each change to screen readers", async () => {
    const t = setup();
    await t.next();
    expect(screen.getByTestId("demo-announcer")).toHaveTextContent(
      "Scenario A, Known visitor. Step 2 of 4: Identify. Recognised. Daniel Hughes, your grandson.",
    );
  });
});

describe("audio", () => {
  it("never plays on its own; Listen and Stop work; changing step stops it", async () => {
    const speech = installSpeechMock();
    const t = setup();
    for (let i = 0; i < 3; i++) await t.next();
    expect(speech.synth.speak).not.toHaveBeenCalled(); // no autoplay

    await t.user.click(screen.getByRole("button", { name: `Listen to the memory with Daniel` }));
    expect(speech.spoken.at(-1)?.text).toContain(daniel.conversation);
    await t.user.click(screen.getByRole("button", { name: "Stop" }));
    expect(speech.synth.cancel).toHaveBeenCalled();

    await t.user.click(screen.getByRole("button", { name: `Listen to the memory with Daniel` }));
    const cancels = speech.synth.cancel.mock.calls.length;
    await t.user.click(screen.getByRole("button", { name: "Previous" }));
    expect(speech.synth.cancel.mock.calls.length).toBeGreaterThan(cancels);
  });
});

describe("separation from real data", () => {
  it("never calls the backend or opens the camera through a full walkthrough", async () => {
    const getUserMedia = vi.fn();
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia } });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const t = setup();
    for (let i = 0; i < 19; i++) await t.next(); // every step of every scenario
    expect(screen.getByRole("button", { name: "End of the demo" })).toBeDisabled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("demo source code does not import the API client or use the network", () => {
    const sources = import.meta.glob(["../**/*.{ts,tsx}", "!../**/*.test.{ts,tsx}"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    const files = Object.keys(sources);
    expect(files.length).toBeGreaterThan(8);
    for (const [file, code] of Object.entries(sources)) {
      expect(code, file).not.toMatch(/@\/api\/|from "\.\.\/\.\.\/api|\bfetch\(|XMLHttpRequest|getUserMedia/);
    }
  });
});

describe("accessibility", () => {
  it("has no detectable axe violations on known, uncertain and different-visitor steps", async () => {
    const t = setup();
    for (let i = 0; i < 3; i++) await t.next();
    expect(await axeViolations(t.container)).toEqual([]);
    await t.choose(/Uncertain recognition/);
    await t.next();
    expect(await axeViolations(t.container)).toEqual([]);
    await t.choose(/Different visitor/);
    await t.next();
    expect(await axeViolations(t.container)).toEqual([]);
  });
});
