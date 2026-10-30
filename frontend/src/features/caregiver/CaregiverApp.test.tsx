import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api, ApiError, UNAUTHORIZED_EVENT } from "@/api/client";
import type { FamilyPhoto, Memory, Person } from "@/api/types";
import { axeViolations } from "@/test/axe";
import { photoExtras, serverStatus } from "@/test/fixtures";
import CaregiverApp from "./CaregiverApp";
import { CAPTURE_TARGET } from "./pages/EnrollmentPage";

const sarah: Person = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Sarah Johnson",
  relationship: "Daughter",
  notes: "Visits on Sundays",
  dob: "",
  tts_greeting: "",
  created_at: "2026-09-01 10:00:00",
  memory_count: 2,
  visit_count: 5,
  last_visit_at: "2026-10-20 14:30:00",
  photo_count: 6,
  embedding_count: 6,
  profile_photo_id: null,
};
const john: Person = { ...sarah, id: "22222222-2222-4222-8222-222222222222", name: "John Smith", relationship: "Neighbour", notes: "", photo_count: 0, embedding_count: 0, memory_count: 0, visit_count: 0, last_visit_at: null };
const memory: Memory = {
  id: 7,
  person_id: sarah.id,
  person_name: sarah.name,
  summary: "You talked about the roses.",
  raw_transcript: null,
  source: "manual",
  created_at: "2026-10-20 15:00:00",
};

