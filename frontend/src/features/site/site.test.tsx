import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { axeViolations } from "@/test/axe";
import SitePage from "./SitePage";

function renderSite() {
  return render(
    <MemoryRouter initialEntries={["/welcome"]}>
      <SitePage />
    </MemoryRouter>,
  );
}


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
    expect(screen.getAllByText(/not a live camera/).length).toBeGreaterThanOrEqual(2);
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

describe("accessibility", () => {
  it("has no detectable axe violations", async () => {
    const { container } = renderSite();
    expect(await axeViolations(container)).toEqual([]);
  });
});
