import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { axeViolations } from "@/test/axe";
import { installSpeechMock } from "@/test/speech";
import { DEMO_VISITOR } from "./demoData";
import SitePage from "./SitePage";

function renderSite() {
  return render(
    <MemoryRouter initialEntries={["/welcome"]}>
      <SitePage />
    </MemoryRouter>,
  );
}

const demoRegion = () => screen.getByRole("heading", { name: /See how it behaves/ }).closest("section")!;

describe("public homepage", () => {
  it("leads with the hero message and two clear actions", () => {
    renderSite();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Every familiar face holds a beautiful story.");
    expect(screen.getByRole("link", { name: /Explore the demo/ })).toHaveAttribute("href", "#demo");
    expect(screen.getAllByRole("link", { name: "How it works" }).some((a) => a.getAttribute("href") === "#how-it-works")).toBe(true);
  });

  it("has no dead in-page links: every #anchor points at a real section", () => {
    const { container } = renderSite();
    const anchors = [...container.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')];
    expect(anchors.length).toBeGreaterThan(8);
    for (const a of anchors) {
      const id = a.getAttribute("href")!.slice(1);
      expect(document.getElementById(id), `#${id}`).not.toBeNull();
    }
  });

  it("links to the real app sign-in pages", () => {
    renderSite();
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: /Caregiver login/ })).toHaveAttribute("href", "/caregiver/login");
    expect(screen.getByRole("link", { name: "Patient screen" })).toHaveAttribute("href", "/");
  });

  it("opens and closes the mobile menu from the keyboard", async () => {
    const user = userEvent.setup();
    renderSite();
    const toggle = screen.getByRole("button", { name: "Open menu" });
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById("site-menu")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(document.getElementById("site-menu")).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();
  });

  it("is clearly labelled as fictional and simulated", () => {
    renderSite();
    expect(screen.getByText("Simulation / Demo mode")).toBeInTheDocument();
    expect(screen.getAllByText("Simulation").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Illustrated scene · not a live camera").length).toBeGreaterThanOrEqual(2);
  });

  it("separates features that exist from ones that are only planned", () => {
    renderSite();
    expect(screen.getByText("On the roadmap · not built yet")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "AI-suggested conversation prompts" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Unknown-person rejection" })).toBeInTheDocument();
    // Responsible language: an explicit disclaimer, and no clinical claims.
    expect(screen.getByText(/hasn't been clinically validated/)).toBeInTheDocument();
    expect(screen.getAllByText(/not a medical device/).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/clinically proven|medically certified|100% accura/i);
  });
});

describe("interactive demo", () => {
  it("shows a familiar visitor with relationship and last conversation", () => {
    renderSite();
    const demo = demoRegion();
    expect(within(demo).getByRole("radio", { name: "Familiar visitor" })).toHaveAttribute("aria-checked", "true");
    expect(within(demo).getByText(`This is ${DEMO_VISITOR.name}`)).toBeInTheDocument();
    expect(within(demo).getByText(DEMO_VISITOR.memory)).toBeInTheDocument();
  });

  it("never guesses: unknown shows no name, a possible match hides the details", async () => {
    const user = userEvent.setup();
    renderSite();
    const demo = demoRegion();

    await user.click(within(demo).getByRole("radio", { name: "Someone new" }));
    expect(within(demo).getByText("I don't recognise this person")).toBeInTheDocument();
    expect(within(demo).queryByText(new RegExp(DEMO_VISITOR.name))).not.toBeInTheDocument();
    expect(within(demo).getByText("Open-set rejection")).toBeInTheDocument();

    await user.click(within(demo).getByRole("radio", { name: "Possible match" }));
    expect(within(demo).getByText("This might be Daniel")).toBeInTheDocument();
    expect(within(demo).queryByText(DEMO_VISITOR.memory)).not.toBeInTheDocument();
    expect(within(demo).queryByRole("button", { name: /Listen/ })).not.toBeInTheDocument();

    await user.click(within(demo).getByRole("radio", { name: "No one there" }));
    expect(within(demo).getByText("Waiting for a visitor")).toBeInTheDocument();

    await user.click(within(demo).getByRole("button", { name: "Back to the familiar visitor" }));
    expect(within(demo).getByText(`This is ${DEMO_VISITOR.name}`)).toBeInTheDocument();
  });

  it("moves between situations with the arrow keys", async () => {
    const user = userEvent.setup();
    renderSite();
    const demo = demoRegion();
    within(demo).getByRole("radio", { name: "Familiar visitor" }).focus();
    await user.keyboard("{ArrowRight}");
    const next = within(demo).getByRole("radio", { name: "Possible match" });
    expect(next).toHaveAttribute("aria-checked", "true");
    expect(next).toHaveFocus();
  });

  it("reads the example aloud and can stop", async () => {
    const speech = installSpeechMock();
    const user = userEvent.setup();
    renderSite();
    const demo = demoRegion();
    await user.click(within(demo).getByRole("button", { name: "Listen to the last conversation" }));
    expect(speech.spoken.at(-1)?.text).toContain(DEMO_VISITOR.memory);
    await user.click(within(demo).getByRole("button", { name: "Stop" }));
    expect(speech.synth.cancel).toHaveBeenCalled();
  });

  it("never opens the camera or calls the backend", async () => {
    const getUserMedia = vi.fn();
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia } });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const user = userEvent.setup();
    renderSite();
    for (const name of ["Someone new", "Possible match", "No one there", "Familiar visitor"]) {
      await user.click(within(demoRegion()).getByRole("radio", { name }));
    }
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("accessibility", () => {
  it("has no detectable axe violations", async () => {
    const { container } = renderSite();
    expect(await axeViolations(container)).toEqual([]);
  });
});
