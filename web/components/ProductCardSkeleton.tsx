import { Skeleton } from "./Skeleton";

// Mirrors ProductCard's footprint (4:5 image + name/category/price lines) so the
// grid doesn't shift when real cards replace the skeletons.
export function ProductCardSkeleton() {
  return (
    <div>
      <Skeleton className="aspect-[4/5] rounded-[1.4rem]" />
      <div className="mt-2.5 px-0.5 flex items-start justify-between gap-2">
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-3 w-1/3" />
        </div>
        <Skeleton className="h-4 w-12 shrink-0" />
      </div>
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-3.5 gap-y-8 sm:gap-x-5 sm:gap-y-11 lg:gap-x-6 lg:gap-y-12">
      {Array.from({ length: count }).map((_, i) => <ProductCardSkeleton key={i} />)}
    </div>
  );
}
