import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api, ApiError, type UploadProgress } from "@/api/client";
import type { AlbumDetail, AlbumSummary, CaregiverAlbum, CurrentPerson, FamilyPhoto, Person } from "@/api/types";
import { axeViolations } from "@/test/axe";
import { maybeSarah, photoExtras, sarah as sarahSeen, serverStatus, unknownFace } from "@/test/fixtures";
import { installSpeechMock } from "@/test/speech";
import CaregiverApp from "./caregiver/CaregiverApp";
import { moved } from "./caregiver/pages/AlbumEditorPage";
import { guidedPrompt, photoItems } from "./patient/album/pieces";
import { PatientScreen } from "./patient/PatientScreen";

// ── fixtures ─────────────────────────────────────────────────────────
const SARAH = sarahSeen.person_id!;
const ANA = "33333333-3333-4333-8333-333333333333";
const ALBUM = "f".repeat(32);

const photo = (n: number, patch: Partial<FamilyPhoto> = {}): FamilyPhoto => ({
  id: String(n).repeat(32).slice(0, 32),
  caption: `Photo ${n}`,
  story: "",
  taken_on: "",
  memory_id: null,
  created_at: `2026-10-0${n} 10:00:00`,
  people: [],
  ...photoExtras,
  albums: [{ id: ALBUM, title: "Whitby summers" }],
  ...patch,
});
const pier = photo(1, {
  caption: "On the pier",
  story: "Ice cream on a windy day.",
  taken_on: "Summer 1998",
  location: "Whitby",
  people: [
    { id: SARAH, name: "Sarah Johnson", relationship: "Daughter" },
    { id: ANA, name: "Ana Lee", relationship: "Granddaughter" },
  ],
  memory_id: 5,
  memory: { id: 5, summary: "You talked about the boats in the harbour.", person_name: "Sarah Johnson", created_at: "2026-10-20 15:00:00" },
});
const garden = photo(2, { caption: "The garden" });
const party = photo(3, { caption: "Birthday tea", story: "Cake for Ana.", prompt: "Would you like to hear about Ana's birthday?" });

