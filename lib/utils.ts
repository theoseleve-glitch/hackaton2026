import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes without conflicts. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Two-digit section index, e.g. 3 -> "03". */
export function pad2(n: number) {
  return String(n).padStart(2, "0");
}
