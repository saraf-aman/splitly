import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Always produces exactly 2 decimal places (e.g. 1050 → "$10.50").
// All money in this app is integer cents, so toFixed(2) is always exact.
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