const careAlbum: CaregiverAlbum = {
  id: ALBUM,
  title: "Whitby summers",
  description: "Holidays by the sea.",
  cover_photo_id: pier.id,
  cover_chosen: false,
  visible_to_patient: true,
  photo_count: 3,
  created_at: "2026-10-01 10:00:00",
  updated_at: "2026-10-28 10:00:00",
};
const detail = (photos = [pier, garden, party], patch: Partial<CaregiverAlbum> = {}): AlbumDetail => ({
  album: { ...careAlbum, photo_count: photos.length, ...patch },
  photos,
});
const patientAlbum: AlbumSummary = {
  id: ALBUM,
  title: "Whitby summers",
  description: "Holidays by the sea.",
  cover_photo_id: pier.id,
  photo_count: 3,
  updated_at: "2026-10-28 10:00:00",
};
const sarahPerson: Person = {
  id: SARAH, name: "Sarah Johnson", relationship: "Daughter", notes: "", dob: "", tts_greeting: "",
  created_at: "2026-09-01 10:00:00", memory_count: 1, visit_count: 1, last_visit_at: null,
  photo_count: 1, embedding_count: 1, profile_photo_id: null,
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

// ── caregiver ────────────────────────────────────────────────────────
function caregiverSignedIn() {
  vi.spyOn(api, "session").mockResolvedValue({ caregiver: true, patient: true, patient_pin_required: false });
  vi.spyOn(api, "status").mockResolvedValue(serverStatus);
  vi.spyOn(api, "people").mockResolvedValue([sarahPerson]);
  vi.spyOn(api, "memories").mockResolvedValue([]);
  vi.spyOn(api, "photos").mockResolvedValue([pier, garden, party]);
  vi.spyOn(api, "careAlbums").mockResolvedValue([careAlbum]);
  vi.spyOn(api, "careAlbum").mockResolvedValue(detail());
}

function renderCaregiver(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/caregiver/login" element={<p>Sign-in page</p>} />
        <Route path="/caregiver/*" element={<CaregiverApp />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("caregiver: albums", () => {
  it("creates an album after validating its name, then opens it", async () => {
    caregiverSignedIn();
    vi.spyOn(api, "careAlbums").mockResolvedValue([]);
    const create = vi.spyOn(api, "createAlbum").mockResolvedValue(detail([], { title: "Christmas" }));
    vi.spyOn(api, "careAlbum").mockResolvedValue(detail([], { title: "Christmas" }));
    const user = userEvent.setup();
    renderCaregiver("/caregiver/albums");
    expect(await screen.findByText("No albums yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Albums & photos" })).toHaveAttribute("aria-current", "page");

    await user.click(screen.getByRole("button", { name: "Create album" }));
    expect(screen.getByText("Please give the album a name.")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText(/Album name/), "Christmas");
    await user.click(screen.getByRole("button", { name: "Create album" }));
    expect(create).toHaveBeenCalledWith({ title: "Christmas", description: "", visible_to_patient: true });
    expect(await screen.findByRole("heading", { level: 1, name: "Christmas" })).toBeInTheDocument();
    expect(screen.getByText("Album created. Now add some photos.")).toBeInTheDocument();
    expect(screen.getByText("This album is empty")).toBeInTheDocument();
  });

  it("lists albums and marks hidden ones", async () => {
    caregiverSignedIn();
    vi.spyOn(api, "careAlbums").mockResolvedValue([careAlbum, { ...careAlbum, id: "e".repeat(32), title: "Draft", visible_to_patient: false }]);
    renderCaregiver("/caregiver/albums");
    const draft = (await screen.findByRole("link", { name: "Draft" })).closest("article")!;
    expect(within(draft).getByText("Hidden from patient")).toBeInTheDocument();
    const whitby = screen.getByRole("link", { name: "Whitby summers" }).closest("article")!;
    expect(within(whitby).queryByText("Hidden from patient")).not.toBeInTheDocument();
  });

  it("reorders by keyboard-friendly buttons and keeps focus on the moved photo", async () => {
    caregiverSignedIn();
    const order = vi.spyOn(api, "orderAlbum").mockResolvedValue(detail([garden, pier, party]));
    const user = userEvent.setup();
    renderCaregiver(`/caregiver/albums/${ALBUM}`);
    await screen.findByRole("heading", { name: "On the pier" });
    expect(screen.getByRole("button", { name: /move On the pier earlier/ })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /move On the pier later/ }));
    expect(order).toHaveBeenCalledWith(ALBUM, [garden.id, pier.id, party.id]);
    await waitFor(() => expect(screen.getByRole("button", { name: /move On the pier later/ })).toHaveFocus());
    expect(screen.getByText("On the pier moved to position 2 of 3.")).toBeInTheDocument();
    expect(moved(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moved(["a", "b"], 0, -1)).toEqual(["a", "b"]);
  });

  it("chooses a cover, removes from the album, and deletes a photo only after confirmation", async () => {
    caregiverSignedIn();
    const update = vi.spyOn(api, "updateAlbum").mockResolvedValue(detail(undefined, { cover_photo_id: party.id, cover_chosen: true }));
    const remove = vi.spyOn(api, "removeFromAlbum").mockResolvedValue(detail([pier, party]));
    const del = vi.spyOn(api, "deletePhoto").mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    renderCaregiver(`/caregiver/albums/${ALBUM}`);
    await screen.findByRole("heading", { name: "Birthday tea" });

    await user.click(screen.getByRole("button", { name: /Use as cover \(Birthday tea\)/ }));
    expect(update).toHaveBeenCalledWith(ALBUM, { cover_photo_id: party.id });
    expect(await screen.findByRole("button", { name: /Cover photo \(Birthday tea\)/ })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: /Remove The garden from this album/ }));
    expect(remove).toHaveBeenCalledWith(ALBUM, garden.id);
    await waitFor(() => expect(screen.queryByRole("heading", { name: "The garden" })).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Delete On the pier" }));
    const dialog = screen.getByRole("dialog", { name: "Delete this photo?" });
    expect(within(dialog).getByText(/deleted everywhere/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(del).not.toHaveBeenCalled();
  });

  it("deletes the album, optionally with the photos that aren't in another album", async () => {
    caregiverSignedIn();
    const delAlbum = vi.spyOn(api, "deleteAlbum").mockResolvedValue({ ok: true, deleted_photos: 3 });
    const user = userEvent.setup();
    renderCaregiver(`/caregiver/albums/${ALBUM}`);
    await user.click(await screen.findByRole("button", { name: "Delete this album" }));
    const dialog = screen.getByRole("dialog", { name: "Delete “Whitby summers”?" });
    await user.click(within(dialog).getByRole("checkbox", { name: /Also delete the 3 photos/ }));
    await user.click(within(dialog).getByRole("button", { name: "Delete album and photos" }));
    expect(delAlbum).toHaveBeenCalledWith(ALBUM, true);
    expect(await screen.findByRole("heading", { level: 1, name: "Albums & photos" })).toBeInTheDocument();
  });

  it("adds photos that are already in the library", async () => {
    caregiverSignedIn();
    const old = photo(4, { caption: "Old wedding photo", albums: [] });
    vi.spyOn(api, "photos").mockResolvedValue([pier, garden, party, old]);
    const add = vi.spyOn(api, "addToAlbum").mockResolvedValue(detail([pier, garden, party, old]));
    const user = userEvent.setup();
    renderCaregiver(`/caregiver/albums/${ALBUM}`);
    await user.click(await screen.findByRole("button", { name: "Add from all photos" }));
    const dialog = screen.getByRole("dialog", { name: "Add photos you've already uploaded" });
    const choice = await within(dialog).findByRole("checkbox", { name: /Old wedding photo/ });
    expect(within(dialog).queryByRole("checkbox", { name: /On the pier/ })).not.toBeInTheDocument();
    await user.click(choice);
    await user.click(within(dialog).getByRole("button", { name: "Add 1 photo" }));
    expect(add).toHaveBeenCalledWith(ALBUM, [old.id]);
    expect(await screen.findByRole("heading", { name: "Old wedding photo" })).toBeInTheDocument();
  });
});

describe("caregiver: photo uploads", () => {
  it("shows real progress, then a result for every file", async () => {
    caregiverSignedIn();
    const pending = deferred<AlbumDetail & { rejected: [] }>();
    let report: UploadProgress = () => undefined;
    const upload = vi.spyOn(api, "uploadToAlbum").mockImplementation((_id, _files, _d, onProgress) => {
      report = onProgress!;
      return pending.promise;
    });
    const user = userEvent.setup();
    renderCaregiver(`/caregiver/albums/${ALBUM}`);
    await screen.findByRole("heading", { name: "On the pier" });
    await user.upload(screen.getByLabelText("Photos"), new File(["x"], "sea.jpg", { type: "image/jpeg" }));
    await user.type(screen.getByLabelText("Where"), "Whitby");
    await user.click(screen.getByRole("checkbox", { name: /Sarah Johnson/ }));
    await user.click(screen.getByRole("button", { name: "Upload to this album" }));
    expect(upload).toHaveBeenCalledWith(ALBUM, [expect.any(File)], expect.objectContaining({ location: "Whitby", person_ids: [SARAH] }), expect.any(Function), expect.any(AbortSignal));

    act(() => report(50, 100));
    expect(screen.getByRole("progressbar", { name: "Upload progress" })).toHaveAttribute("aria-valuenow", "50");
    expect(screen.getByText("Uploading photo 1 of 1")).toBeInTheDocument();
    await act(async () => pending.resolve({ ...detail([pier, garden, party, photo(5, { caption: "Sea" })]), rejected: [] }));
    expect(await screen.findByText("1 of 1 photo added.")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sea" })).toBeInTheDocument();
  });

  it("refuses unsupported and oversized files before uploading, and explains server rejections", async () => {
    caregiverSignedIn();
    const upload = vi.spyOn(api, "uploadToAlbum").mockResolvedValue({ ...detail(), rejected: [{ filename: "scan.png", status: "invalid_image" }] });
    const user = userEvent.setup({ applyAccept: false });
    renderCaregiver(`/caregiver/albums/${ALBUM}`);
    await screen.findByRole("heading", { name: "On the pier" });
    const big = new File(["x"], "huge.jpg", { type: "image/jpeg" });
    Object.defineProperty(big, "size", { value: 16 * 1024 * 1024 });
    await user.upload(screen.getByLabelText("Photos"), [
      new File(["GIF89a"], "party.gif", { type: "image/gif" }),
      big,
      new File(["x"], "scan.png", { type: "image/png" }),
    ]);
    await user.click(screen.getByRole("button", { name: "Upload to this album" }));
    const results = await screen.findByRole("status");
    expect(within(results).getByText("0 of 3 photos added.")).toBeInTheDocument();
    expect(within(results).getByText(/Not a supported photo type/)).toBeInTheDocument();
    expect(within(results).getByText(/Larger than 15 MB/)).toBeInTheDocument();
    expect(within(results).getByText(/couldn't be read as a photo/)).toBeInTheDocument();
    expect(upload).toHaveBeenCalledTimes(1); // only the PNG reached the server
  });

  it("keeps the files when an upload fails, so trying again is one click", async () => {
    caregiverSignedIn();
    vi.spyOn(api, "uploadToAlbum").mockRejectedValue(new ApiError("That upload is too large. Try fewer or smaller photos at a time.", 413));
    const user = userEvent.setup();
    renderCaregiver(`/caregiver/albums/${ALBUM}`);
    await screen.findByRole("heading", { name: "On the pier" });
    await user.upload(screen.getByLabelText("Photos"), new File(["x"], "sea.jpg", { type: "image/jpeg" }));
    await user.click(screen.getByRole("button", { name: "Upload to this album" }));
    expect(await screen.findByText(/That upload is too large/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "sea.jpg" })).toBeInTheDocument();
  });

  it("an expired session during album editing returns to sign-in", async () => {
    caregiverSignedIn();
    vi.spyOn(api, "orderAlbum").mockRestore();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Caregiver sign-in required" }), { status: 401 })));
    const user = userEvent.setup();
    renderCaregiver(`/caregiver/albums/${ALBUM}`);
    await user.click(await screen.findByRole("button", { name: /move On the pier later/ }));
    expect(await screen.findByText("Sign-in page")).toBeInTheDocument();
  });

  it("album pages have no detectable axe violations", async () => {
    caregiverSignedIn();
    for (const [path, heading] of [["/caregiver/albums", "Whitby summers"], [`/caregiver/albums/${ALBUM}`, "On the pier"]]) {
      const { container, unmount } = renderCaregiver(path);
      await screen.findByRole("heading", { name: heading });
      expect(await axeViolations(container), path).toEqual([]);
      unmount();
    }
  });
});

// ── patient ──────────────────────────────────────────────────────────
function patientDevice(current: { value: CurrentPerson }) {
  vi.spyOn(api, "status").mockResolvedValue(serverStatus);
  vi.spyOn(api, "currentPerson").mockImplementation(async () => current.value);
  vi.spyOn(api, "album").mockResolvedValue({ memories: [], photos: [] });
  vi.spyOn(api, "family").mockResolvedValue([]);
  vi.spyOn(api, "albums").mockResolvedValue([patientAlbum]);
  vi.spyOn(api, "albumPage").mockResolvedValue({ album: patientAlbum, photos: [pier, garden, party], total: 3, limit: 30, offset: 0 });
}

function renderPatient(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/*" element={<PatientScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

const nobody: CurrentPerson = { ...unknownFace, status: "no_face", face_detected: false } as CurrentPerson;

describe("patient: albums", () => {
  it("lists albums with large covers, reachable from the main menu", async () => {
    patientDevice({ value: nobody });
    renderPatient("/albums");
    expect(await screen.findByRole("heading", { level: 1, name: "Photo albums" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Albums" })[0]).toHaveAttribute("aria-current", "page");
    const card = await screen.findByRole("link", { name: /Whitby summers/ });
    expect(card).toHaveAttribute("href", `/albums/${ALBUM}`);
    expect(within(card).getByText("3 photos")).toBeInTheDocument();
  });

  it("shows calm empty and error states", async () => {
    patientDevice({ value: nobody });
    vi.spyOn(api, "albums").mockRejectedValueOnce(new ApiError("down", 0)).mockResolvedValueOnce([]);
    const user = userEvent.setup();
    renderPatient("/albums");
    await user.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No albums yet")).toBeInTheDocument();
  });

  it("an album that is hidden or deleted is simply not available", async () => {
    patientDevice({ value: nobody });
    vi.spyOn(api, "albumPage").mockRejectedValue(new ApiError("Album not found.", 404));
    renderPatient(`/albums/${ALBUM}`);
    expect(await screen.findByText("This album isn't available")).toBeInTheDocument();
  });

  it("opens the viewer with people, place, story and conversation highlight — and never plays by itself", async () => {
    patientDevice({ value: nobody });
    const speech = installSpeechMock();
    const user = userEvent.setup();
    renderPatient(`/albums/${ALBUM}`);
    await user.click(await screen.findByRole("button", { name: "Look through the album" }));
    const viewer = screen.getByRole("dialog", { name: "On the pier" });
    expect(within(viewer).getByText("Summer 1998 · Whitby")).toBeInTheDocument();
    const inPhoto = within(viewer).getByRole("list", { name: "In this photo" });
    expect(within(inPhoto).getByText("Sarah Johnson")).toBeInTheDocument();
    expect(within(inPhoto).getByText(/Granddaughter/)).toBeInTheDocument();
    expect(within(viewer).getByText("You talked about the boats in the harbour.")).toBeInTheDocument();
    expect(within(viewer).getByText("Would you like to hear the story behind this photo?")).toBeInTheDocument();
    expect(speech.spoken).toHaveLength(0);

    await user.click(within(viewer).getByRole("button", { name: "Listen" }));
    expect(speech.spoken.at(-1)?.text).toContain("Ice cream on a windy day.");
    expect(speech.spoken.at(-1)?.text).toContain("From a conversation with Sarah Johnson");

    // Moving on stops the reading; the arrow keys work too.
    const cancels = speech.synth.cancel.mock.calls.length;
    await user.keyboard("{ArrowRight}");
    expect(await screen.findByRole("dialog", { name: "The garden" })).toBeInTheDocument();
    expect(speech.synth.cancel.mock.calls.length).toBeGreaterThan(cancels);
    expect(screen.getByText("Shall we explore another family moment?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show me another" }));
    expect(screen.getByRole("dialog", { name: "Birthday tea" })).toBeInTheDocument();
    expect(screen.getByText("Would you like to hear about Ana's birthday?")).toBeInTheDocument(); // caregiver's own prompt
    // (Escape is the native <dialog> behaviour; jsdom doesn't emulate it — the Playwright spec covers it.)
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("shows a gentle placeholder when a photo can't be loaded", async () => {
    patientDevice({ value: nobody });
    renderPatient(`/albums/${ALBUM}`);
    const img = await screen.findByRole("img", { name: /On the pier, with Sarah Johnson and Ana Lee/ });
    fireEvent.error(img);
    expect(screen.getAllByText("This photo can't be shown right now").length).toBeGreaterThan(0);
  });

  it("loads more photos on request", async () => {
    patientDevice({ value: nobody });
    const page = vi
      .spyOn(api, "albumPage")
      .mockResolvedValueOnce({ album: patientAlbum, photos: [pier], total: 2, limit: 30, offset: 0 })
      .mockResolvedValueOnce({ album: patientAlbum, photos: [garden], total: 2, limit: 30, offset: 1 });
    const user = userEvent.setup();
    renderPatient(`/albums/${ALBUM}`);
    await user.click(await screen.findByRole("button", { name: "Show more photos" }));
    expect(await screen.findByRole("heading", { name: "The garden" })).toBeInTheDocument();
    expect(page).toHaveBeenLastCalledWith(ALBUM, 1, 30);
    expect(screen.queryByRole("button", { name: "Show more photos" })).not.toBeInTheDocument();
  });

  it("prompts are invitations, never tests of memory", () => {
    const texts = photoItems([pier, garden, party, photo(6, { memory: pier.memory })]).map((i) => guidedPrompt(i).text);
    for (const t of texts) expect(t).not.toMatch(/remember|who is|what is|can you|name/i);
    expect(guidedPrompt(photoItems([garden])[0])).toEqual({ text: "Shall we explore another family moment?", action: "next" });
  });

  it("album pages have no detectable axe violations", async () => {
    patientDevice({ value: nobody });
    const { container } = renderPatient(`/albums/${ALBUM}`);
    await screen.findByRole("heading", { name: "On the pier" });
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe("patient: recognition and privacy", () => {
  const sarahDetail = {
    person: { id: SARAH, name: "Sarah Johnson", relationship: "Daughter", description: "", last_visit_at: null, photo_count: 1, recent_memory: null },
    memories: [],
    photos: [pier],
    visits: { count: 1, recent: [] },
  };

  it("an uncertain match never loads that person's photos", async () => {
    const current = { value: maybeSarah };
    patientDevice(current);
    const member = vi.spyOn(api, "familyMember");
    renderPatient("/");
    expect(await screen.findByText(/not sure/i, {}, { timeout: 3000 })).toBeInTheDocument();
    expect(member).not.toHaveBeenCalled();
    expect(screen.queryByText(/Photos with/)).not.toBeInTheDocument();
  });

  it("a confirmed visitor's photos open in the viewer; when the visitor changes it closes and stops reading", async () => {
    const current = { value: sarahSeen };
    patientDevice(current);
    vi.spyOn(api, "familyMember").mockResolvedValue(sarahDetail);
    const speech = installSpeechMock();
    const user = userEvent.setup();
    renderPatient("/");
    await user.click(await screen.findByRole("button", { name: "Look at On the pier" }, { timeout: 3000 }));
    const viewer = screen.getByRole("dialog", { name: "On the pier" });
    await user.click(within(viewer).getByRole("button", { name: "Listen" }));
    expect(speech.spoken.at(-1)?.text).toContain("Ice cream");
    const cancels = speech.synth.cancel.mock.calls.length;

    current.value = unknownFace; // someone the camera doesn't know steps in
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), { timeout: 4000 });
    expect(speech.synth.cancel.mock.calls.length).toBeGreaterThan(cancels);
    expect(screen.queryByText("On the pier")).not.toBeInTheDocument();
    expect(screen.queryByText(/Photos with/)).not.toBeInTheDocument();
  });
});
