import { NextResponse, type NextRequest } from "next/server";
import { logAccess, requireStaff } from "@/lib/sor/queries";
import { getSorClient } from "@/lib/sor/supabase-server";
import { importConfigFromEnv, toFinalsiteCsv, type InquiryRow } from "@/lib/finalsite-import";

/**
 * Inquiries as a Finalsite Enrollment Create-import CSV (docs/inquiries.md).
 * POST from /pilot/inquiries, admin and admissions only (RLS backs this up).
 * - scope=new: real inquiries not yet exported; marks them exported.
 * - scope=all: every real inquiry again (nothing is marked).
 * - scope=samples: fictional samples only, to check the file's shape.
 *   Never import that one into Finalsite.
 */
export async function POST(request: NextRequest) {
  const staff = await requireStaff();
  if (staff.role !== "admin" && staff.role !== "admissions") {
    return new NextResponse("Only admissions and admins can export inquiries.", { status: 403 });
  }
  const scope = String((await request.formData()).get("scope") ?? "new");
  if (!["new", "all", "samples"].includes(scope)) return new NextResponse("Unknown export.", { status: 400 });

  const supabase = await getSorClient();
  let query = supabase.from("inquiries").select("*").eq("is_sample", scope === "samples").order("created_at");
  if (scope === "new") query = query.is("finalsite_exported_at", null);
  const { data, error } = await query;
  if (error) return new NextResponse(`Couldn't read inquiries: ${error.message}`, { status: 500 });
  const rows = (data ?? []) as (InquiryRow & { id: string })[];

  const csv = toFinalsiteCsv(rows, importConfigFromEnv(process.env));
  if (scope === "new" && rows.length) {
    const { error: markError } = await supabase
      .from("inquiries")
      .update({ finalsite_exported_at: new Date().toISOString() })
      .in("id", rows.map((r) => r.id));
    if (markError) return new NextResponse(`Couldn't mark the export: ${markError.message}`, { status: 500 });
  }
  await logAccess(staff, "inquiries_export", null, { scope, count: rows.length });

  const day = new Date().toISOString().slice(0, 10);
  const name = scope === "samples" ? `SAMPLE-do-not-import-${day}.csv` : `finalsite-inquiries-${scope}-${day}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
