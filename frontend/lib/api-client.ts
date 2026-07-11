// Typed client for the ClairVision API. When NEXT_PUBLIC_USE_MOCKS is not
// explicitly "false", every call is served by lib/mock.ts so the UI works
// before the FastAPI backend exists.

import * as mock from "./mock";
import type {
  DuplicateGroupRead,
  EventCreate,
  EventRead,
  EventUpdate,
  FaceRead,
  ImagePage,
  ImageRead,
  OrganizerRead,
  PublicEventSummary,
  SearchResult,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
export const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS !== "false";

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    // The frontend/API split is cross-origin even in local dev — without
    // this the organizer session cookie is silently never sent.
    credentials: "include",
    headers:
      init?.body instanceof FormData
        ? init?.headers
        : { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    let detail = `Request failed with ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      // keep default detail
    }
    throw new ApiError(detail, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// --- auth -------------------------------------------------------------------

export function login(email: string, password: string): Promise<OrganizerRead> {
  if (USE_MOCKS) return mock.mockLogin(email, password);
  return request<OrganizerRead>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function logout(): Promise<void> {
  if (USE_MOCKS) return mock.mockLogout();
  return request<void>("/auth/logout", { method: "POST" });
}

export function me(): Promise<OrganizerRead> {
  if (USE_MOCKS) return mock.mockMe();
  return request<OrganizerRead>("/auth/me");
}

export function forgotPassword(email: string): Promise<void> {
  if (USE_MOCKS) return mock.mockForgotPassword(email);
  return request<void>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function resetPassword(token: string, newPassword: string): Promise<void> {
  if (USE_MOCKS) return mock.mockResetPassword(token, newPassword);
  return request<void>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, new_password: newPassword }),
  });
}

export function acceptInvite(token: string, password: string): Promise<void> {
  if (USE_MOCKS) return mock.mockAcceptInvite(token, password);
  return request<void>("/auth/accept-invite", {
    method: "POST",
    body: JSON.stringify({ token, password }),
  });
}

// --- organizers ---------------------------------------------------------------

export function listOrganizers(): Promise<OrganizerRead[]> {
  if (USE_MOCKS) return mock.mockListOrganizers();
  return request<OrganizerRead[]>("/organizers");
}

export function inviteOrganizer(email: string): Promise<OrganizerRead> {
  if (USE_MOCKS) return mock.mockInviteOrganizer(email);
  return request<OrganizerRead>("/organizers/invite", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

// --- public (no auth) ---------------------------------------------------------

export function publicDirectory(): Promise<PublicEventSummary[]> {
  if (USE_MOCKS) return mock.mockPublicDirectory();
  return request<PublicEventSummary[]>("/events/directory");
}

export function resolveSlug(slug: string): Promise<PublicEventSummary> {
  if (USE_MOCKS) return mock.mockResolveSlug(slug);
  return request<PublicEventSummary>(`/e/${slug}`);
}

// --- events -----------------------------------------------------------------

export function createEvent(body: EventCreate): Promise<EventRead> {
  if (USE_MOCKS) return mock.mockCreateEvent(body);
  return request<EventRead>("/events", { method: "POST", body: JSON.stringify(body) });
}

export function listEvents(): Promise<EventRead[]> {
  if (USE_MOCKS) return mock.mockListEvents();
  return request<EventRead[]>("/events");
}

export function getEvent(eventId: string): Promise<EventRead> {
  if (USE_MOCKS) return mock.mockGetEvent(eventId);
  return request<EventRead>(`/events/${eventId}`);
}

export function updateEvent(eventId: string, body: EventUpdate): Promise<EventRead> {
  if (USE_MOCKS) return mock.mockUpdateEvent(eventId, body);
  return request<EventRead>(`/events/${eventId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function publishEvent(eventId: string): Promise<EventRead> {
  if (USE_MOCKS) return mock.mockSetVisibility(eventId, "published");
  return request<EventRead>(`/events/${eventId}/publish`, { method: "POST" });
}

export function archiveEvent(eventId: string): Promise<EventRead> {
  if (USE_MOCKS) return mock.mockSetVisibility(eventId, "archived");
  return request<EventRead>(`/events/${eventId}/archive`, { method: "POST" });
}

export function unarchiveEvent(eventId: string): Promise<EventRead> {
  if (USE_MOCKS) return mock.mockSetVisibility(eventId, "draft");
  return request<EventRead>(`/events/${eventId}/unarchive`, { method: "POST" });
}

export function deleteEvent(eventId: string): Promise<void> {
  if (USE_MOCKS) return mock.mockDeleteEvent(eventId);
  return request<void>(`/events/${eventId}`, { method: "DELETE" });
}

// --- images -----------------------------------------------------------------

export function listImages(
  eventId: string,
  page: number,
  pageSize: number,
  showHidden = false,
): Promise<ImagePage> {
  if (USE_MOCKS) return mock.mockListImages(eventId, page, pageSize, showHidden);
  return request<ImagePage>(
    `/events/${eventId}/images?page=${page}&page_size=${pageSize}${
      showHidden ? "&show_hidden=true" : ""
    }`,
  );
}

export function hideImage(eventId: string, imageId: string): Promise<ImageRead> {
  if (USE_MOCKS) return mock.mockSetImageHidden(eventId, imageId, true);
  return request<ImageRead>(`/events/${eventId}/images/${imageId}/hide`, {
    method: "PATCH",
  });
}

export function unhideImage(eventId: string, imageId: string): Promise<ImageRead> {
  if (USE_MOCKS) return mock.mockSetImageHidden(eventId, imageId, false);
  return request<ImageRead>(`/events/${eventId}/images/${imageId}/unhide`, {
    method: "PATCH",
  });
}

export function getDuplicateGroup(
  eventId: string,
  groupId: string,
): Promise<DuplicateGroupRead> {
  if (USE_MOCKS) return mock.mockGetDuplicateGroup(eventId, groupId);
  return request<DuplicateGroupRead>(
    `/events/${eventId}/duplicate-groups/${groupId}`,
  );
}

export function selectGroupImage(
  eventId: string,
  groupId: string,
  imageId: string,
): Promise<DuplicateGroupRead> {
  if (USE_MOCKS) return mock.mockSelectGroupImage(eventId, groupId, imageId);
  return request<DuplicateGroupRead>(
    `/events/${eventId}/duplicate-groups/${groupId}/select`,
    { method: "PATCH", body: JSON.stringify({ image_id: imageId }) },
  );
}

export function listFaces(eventId: string, imageId: string): Promise<FaceRead[]> {
  if (USE_MOCKS) return mock.mockListFaces(eventId, imageId);
  return request<FaceRead[]>(`/events/${eventId}/images/${imageId}/faces`);
}

// --- search -----------------------------------------------------------------

export function searchByUpload(eventId: string, file: File): Promise<SearchResult[]> {
  if (USE_MOCKS) return mock.mockSearchByUpload(eventId, file);
  const form = new FormData();
  form.append("file", file);
  return request<SearchResult[]>(`/events/${eventId}/search/by-upload`, {
    method: "POST",
    body: form,
  });
}

export function searchByFace(eventId: string, faceId: string): Promise<SearchResult[]> {
  if (USE_MOCKS) return mock.mockSearchByFace(eventId, faceId);
  return request<SearchResult[]>(`/events/${eventId}/search/by-face/${faceId}`, {
    method: "POST",
  });
}

// --- image URLs (plain <img src>) --------------------------------------------

export function thumbnailUrl(eventId: string, imageId: string, size = 400): string {
  if (USE_MOCKS) return mock.mockImageUrl(imageId, size);
  return `${API_URL}/events/${eventId}/images/${imageId}/thumbnail?size=${size}`;
}

export function fullImageUrl(eventId: string, imageId: string): string {
  if (USE_MOCKS) return mock.mockImageUrl(imageId, 1600);
  return `${API_URL}/events/${eventId}/images/${imageId}/full`;
}
