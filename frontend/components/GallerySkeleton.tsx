/**
 * Skeleton placeholders that mirror ImageCard dimensions (aspect 4:3 cells).
 * Used instead of spinners everywhere a grid is loading.
 */
export default function GallerySkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="cv-skeleton aspect-[4/3] w-full" />
      ))}
    </div>
  );
}
