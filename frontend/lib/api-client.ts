// Typed client for the ClairVision API. When NEXT_PUBLIC_USE_MOCKS is not
// explicitly "false", every call is served by lib/mock.ts so the UI works
// before the FastAPI backend exists.

import * as mock from "./mock";
import type {
  ClusterPoint,
  DuplicateGroupRead,
  EventCreate,
  EventRead,
  FaceRead,
  ImagePage,
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
  return (await res.json()) as T;
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

// --- images -----------------------------------------------------------------

export function listImages(
  eventId: string,
  page: number,
  pageSize: number,
): Promise<ImagePage> {
  if (USE_MOCKS) return mock.mockListImages(eventId, page, pageSize);
  return request<ImagePage>(
    `/events/${eventId}/images?page=${page}&page_size=${pageSize}`,
  );
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

// --- cluster ----------------------------------------------------------------

export function getClusterPoints(eventId: string): Promise<ClusterPoint[]> {
  if (USE_MOCKS) return mock.mockGetClusterPoints(eventId);
  return request<ClusterPoint[]>(`/events/${eventId}/cluster`);
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
