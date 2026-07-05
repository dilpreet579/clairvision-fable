// TypeScript mirrors of shared/clairvision_shared/schemas/*.py and db/enums.py.
// UUIDs are strings, datetimes are ISO-8601 strings over the wire.

export type EventStatus = "pending" | "processing" | "ready" | "failed";

// Visibility is the organizer's explicit publish decision — a separate
// axis from the pipeline's EventStatus, never conflated.
export type EventVisibility = "draft" | "published" | "archived";

export type PipelineStage =
  | "none"
  | "ingestion"
  | "stage1_quality"
  | "stage2_duplicates"
  | "stage3_faces";

export type ImageStatus =
  | "pending"
  | "stage1_rejected_blur"
  | "stage1_rejected_quality"
  | "stage1_passed"
  | "stage2_selected"
  | "stage2_not_selected"
  | "failed";

export interface EventCreate {
  name: string;
  source_url: string;
}

export interface EventRead {
  id: string;
  name: string;
  slug: string;
  status: EventStatus;
  current_stage: PipelineStage;
  visibility: EventVisibility;
  published_at: string | null;
  error_message: string | null;
  total_image_count: number | null;
  selected_image_count: number | null;
  created_at: string;
}

export interface EventUpdate {
  name?: string;
  slug?: string;
}

// Deliberately small public-safe shape (directory + slug resolution).
export interface PublicEventSummary {
  id: string;
  slug: string;
  name: string;
  published_at: string | null;
}

export interface OrganizerRead {
  id: string;
  email: string;
  is_active: boolean;
  invited_by_id: string | null;
  created_at: string;
}

export interface DuplicateGroupSummary {
  id: string;
  member_count: number;
}

export interface ImageRead {
  id: string;
  status: ImageStatus;
  width: number | null;
  height: number | null;
  face_count: number;
  hidden: boolean;
  duplicate_group: DuplicateGroupSummary | null;
}

export interface DuplicateGroupMember {
  id: string;
  width: number | null;
  height: number | null;
  laplacian_score: number | null;
  nima_score: number | null;
  is_selected: boolean;
}

export interface DuplicateGroupRead {
  id: string;
  selected_image_id: string | null;
  member_count: number;
  members: DuplicateGroupMember[];
}

export interface FaceRead {
  id: string;
  image_id: string;
  bbox_x: number;
  bbox_y: number;
  bbox_w: number;
  bbox_h: number;
  detection_confidence: number;
}

export interface SearchResult {
  image_id: string;
  matched_face_id: string;
  similarity: number;
  width: number | null;
  height: number | null;
}

// One image's position in the 2D UMAP projection of the event's CLIP
// embeddings, from GET /events/{id}/cluster. x/y are raw UMAP coordinates
// (arbitrary scale/range, can be negative).
export interface ClusterPoint {
  image_id: string;
  x: number;
  y: number;
  duplicate_group_id: string | null;
}

// Paginated listing shape assumed for GET /events/{id}/images.
export interface ImagePage {
  items: ImageRead[];
  page: number;
  page_size: number;
  total: number;
}
