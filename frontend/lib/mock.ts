// Deterministic in-browser mock backend, active when NEXT_PUBLIC_USE_MOCKS=true.
// Module-level state persists across a browser session, so optimistic actions
// (duplicate swaps, event ingestion progress) behave like a real API.

import type {
  ClusterPoint,
  DuplicateGroupMember,
  DuplicateGroupRead,
  EventCreate,
  EventRead,
  EventUpdate,
  EventVisibility,
  FaceRead,
  ImagePage,
  ImageRead,
  OrganizerRead,
  PublicEventSummary,
  SearchResult,
} from "./types";

// --- deterministic PRNG -----------------------------------------------------

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

const latency = (ms = 200) => new Promise((r) => setTimeout(r, ms));

// --- events -----------------------------------------------------------------

interface MockEventState {
  event: EventRead;
  /** Number of status polls remaining before advancing a stage. */
  pollsUntilAdvance: number;
}

const ASPECTS: Array<[number, number]> = [
  [6000, 4000],
  [4000, 6000],
  [5472, 3648],
  [3648, 5472],
  [4000, 4000],
  [6720, 4480],
  [3840, 5760],
  [7000, 3500],
];

const eventStates = new Map<string, MockEventState>();
let createdEventCounter = 0;

function seedEvents() {
  if (eventStates.size > 0) return;

  const ready: EventRead = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Arora Wedding — Jaipur",
    slug: "arora-wedding-jaipur",
    status: "ready",
    current_stage: "stage3_faces",
    visibility: "published",
    published_at: "2026-06-29T10:00:00Z",
    error_message: null,
    total_image_count: 4312,
    selected_image_count: 60,
    created_at: "2026-06-28T09:15:00Z",
  };
  const processing: EventRead = {
    id: "22222222-2222-4222-8222-222222222222",
    name: "DevSummit 2026 — Day 1",
    slug: "devsummit-2026-day-1",
    status: "processing",
    current_stage: "stage2_duplicates",
    visibility: "draft",
    published_at: null,
    error_message: null,
    total_image_count: 2891,
    selected_image_count: null,
    created_at: "2026-07-03T18:40:00Z",
  };
  const failed: EventRead = {
    id: "33333333-3333-4333-8333-333333333333",
    name: "City Marathon Finish Line",
    slug: "city-marathon-finish-line",
    status: "failed",
    current_stage: "ingestion",
    visibility: "draft",
    published_at: null,
    error_message: "Source URL returned 403 — collection is not publicly readable.",
    total_image_count: null,
    selected_image_count: null,
    created_at: "2026-07-01T07:05:00Z",
  };

  eventStates.set(ready.id, { event: ready, pollsUntilAdvance: 0 });
  eventStates.set(processing.id, { event: processing, pollsUntilAdvance: 4 });
  eventStates.set(failed.id, { event: failed, pollsUntilAdvance: 0 });
}

/** Advance pending/processing events one notch per few polls so ingestion feels alive. */
function tickEvent(state: MockEventState) {
  const e = state.event;
  if (e.status === "ready" || e.status === "failed") return;
  if (state.pollsUntilAdvance > 0) {
    state.pollsUntilAdvance -= 1;
    return;
  }
  if (e.status === "pending") {
    e.status = "processing";
    e.current_stage = "ingestion";
    e.total_image_count = 1200 + (hashString(e.id) % 4000);
    state.pollsUntilAdvance = 2;
  } else if (e.current_stage === "ingestion") {
    e.current_stage = "stage1_quality";
    state.pollsUntilAdvance = 2;
  } else if (e.current_stage === "stage1_quality") {
    e.current_stage = "stage2_duplicates";
    state.pollsUntilAdvance = 2;
  } else if (e.current_stage === "stage2_duplicates") {
    e.current_stage = "stage3_faces";
    state.pollsUntilAdvance = 2;
  } else {
    e.status = "ready";
    e.selected_image_count = 60;
  }
}

export async function mockListEvents(): Promise<EventRead[]> {
  seedEvents();
  await latency();
  return Array.from(eventStates.values())
    .map((s) => ({ ...s.event }))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export async function mockGetEvent(eventId: string): Promise<EventRead> {
  seedEvents();
  await latency(120);
  const state = eventStates.get(eventId);
  if (!state) throw new Error(`Event ${eventId} not found`);
  tickEvent(state);
  return { ...state.event };
}

export async function mockCreateEvent(body: EventCreate): Promise<EventRead> {
  seedEvents();
  await latency(250);
  createdEventCounter += 1;
  const id = `44444444-4444-4444-8444-${pad(createdEventCounter, 12)}`;
  const event: EventRead = {
    id,
    name: body.name,
    slug: mockSlugify(body.name),
    status: "pending",
    current_stage: "none",
    visibility: "draft",
    published_at: null,
    error_message: null,
    total_image_count: null,
    selected_image_count: null,
    created_at: new Date().toISOString(),
  };
  eventStates.set(id, { event, pollsUntilAdvance: 1 });
  return { ...event };
}

function mockSlugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "event";
}

