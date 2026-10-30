import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api, ApiError } from "@/api/client";
import type { Album, AlbumMemory, FamilyMember, FamilyPhoto } from "@/api/types";
import { axeViolations } from "@/test/axe";
import { idle, photoExtras, sarah, serverStatus } from "@/test/fixtures";
import { installSpeechMock } from "@/test/speech";
import { PatientScreen } from "../PatientScreen";
import { buildAlbum } from "./pieces";

const SARAH = sarah.person_id!;
const family: FamilyMember[] = [
  {
    id: SARAH,
    name: "Sarah Johnson",
    relationship: "Daughter",
    description: "Lives in Leeds with her two boys.",
    last_visit_at: "2026-10-20 14:30:00",
    photo_count: 1,
    recent_memory: { summary: "You talked about the roses.", created_at: "2026-10-20 15:00:00" },
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "John Smith",
    relationship: "Neighbour",
    description: "",
    last_visit_at: null,
    photo_count: 0,
    recent_memory: null,
  },
];
const beach: FamilyPhoto = {
  id: "a".repeat(32),
  caption: "Whitby beach",
  story: "We built a sandcastle and ate fish and chips.",
  taken_on: "Summer 1998",
  memory_id: null,
  created_at: "2026-10-01 10:00:00",
  people: [{ id: SARAH, name: "Sarah Johnson", relationship: "Daughter" }],
  ...photoExtras,
};
const lunchPhoto: FamilyPhoto = { ...beach, id: "b".repeat(32), caption: "Sunday lunch", story: "", taken_on: "", memory_id: 5 };
const roses: AlbumMemory = {
  id: 5,
  person_id: SARAH,
  person_name: "Sarah Johnson",
  relationship: "Daughter",
  summary: "You talked about the roses.",
  created_at: "2026-10-20 15:00:00",
  photo_id: lunchPhoto.id,
};
const football: AlbumMemory = { ...roses, id: 6, person_id: family[1].id, person_name: "John Smith", summary: "You watched the football.", photo_id: null };
const album: Album = { memories: [roses, football], photos: [beach, lunchPhoto] };

function renderAt(path: string) {
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
  vi.spyOn(api, "currentPerson").mockResolvedValue(idle);
  vi.spyOn(api, "album").mockResolvedValue(album);
  vi.spyOn(api, "family").mockResolvedValue(family);
  vi.spyOn(api, "familyMember").mockResolvedValue({
    person: family[0],
    memories: [roses],
    photos: [beach, lunchPhoto],
    visits: { count: 5, recent: ["2026-10-20 14:30:00"] },
  });
});

describe("buildAlbum", () => {
  it("shows a memory's photo with the memory and doesn't repeat it as a separate photo", () => {
    const items = buildAlbum([roses, football], [beach, lunchPhoto]);
    expect(items.map((i) => i.key).sort()).toEqual([`memory:5`, `memory:6`, `photo:${beach.id}`].sort());
    const withPhoto = items.find((i) => i.key === "memory:5")!;
    expect(withPhoto.photo?.id).toBe(lunchPhoto.id);
  });
});

