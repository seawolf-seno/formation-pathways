// The fictional demo (app/(staff), /apply, /applicant, lib/actions.ts) has no
// sign-in of its own. In production the proxy only checks for a school-domain
// account, which a pending or deactivated account also has, and Server Actions
// are public POST endpoints. So every demo page and action calls this: active
// staff only in production, open in local development as before.
//
// Not a view-only account: the demo's buttons write and call Claude, and a
// viewer must not be able to do either. The demo is open in local development,
// which is where a contributor tries it.
import { redirect } from "next/navigation";
import { requireStaff } from "./sor/queries";

export async function requireDemoAccess(): Promise<void> {
  if (process.env.NODE_ENV !== "production") return;
  const staff = await requireStaff();
  if (staff.role === "viewer") redirect("/capture");
}