export async function mockUpdateEvent(
  eventId: string,
  body: EventUpdate,
): Promise<EventRead> {
  seedEvents();
  await latency(150);
  const state = eventStates.get(eventId);
  if (!state) throw new Error(`Event ${eventId} not found`);
  if (body.name !== undefined) state.event.name = body.name;
  if (body.slug !== undefined) state.event.slug = mockSlugify(body.slug);
  return { ...state.event };
}

export async function mockSetVisibility(
  eventId: string,
  visibility: EventVisibility,
): Promise<EventRead> {
  seedEvents();
  await latency(150);
  const state = eventStates.get(eventId);
  if (!state) throw new Error(`Event ${eventId} not found`);
  if (visibility === "published" && state.event.status !== "ready") {
    throw new Error("event pipeline is not ready");
  }
  state.event.visibility = visibility;
  if (visibility === "published" && !state.event.published_at) {
    state.event.published_at = new Date().toISOString();
  }
  return { ...state.event };
}

export async function mockDeleteEvent(eventId: string): Promise<void> {
  seedEvents();
  await latency(200);
  eventStates.delete(eventId);
  galleries.delete(eventId);
}

// --- public (no auth) ---------------------------------------------------------

export async function mockPublicDirectory(): Promise<PublicEventSummary[]> {
  seedEvents();
  await latency(150);
  return Array.from(eventStates.values())
    .filter((s) => s.event.visibility === "published")
    .map((s) => ({
      id: s.event.id,
      slug: s.event.slug,
      name: s.event.name,
      published_at: s.event.published_at,
    }))
    .sort((a, b) => ((a.published_at ?? "") < (b.published_at ?? "") ? 1 : -1));
}

export async function mockResolveSlug(slug: string): Promise<PublicEventSummary> {
  seedEvents();
  await latency(120);
  const state = Array.from(eventStates.values()).find((s) => s.event.slug === slug);
  // Mocks mirror the API's 404-not-403 posture: unpublished looks absent.
  if (!state || state.event.visibility !== "published") {
    throw new Error("event not found");
  }
  return {
    id: state.event.id,
    slug: state.event.slug,
    name: state.event.name,
    published_at: state.event.published_at,
  };
}

// --- auth & organizers ----------------------------------------------------------

const mockOwner: OrganizerRead = {
  id: "99999999-9999-4999-8999-999999999999",
  email: "owner@example.com",
  is_active: true,
  invited_by_id: null,
  created_at: "2026-06-01T08:00:00Z",
};

let mockSessionActive = false;
const mockTeam: OrganizerRead[] = [mockOwner];

export async function mockLogin(
  email: string,
  _password: string,
): Promise<OrganizerRead> {
  await latency(300);
  mockSessionActive = true;
  return { ...mockOwner, email };
}

export async function mockLogout(): Promise<void> {
  await latency(100);
  mockSessionActive = false;
}

export async function mockMe(): Promise<OrganizerRead> {
  await latency(100);
  if (!mockSessionActive) throw new Error("not authenticated");
  return { ...mockOwner };
}

export async function mockForgotPassword(_email: string): Promise<void> {
  await latency(250);
}

export async function mockResetPassword(
  _token: string,
  _newPassword: string,
): Promise<void> {
  await latency(250);
}

export async function mockAcceptInvite(
  _token: string,
  _password: string,
): Promise<void> {
  await latency(250);
  mockSessionActive = false; // real flow sends the invitee to /login next
}

export async function mockListOrganizers(): Promise<OrganizerRead[]> {
  await latency(150);
  return mockTeam.map((o) => ({ ...o }));
}

export async function mockInviteOrganizer(email: string): Promise<OrganizerRead> {
  await latency(300);
  const invitee: OrganizerRead = {
    id: `88888888-8888-4888-8888-${pad(mockTeam.length, 12)}`,
    email,
    is_active: false,
    invited_by_id: mockOwner.id,
    created_at: new Date().toISOString(),
  };
  mockTeam.push(invitee);
  return { ...invitee };
}

// --- images, duplicate groups, faces ----------------------------------------

interface MockGalleryState {
  /** Gallery-visible images in display order (selected frames only). */
  gallery: ImageRead[];
  /** All duplicate groups, keyed by group id. */
  groups: Map<string, DuplicateGroupRead>;
  /** Dimensions for every image id, including non-selected group members. */
  dims: Map<string, { width: number; height: number }>;
  /** Faces per image id. */
  faces: Map<string, FaceRead[]>;
}

