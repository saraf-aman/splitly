import { WifiOff } from "lucide-react";

export const OFFLINE_BANNER_H = 28;

export function OfflineBanner() {
  return (
    <div
      className="fixed inset-x-0 top-0 z-30 flex items-center justify-center gap-1.5 bg-amber-500 text-white"
      style={{ height: OFFLINE_BANNER_H }}
    >
      <WifiOff size={12} />
      <span className="text-xs font-medium">You&apos;re offline</span>
    </div>
  );
}
