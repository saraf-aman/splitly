// Where to send someone if they land on /profile directly (no browser history
// to fall back on) or click the top-bar logo while there. Set by whichever
// drawer opened /profile (NavDrawer = a household, PickerNavDrawer = the
// picker) right before navigating. Session-scoped, not persisted long-term —
// this is a "where did you just come from" signal, not a durable preference.
const KEY = "splitly_profile_return";

export function setProfileReturnPath(path: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(KEY, path);
}

export function getProfileReturnPath(): string {
  if (typeof window === "undefined") return "/groups";
  return sessionStorage.getItem(KEY) ?? "/groups";
}