const galleries = new Map<string, MockGalleryState>();

function buildGallery(eventId: string): MockGalleryState {
  const existing = galleries.get(eventId);
  if (existing) return existing;

  const rand = mulberry32(hashString(eventId));
  const short = hashString(eventId).toString(16).slice(0, 4).padEnd(4, "0");
  const state: MockGalleryState = {
    gallery: [],
    groups: new Map(),
    dims: new Map(),
    faces: new Map(),
  };

  const IMAGE_COUNT = 60;
  for (let i = 0; i < IMAGE_COUNT; i++) {
    const imageId = `aaaa${short}-0000-4000-8000-${pad(i, 12)}`;
    const [width, height] = ASPECTS[Math.floor(rand() * ASPECTS.length)];
    const faceCount = rand() < 0.45 ? 1 + Math.floor(rand() * 4) : 0;
    state.dims.set(imageId, { width, height });

    // roughly every 6th image anchors a duplicate group
    let duplicateGroup: ImageRead["duplicate_group"] = null;
    if (i % 6 === 3) {
      const groupId = `bbbb${short}-0000-4000-8000-${pad(i, 12)}`;
      const memberCount = 2 + Math.floor(rand() * 4); // 2–5
      const members: DuplicateGroupMember[] = [];
      for (let m = 0; m < memberCount; m++) {
        const memberId =
          m === 0 ? imageId : `cccc${short}-${pad(i, 4)}-4000-8000-${pad(m, 12)}`;
        if (m > 0) state.dims.set(memberId, { width, height });
        members.push({
          id: memberId,
          width,
          height,
          laplacian_score: Math.round((80 + rand() * 220) * 10) / 10,
          nima_score: Math.round((3.5 + rand() * 3) * 100) / 100,
          is_selected: m === 0,
        });
      }
      state.groups.set(groupId, {
        id: groupId,
        selected_image_id: imageId,
        member_count: memberCount,
        members,
      });
      duplicateGroup = { id: groupId, member_count: memberCount };
    }

    // faces with plausible bboxes inside the frame
    if (faceCount > 0) {
      const faces: FaceRead[] = [];
      for (let f = 0; f < faceCount; f++) {
        const w = Math.floor(width * (0.08 + rand() * 0.08));
        const h = Math.floor(w * 1.25);
        faces.push({
          id: `dddd${short}-${pad(i, 4)}-4000-8000-${pad(f, 12)}`,
          image_id: imageId,
          bbox_x: Math.floor(rand() * (width - w)),
          bbox_y: Math.floor(rand() * (height * 0.6)),
          bbox_w: w,
          bbox_h: h,
          detection_confidence: Math.round((0.86 + rand() * 0.13) * 1000) / 1000,
        });
      }
      state.faces.set(imageId, faces);
    }

    state.gallery.push({
      id: imageId,
      status: "stage2_selected",
      width,
      height,
      face_count: faceCount,
      hidden: false,
      duplicate_group: duplicateGroup,
    });
  }

  galleries.set(eventId, state);
  return state;
}

export async function mockListImages(
  eventId: string,
  page: number,
  pageSize: number,
  showHidden = false,
): Promise<ImagePage> {
  await latency(250);
  const state = buildGallery(eventId);
  const visible = showHidden
    ? state.gallery
    : state.gallery.filter((img) => !img.hidden);
  const start = (page - 1) * pageSize;
  return {
    items: visible.slice(start, start + pageSize).map((img) => ({ ...img })),
    page,
    page_size: pageSize,
    total: visible.length,
  };
}

export async function mockSetImageHidden(
  eventId: string,
  imageId: string,
  hidden: boolean,
): Promise<ImageRead> {
  await latency(150);
  const state = buildGallery(eventId);
  const image = state.gallery.find((img) => img.id === imageId);
  if (!image) throw new Error(`Image ${imageId} not found`);
  image.hidden = hidden;
  return { ...image };
}

export async function mockGetDuplicateGroup(
  eventId: string,
  groupId: string,
): Promise<DuplicateGroupRead> {
  await latency(150);
  const state = buildGallery(eventId);
  const group = state.groups.get(groupId);
  if (!group) throw new Error(`Duplicate group ${groupId} not found`);
  return {
    ...group,
    members: group.members.map((m) => ({ ...m })),
  };
}

