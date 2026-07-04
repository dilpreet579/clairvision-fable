"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import ZoomResetButton from "./ZoomResetButton";
import { thumbnailUrl } from "@/lib/api-client";
import type { ClusterPoint } from "@/lib/types";

const PICK_RADIUS_PX = 9;
const SINGLE_COLOR = 0x5f5f5f; // neutral muted gray for images with no group

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Deterministic muted color per duplicate group: hash of the group id picks
 * a hue; saturation/lightness stay low so the palette fits the dark UI.
 */
function groupColor(groupId: string): THREE.Color {
  const hue = (hashString(groupId) % 360) / 360;
  return new THREE.Color().setHSL(hue, 0.35, 0.62);
}

/** Round point sprite (PointsMaterial renders squares by default). */
function circleTexture(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.beginPath();
  ctx.arc(32, 32, 30, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  return new THREE.CanvasTexture(canvas);
}

interface Pick {
  point: ClusterPoint;
  sx: number;
  sy: number;
}

/**
 * Plain-Three.js 2D scatter plot of an event's CLIP embedding projection.
 * Orthographic camera auto-fits the point bounding box; drag pans, wheel
 * zooms around the cursor, hover/click shows a thumbnail-only tooltip.
 * No axes, no gridlines, no legend.
 */
export default function ClusterCanvas({
  eventId,
  points,
}: {
  eventId: string;
  points: ClusterPoint[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const resetRef = useRef<() => void>(() => {});
  const pinnedPointRef = useRef<ClusterPoint | null>(null);
  const [hovered, setHovered] = useState<Pick | null>(null);
  const [pinned, setPinned] = useState<Pick | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || points.length === 0) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setClearColor(0x000000, 0); // page background (#0a0a0a) shows through
    const el = renderer.domElement;
    el.style.display = "block";
    el.style.touchAction = "none";
    el.style.cursor = "default";
    container.appendChild(el);

    const scene = new THREE.Scene();

    // --- auto-fit: bounding box of all points, padded ---
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const spanX = Math.max(maxX - minX, 1e-6);
    const spanY = Math.max(maxY - minY, 1e-6);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const PADDING = 1.12; // ~12% breathing room around the cloud

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.set(centerX, centerY, 5);

    /** Size the frustum so the padded bbox fits the container, aspect-correct. */
    function fitFrustum() {
      const w = container!.clientWidth || 1;
      const h = container!.clientHeight || 1;
      renderer.setSize(w, h);
      const worldPerPixel = Math.max((spanX * PADDING) / w, (spanY * PADDING) / h);
      camera.left = (-w * worldPerPixel) / 2;
      camera.right = (w * worldPerPixel) / 2;
      camera.top = (h * worldPerPixel) / 2;
      camera.bottom = (-h * worldPerPixel) / 2;
      camera.updateProjectionMatrix();
    }

    // --- geometry: one vertex per image, vertex-colored by duplicate group ---
    const positions = new Float32Array(points.length * 3);
    const colors = new Float32Array(points.length * 3);
    points.forEach((p, i) => {
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = 0;
      const c = p.duplicate_group_id
        ? groupColor(p.duplicate_group_id)
        : new THREE.Color(SINGLE_COLOR);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const sprite = circleTexture();
    const material = new THREE.PointsMaterial({
      size: 8,
      sizeAttenuation: false,
      vertexColors: true,
      map: sprite,
      transparent: true,
      alphaTest: 0.5,
    });
    scene.add(new THREE.Points(geometry, material));

    const render = () => {
      camera.updateMatrixWorld();
      renderer.render(scene, camera);
    };

    // --- screen-space projection helpers (used for picking + tooltips) ---
    const projected = new THREE.Vector3();
    function project(p: ClusterPoint): { sx: number; sy: number } {
      camera.updateMatrixWorld();
      projected.set(p.x, p.y, 0).project(camera);
      return {
        sx: ((projected.x + 1) / 2) * container!.clientWidth,
        sy: ((1 - projected.y) / 2) * container!.clientHeight,
      };
    }

    function pickAt(mx: number, my: number): Pick | null {
      let best: Pick | null = null;
      let bestDist = PICK_RADIUS_PX;
      for (const p of points) {
        const { sx, sy } = project(p);
        const d = Math.hypot(sx - mx, sy - my);
        if (d < bestDist) {
          bestDist = d;
          best = { point: p, sx, sy };
        }
      }
      return best;
    }

    /** Keep a pinned tooltip glued to its point through pan/zoom/resize. */
    function refreshPinned() {
      const p = pinnedPointRef.current;
      setPinned(p ? { point: p, ...project(p) } : null);
    }

    // --- interactions: drag to pan, wheel to zoom around cursor ---
    let dragging = false;
    let dragMoved = false;
    let lastX = 0;
    let lastY = 0;

    const onPointerDown = (e: PointerEvent) => {
      dragging = true;
      dragMoved = false;
      lastX = e.clientX;
      lastY = e.clientY;
      el.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      if (dragging) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        if (Math.abs(dx) + Math.abs(dy) > 2) dragMoved = true;
        lastX = e.clientX;
        lastY = e.clientY;
        const wppX = (camera.right - camera.left) / camera.zoom / el.clientWidth;
        const wppY = (camera.top - camera.bottom) / camera.zoom / el.clientHeight;
        camera.position.x -= dx * wppX;
        camera.position.y += dy * wppY;
        render();
        setHovered(null);
        refreshPinned();
      } else {
        const hit = pickAt(mx, my);
        setHovered(hit);
        el.style.cursor = hit ? "pointer" : "default";
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      if (!dragMoved) {
        const rect = el.getBoundingClientRect();
        const hit = pickAt(e.clientX - rect.left, e.clientY - rect.top);
        pinnedPointRef.current = hit?.point ?? null;
        setPinned(hit);
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const ndc = new THREE.Vector3(
        ((e.clientX - rect.left) / el.clientWidth) * 2 - 1,
        -((e.clientY - rect.top) / el.clientHeight) * 2 + 1,
        0,
      );
      camera.updateMatrixWorld();
      const before = ndc.clone().unproject(camera);
      camera.zoom = Math.min(
        60,
        Math.max(0.25, camera.zoom * Math.exp(-e.deltaY * 0.0012)),
      );
      camera.updateProjectionMatrix();
      const after = ndc.clone().unproject(camera);
      camera.position.x += before.x - after.x;
      camera.position.y += before.y - after.y;
      render();
      setHovered(null);
      refreshPinned();
    };

    const onPointerLeave = () => setHovered(null);

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointerleave", onPointerLeave);
    el.addEventListener("wheel", onWheel, { passive: false });

    resetRef.current = () => {
      camera.zoom = 1;
      camera.position.set(centerX, centerY, 5);
      camera.updateProjectionMatrix();
      render();
      refreshPinned();
    };

    const resizeObserver = new ResizeObserver(() => {
      fitFrustum();
      render();
      refreshPinned();
    });
    resizeObserver.observe(container);

    fitFrustum();
    render();

    return () => {
      resizeObserver.disconnect();
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointerleave", onPointerLeave);
      el.removeEventListener("wheel", onWheel);
      geometry.dispose();
      material.dispose();
      sprite.dispose();
      renderer.dispose();
      if (el.parentElement === container) container.removeChild(el);
    };
  }, [points]);

  // Hover takes precedence; a pinned tooltip persists after click.
  const tip = hovered ?? pinned;

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0" />
      <ZoomResetButton onClick={() => resetRef.current()} />
      {tip && (
        <img
          src={thumbnailUrl(eventId, tip.point.image_id, 100)}
          alt=""
          className="pointer-events-none absolute z-10 block max-h-[100px]"
          style={{ left: tip.sx + 12, top: tip.sy + 12 }}
        />
      )}
    </div>
  );
}