function signedIn() {
  vi.spyOn(api, "session").mockResolvedValue({ caregiver: true, patient: true, patient_pin_required: true });
  vi.spyOn(api, "status").mockResolvedValue(serverStatus);
  vi.spyOn(api, "people").mockResolvedValue([sarah, john]);
  vi.spyOn(api, "stats").mockResolvedValue({ total_people: 2, total_visits: 5, total_memories: 2, today_visits: 1 });
  vi.spyOn(api, "visits").mockResolvedValue([]);
  vi.spyOn(api, "memories").mockResolvedValue([memory]);
  vi.spyOn(api, "analytics").mockResolvedValue({ per_person: [], daily: [], memory_sources: [] });
  vi.spyOn(api, "photos").mockResolvedValue([]);
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

describe("caregiver authentication", () => {
  it("sends a signed-out caregiver to the sign-in page", async () => {
    vi.spyOn(api, "session").mockResolvedValue({ caregiver: false, patient: false, patient_pin_required: true });
    renderAt("/caregiver/people");
    expect(await screen.findByText("Sign-in page")).toBeInTheDocument();
  });

  it("returns to sign-in when the session expires mid-use", async () => {
    signedIn();
    renderAt("/caregiver");
    await screen.findByRole("heading", { name: "Overview" });
    act(() => {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    });
    expect(await screen.findByText("Sign-in page")).toBeInTheDocument();
  });
});

describe("overview", () => {
  it("shows real totals and who still needs enrollment", async () => {
    signedIn();
    renderAt("/caregiver");
    const totals = await screen.findByRole("region", { name: "Totals" });
    await waitFor(() => expect(within(totals).getByText("Visits today").parentElement?.parentElement).toHaveTextContent("1"));
    expect(await screen.findByRole("heading", { name: "Needs face enrollment" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Enroll John Smith/ })).toHaveAttribute("href", `/caregiver/enroll/${john.id}`);
  });

  it("has no detectable axe violations", async () => {
    signedIn();
    const { container } = renderAt("/caregiver");
    await screen.findByRole("heading", { name: "Needs face enrollment" });
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe("people management", () => {
  it("lists people with enrollment status and filters by search", async () => {
    signedIn();
    const user = userEvent.setup();
    renderAt("/caregiver/people");
    expect(await screen.findByRole("heading", { name: "Sarah Johnson" })).toBeInTheDocument();
    const sarahCard = screen.getByRole("heading", { name: "Sarah Johnson" }).closest("article")!;
    expect(within(sarahCard).getByText("Face enrolled")).toBeInTheDocument();
    const johnCard = screen.getByRole("heading", { name: "John Smith" }).closest("article")!;
    expect(within(johnCard).getByText("No face photos")).toBeInTheDocument();
    await user.type(screen.getByRole("searchbox", { name: "Search" }), "neigh");
    expect(screen.queryByRole("heading", { name: "Sarah Johnson" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "John Smith" })).toBeInTheDocument();
  });

  it("asks for confirmation before deleting, and cancelling deletes nothing", async () => {
    signedIn();
    const del = vi.spyOn(api, "deletePerson").mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    renderAt("/caregiver/people");
    await user.click(await screen.findByRole("button", { name: "Delete Sarah Johnson" }));
    const dialog = screen.getByRole("dialog", { name: "Delete Sarah Johnson?" });
    expect(dialog).toHaveTextContent("2 saved memories and 5 visit records");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(del).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete Sarah Johnson" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete permanently" }));
    expect(del).toHaveBeenCalledWith(sarah.id);
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Sarah Johnson" })).not.toBeInTheDocument());
  });

  it("validates the name and explains rejected photos", async () => {
    signedIn();
    const create = vi.spyOn(api, "createPerson").mockResolvedValue({
      person: { ...john, id: "33333333-3333-4333-8333-333333333333", name: "Ana Lee" },
      photos: [
        { filename: "ana.jpg", status: "accepted" },
        { filename: "party.jpg", status: "multiple_faces" },
      ],
    });
    vi.spyOn(api, "person").mockResolvedValue({ person: { ...john, name: "Ana Lee" }, memories: [], visits: [] });
    const user = userEvent.setup();
    renderAt("/caregiver/people/add");
    await user.click(await screen.findByRole("button", { name: "Add person" }));
    expect(screen.getByText("Please enter a name.")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/Full name/), "Ana Lee");
    await user.click(screen.getByRole("button", { name: "Add person" }));
    expect(create).toHaveBeenCalled();
    expect(await screen.findByText("1 of 2 photos added")).toBeInTheDocument();
    expect(screen.getByText(/More than one face/)).toBeInTheDocument();
  });
});

describe("face enrollment", () => {
  it("explains why a capture was rejected, then counts accepted captures", async () => {
    signedIn();
    vi.spyOn(api, "person").mockResolvedValue({ person: john, memories: [], visits: [] });
    const capture = vi
      .spyOn(api, "enrollCapture")
      .mockResolvedValueOnce({ success: false, count: 0, reason: "multiple_faces" })
      .mockResolvedValueOnce({ success: false, count: 0, reason: "no_face" })
      .mockResolvedValue({ success: true, count: 1 });
    const user = userEvent.setup();
    renderAt(`/caregiver/enroll/${john.id}`);
    await user.click(await screen.findByRole("button", { name: "Start capturing" }));
    expect(await screen.findByText(/More than one face is in view/)).toBeInTheDocument();
    expect(await screen.findByText(/No face found/, {}, { timeout: 3000 })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1"), { timeout: 3000 });
    expect(capture).toHaveBeenCalledWith(john.id, null); // server-camera mode sends no frame
    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(Number(screen.getByRole("progressbar").getAttribute("aria-valuemax"))).toBe(CAPTURE_TARGET);
  });

  it("stops and says so when the server camera is unavailable", async () => {
    signedIn();
    vi.spyOn(api, "person").mockResolvedValue({ person: john, memories: [], visits: [] });
    vi.spyOn(api, "enrollCapture").mockResolvedValue({ success: false, count: 0, reason: "camera_unavailable" });
    const user = userEvent.setup();
    renderAt(`/caregiver/enroll/${john.id}`);
    await user.click(await screen.findByRole("button", { name: "Start capturing" }));
    expect(await screen.findByText("The camera on the server isn't available.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start capturing" })).toBeInTheDocument();
  });
});

describe("memories", () => {
  it("adds a memory for the chosen person and deletes after confirmation", async () => {
    signedIn();
    const added: Memory = { ...memory, id: 8, summary: "You baked bread together." };
    const add = vi.spyOn(api, "addMemory").mockResolvedValue(added);
    const del = vi.spyOn(api, "deleteMemory").mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    renderAt("/caregiver/memories");
    expect(await screen.findByText("You talked about the roses.")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("About"), sarah.id);
    await user.type(screen.getByLabelText("Add a memory"), "You baked bread together.");
    await user.click(screen.getByRole("button", { name: "Save memory" }));
    expect(add).toHaveBeenCalledWith(sarah.id, "You baked bread together.");
    expect(await screen.findByText("You baked bread together.", { selector: "p" })).toBeInTheDocument();

    const roses = screen.getByText("You talked about the roses.").closest("li")!;
    await user.click(within(roses).getByRole("button", { name: /Delete/ }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete memory" }));
    expect(del).toHaveBeenCalledWith(7);
    await waitFor(() => expect(screen.queryByText("You talked about the roses.")).not.toBeInTheDocument());
  });

  it("shows an error with retry when memories fail to load", async () => {
    signedIn();
    vi.spyOn(api, "memories").mockRejectedValue(new ApiError("The server had a problem. Please try again.", 500));
    renderAt("/caregiver/memories");
    expect(await screen.findByText("The server had a problem. Please try again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});

const beachPhoto: FamilyPhoto = {
  id: "a".repeat(32),
  caption: "Whitby beach",
  story: "A sunny day by the sea.",
  taken_on: "Summer 1998",
  memory_id: null,
  created_at: "2026-10-01 10:00:00",
  people: [{ id: sarah.id, name: sarah.name, relationship: sarah.relationship }],
  ...photoExtras,
};

describe("family photos", () => {
  it("uploads photos with a caption, story, date and the people in them", async () => {
    signedIn();
    const upload = vi.spyOn(api, "uploadPhotos").mockResolvedValue({ photos: [beachPhoto], rejected: [] });
    const user = userEvent.setup();
    renderAt("/caregiver/photos");
    expect(await screen.findByText("No photos yet")).toBeInTheDocument();

    const file = new File(["jpeg"], "beach.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText("Photos"), file);
    await user.type(screen.getByLabelText("Title"), "Whitby beach");
    await user.type(screen.getByLabelText("When (roughly)"), "Summer 1998");
    await user.type(screen.getByLabelText("The story behind it"), "A sunny day by the sea.");
    await user.click(screen.getByRole("checkbox", { name: /Sarah Johnson/ }));
    await user.click(screen.getByRole("button", { name: "Add photos" }));

    // One request per file, with a progress callback and a way to cancel.
    expect(upload).toHaveBeenCalledWith(
      [file],
      {
        caption: "Whitby beach",
        story: "A sunny day by the sea.",
        taken_on: "Summer 1998",
        location: "",
        category: "",
        prompt: "",
        memory_id: null,
        person_ids: [sarah.id],
      },
      expect.any(Function),
      expect.any(AbortSignal),
    );
    expect(await screen.findByText("1 of 1 photo added.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Whitby beach" })).toBeInTheDocument();
  });

  it("requires a photo before uploading", async () => {
    signedIn();
    const upload = vi.spyOn(api, "uploadPhotos");
    const user = userEvent.setup();
    renderAt("/caregiver/photos");
    await user.click(await screen.findByRole("button", { name: "Add photos" }));
    expect(screen.getByText("Choose at least one photo.")).toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();
  });

  it("edits details, links a memory, and deletes only after confirmation", async () => {
    signedIn();
    vi.spyOn(api, "photos").mockResolvedValue([beachPhoto]);
    const update = vi.spyOn(api, "updatePhoto").mockImplementation(async (_id, d) => ({ ...beachPhoto, caption: d.caption, memory_id: d.memory_id }));
    const del = vi.spyOn(api, "deletePhoto").mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    renderAt("/caregiver/photos");

    await user.click(await screen.findByRole("button", { name: "Edit Whitby beach" }));
    const dialog = screen.getByRole("dialog", { name: "Edit photo details" });
    const caption = within(dialog).getByLabelText("Title");
    await user.clear(caption);
    await user.type(caption, "Whitby harbour");
    await user.selectOptions(within(dialog).getByLabelText(/Show with a memory/), String(memory.id));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(update).toHaveBeenCalledWith(beachPhoto.id, expect.objectContaining({ caption: "Whitby harbour", memory_id: memory.id }));
    expect(await screen.findByRole("heading", { name: "Whitby harbour" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete Whitby harbour" }));
    expect(del).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole("dialog", { name: "Delete this photo?" })).getByRole("button", { name: "Delete photo" }));
    expect(del).toHaveBeenCalledWith(beachPhoto.id);
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Whitby harbour" })).not.toBeInTheDocument());
  });

  it("chooses a family photo as someone's profile picture", async () => {
    signedIn();
    vi.spyOn(api, "person").mockResolvedValue({ person: sarah, memories: [], visits: [] });
    vi.spyOn(api, "photos").mockResolvedValue([beachPhoto]);
    const setProfile = vi.spyOn(api, "setProfilePhoto").mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    renderAt(`/caregiver/people/${sarah.id}`);
    const choice = await screen.findByRole("button", { name: "Whitby beach" });
    expect(choice).toHaveAttribute("aria-pressed", "false");
    await user.click(choice);
    expect(setProfile).toHaveBeenCalledWith(sarah.id, beachPhoto.id);
    await waitFor(() => expect(screen.getByRole("button", { name: /Whitby beach/ })).toHaveAttribute("aria-pressed", "true"));
  });

  it("has no detectable axe violations", async () => {
    signedIn();
    vi.spyOn(api, "photos").mockResolvedValue([beachPhoto]);
    const { container } = renderAt("/caregiver/photos");
    await screen.findByRole("heading", { name: "Whitby beach" });
    expect(await axeViolations(container)).toEqual([]);
  });
});
