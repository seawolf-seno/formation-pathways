import type { Viewport } from "next";
import { PhoneCapture } from "@/components/sor/PhoneCapture";
import { getCaptureRoster, requireStaff } from "@/lib/sor/queries";
import { displayName } from "@/lib/sor/types";

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#16324f" };

export default async function CapturePage() {
  const staff = await requireStaff();
  const roster = await getCaptureRoster();
  return (
    <PhoneCapture
      staffName={staff.display_name}
      roster={roster.map((p) => ({ id: p.id, name: displayName(p) }))}
    />
  );
}