export async function mockSelectGroupImage(
  eventId: string,
  groupId: string,
  imageId: string,
): Promise<DuplicateGroupRead> {
  await latency(150);
  const state = buildGallery(eventId);
  const group = state.groups.get(groupId);
  if (!group) throw new Error(`Duplicate group ${groupId} not found`);
  const previous = group.selected_image_id;
  group.selected_image_id = imageId;
  group.members = group.members.map((m) => ({ ...m, is_selected: m.id === imageId }));

  // Swap the selected frame into the gallery in place.
  const idx = state.gallery.findIndex((img) => img.id === previous);
  if (idx >= 0 && previous !== imageId) {
    const dims = state.dims.get(imageId) ?? { width: null, height: null };
    const old = state.gallery[idx];
    state.gallery[idx] = {
      ...old,
      id: imageId,
      width: dims.width,
      height: dims.height,
      face_count: state.faces.get(imageId)?.length ?? 0,
    };
  }
  return { ...group, members: group.members.map((m) => ({ ...m })) };
}

export async function mockListFaces(
  eventId: string,
  imageId: string,
): Promise<FaceRead[]> {
  await latency(100);
  const state = buildGallery(eventId);
  return (state.faces.get(imageId) ?? []).map((f) => ({ ...f }));
}

// --- search -----------------------------------------------------------------

function buildResults(eventId: string, seed: number): SearchResult[] {
  const state = buildGallery(eventId);
  const rand = mulberry32(seed);
  const withFaces = state.gallery.filter((img) => img.face_count > 0);
  const count = Math.min(withFaces.length, 8 + Math.floor(rand() * 8));
  const picked = [...withFaces]
    .sort((a, b) => hashString(a.id + seed) - hashString(b.id + seed))
    .slice(0, count);
  return picked
    .map((img) => ({
      image_id: img.id,
      matched_face_id: state.faces.get(img.id)![0].id,
      similarity: Math.round((0.55 + rand() * 0.44) * 1000) / 1000,
      width: img.width,
      height: img.height,
    }))
    .sort((a, b) => b.similarity - a.similarity);
}

export async function mockSearchByUpload(
  eventId: string,
  file: File,
): Promise<SearchResult[]> {
  await latency(600);
  // Deterministic "no face detected" path so the error state is exercisable.
  if (/no.?face/i.test(file.name)) {
    throw new Error("No face detected in the uploaded photo. Try a clearer, front-facing photo.");
  }
  return buildResults(eventId, hashString(file.name + file.size));
}

export async function mockSearchByFace(
  eventId: string,
  faceId: string,
): Promise<SearchResult[]> {
  await latency(350);
  return buildResults(eventId, hashString(faceId));
}

// --- cluster ----------------------------------------------------------------

/**
 * Deterministic 2D "UMAP" projection: gallery images arranged in 8 gaussian
 * blobs. Duplicate-group members land tightly inside one blob; singles
 * scatter more loosely. Coordinates are raw (arbitrary range, can be
 * negative) to exercise the canvas auto-fit.
 */
export async function mockGetClusterPoints(
  eventId: string,
): Promise<ClusterPoint[]> {
  await latency(300);
  const state = buildGallery(eventId);
  const rand = mulberry32(hashString(eventId) ^ 0x9e3779b9);
  const gauss = () => {
    const u = Math.max(rand(), 1e-9);
    const v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  const BLOB_COUNT = 8;
  const centers = Array.from({ length: BLOB_COUNT }, () => ({
    x: (rand() - 0.5) * 90,
    y: (rand() - 0.5) * 70,
  }));

  const groupBlob = new Map<string, number>();
  let nextBlob = 0;

  return state.gallery.map((img, i) => {
    let blobIndex: number;
    let sigma: number;
    const groupId = img.duplicate_group?.id ?? null;
    if (groupId) {
      if (!groupBlob.has(groupId)) {
        groupBlob.set(groupId, nextBlob % BLOB_COUNT);
        nextBlob += 1;
      }
      blobIndex = groupBlob.get(groupId)!;
      sigma = 1.6; // near-duplicates sit close together
    } else {
      blobIndex = i % BLOB_COUNT;
      sigma = 7;
    }
    const center = centers[blobIndex];
    return {
      image_id: img.id,
      x: center.x + gauss() * sigma,
      y: center.y + gauss() * sigma,
      duplicate_group_id: groupId,
    };
  });
}

// --- placeholder imagery ------------------------------------------------------

/**
 * Neutral dark-gray SVG block sized to the image's real aspect ratio,
 * encoded as a data URI. No external placeholder services.
 */
export function mockImageUrl(imageId: string, size: number): string {
  const dims = galleries.size
    ? Array.from(galleries.values())
        .map((g) => g.dims.get(imageId))
        .find(Boolean)
    : undefined;
  const width = dims?.width ?? 1200;
  const height = dims?.height ?? 800;
  const w = size;
  const h = Math.max(1, Math.round((height / width) * size));
  const shade = 24 + (hashString(imageId) % 22); // 24–45 → dark grays
  const c = `rgb(${shade},${shade},${shade})`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect width="${w}" height="${h}" fill="${c}"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
