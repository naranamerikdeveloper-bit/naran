import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn-style class combiner: conditional classes + Tailwind conflict merging. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
