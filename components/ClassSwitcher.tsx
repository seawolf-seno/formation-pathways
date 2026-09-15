"use client";

import { usePathname, useRouter } from "next/navigation";
import type { ClassWithStats } from "@/lib/types";

export function ClassSwitcher({
  classes,
  initialClassId,
}: {
  classes: ClassWithStats[];
  initialClassId: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const match = pathname.match(/^\/classes\/(\d+)/);
  const activeId = match ? Number(match[1]) : initialClassId;

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    if (!value) {
      router.push("/");
      return;
    }
    document.cookie = `lastClassId=${value}; path=/; max-age=${60 * 60 * 24 * 365}`;
    router.push(`/classes/${value}`);
  }

  return (
    <select
      value={activeId ?? ""}
      onChange={handleChange}
      aria-label="Switch class"
      className="rounded-lg border border-white/20 bg-[var(--color-navy-ink)] px-3 py-1.5 text-sm text-white focus:border-[var(--color-pacific)] focus:outline-none"
    >
      <option value="">All students</option>
      {classes.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name} ({c.student_count})
        </option>
      ))}
    </select>
  );
}