describe("Family", () => {
  it("shows each person as an album card with relationship, description and last memory", async () => {
    renderAt("/family");
    const sarahCard = (await screen.findByRole("heading", { name: "Sarah Johnson" })).closest("a")!;
    expect(sarahCard).toHaveAttribute("href", `/family/${SARAH}`);
    expect(within(sarahCard).getByText("Daughter")).toBeInTheDocument();
    expect(within(sarahCard).getByText("Lives in Leeds with her two boys.")).toBeInTheDocument();
    expect(within(sarahCard).getByText("You talked about the roses.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "John Smith" })).toBeInTheDocument();
  });

  it("offers to try again when the album can't load", async () => {
    vi.spyOn(api, "family").mockRejectedValue(new ApiError("down", 0));
    renderAt("/family");
    expect(await screen.findByText("I couldn't open the family album just now")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("explains an empty album kindly", async () => {
    vi.spyOn(api, "family").mockResolvedValue([]);
    renderAt("/family");
    expect(await screen.findByText("No one has been added yet")).toBeInTheDocument();
  });

  it("has no detectable axe violations", async () => {
    const { container } = renderAt("/family");
    await screen.findByRole("heading", { name: "Sarah Johnson" });
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe("a loved one's page", () => {
  it("shows who they are, their last visit, and shared memories and photos", async () => {
    renderAt(`/family/${SARAH}`);
    expect(await screen.findByRole("heading", { level: 1, name: "Sarah Johnson" })).toBeInTheDocument();
    expect(screen.getByText("Your daughter")).toBeInTheDocument();
    expect(screen.getByText(/Sarah last visited/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Memories with Sarah" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Whitby beach" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sunday lunch" })).toBeInTheDocument();
  });

  it("reads about the person aloud", async () => {
    const speech = installSpeechMock();
    renderAt(`/family/${SARAH}`);
    await userEvent.click(await screen.findByRole("button", { name: "Hear about Sarah" }));
    expect(speech.spoken[0].text).toBe("This is Sarah Johnson. Your daughter. Lives in Leeds with her two boys.");
  });

  it("says so when the person doesn't exist", async () => {
    vi.spyOn(api, "familyMember").mockRejectedValue(new ApiError("Person not found.", 404));
    renderAt("/family/nobody");
    expect(await screen.findByText("I couldn't find this person")).toBeInTheDocument();
  });
});

describe("Memories album", () => {
  it("shows memory cards with gentle prompts, never quiz questions", async () => {
    renderAt("/memories");
    expect(await screen.findByRole("heading", { name: "Whitby beach" })).toBeInTheDocument();
    // Two conversation memories (one with its photo) and a photo with a story.
    expect(screen.getAllByText("Would you like to listen to this memory?")).toHaveLength(2);
    expect(screen.getByText("Would you like to hear the story behind this photo?")).toBeInTheDocument();
    expect(screen.getByText(/no right or wrong answers/)).toBeInTheDocument();
    expect(screen.queryByText(/do you remember|who is this|can you name/i)).not.toBeInTheDocument();
  });

  it("filters by person", async () => {
    const user = userEvent.setup();
    renderAt("/memories");
    await screen.findByRole("heading", { name: "Whitby beach" });
    await user.click(screen.getByRole("button", { name: "John Smith" }));
    expect(screen.getByRole("button", { name: "John Smith" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("heading", { name: "Whitby beach" })).not.toBeInTheDocument();
    expect(screen.getByText("You watched the football.")).toBeInTheDocument();
  });

  it("listens to one memory at a time and can stop", async () => {
    const speech = installSpeechMock();
    const user = userEvent.setup();
    renderAt("/memories");
    await screen.findByRole("heading", { name: "Whitby beach" });
    const [first, second] = screen.getAllByRole("button", { name: "Listen" });
    await user.click(first);
    expect(speech.synth.speak).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("button", { name: "Stop" })).toHaveLength(1);
    await user.click(second);
    expect(speech.synth.speak).toHaveBeenCalledTimes(2);
    expect(screen.getAllByRole("button", { name: "Stop" })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Stop" }));
    expect(screen.queryByRole("button", { name: "Stop" })).not.toBeInTheDocument();
  });

  it("looks at memories together one at a time", async () => {
    const user = userEvent.setup();
    renderAt("/memories");
    await screen.findByRole("heading", { name: "Whitby beach" });
    await user.click(screen.getByRole("button", { name: "Look together" }));
    const viewer = screen.getByRole("dialog");
    expect(within(viewer).getByText("1 of 3")).toBeInTheDocument();
    await user.click(within(viewer).getByRole("button", { name: "Next" }));
    expect(within(viewer).getByText("2 of 3")).toBeInTheDocument();
    await user.click(within(viewer).getByRole("button", { name: "Previous" }));
    expect(within(viewer).getByText("1 of 3")).toBeInTheDocument();
    await user.click(within(viewer).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("has no detectable axe violations", async () => {
    const { container } = renderAt("/memories");
    await screen.findByRole("heading", { name: "Whitby beach" });
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe("while browsing", () => {
  it("gently says a recognised visitor has arrived instead of switching pages", async () => {
    vi.spyOn(api, "currentPerson").mockResolvedValue(sarah);
    const user = userEvent.setup();
    renderAt("/memories");
    expect(await screen.findByText("Sarah Johnson is here")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Memories" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "See who's visiting" }));
    expect(await screen.findByRole("heading", { name: "This is Sarah Johnson" })).toBeInTheDocument();
  });

  it("does not name someone who is only a possible match", async () => {
    vi.spyOn(api, "currentPerson").mockResolvedValue({ ...sarah, state: "medium" });
    renderAt("/family");
    expect(await screen.findByText("Someone is here")).toBeInTheDocument();
    expect(screen.queryByText("Sarah Johnson is here")).not.toBeInTheDocument();
  });
});
