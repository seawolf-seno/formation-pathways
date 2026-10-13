import { videoThumbnail, videoUrl, type MasteryConfig, type StandardGroup, type Video } from "@/lib/mastery/config";
import { isCovered } from "@/lib/mastery/rules";

/** A unit's videos: its own, then each standard's (no repeats). */
function unitVideos(group: StandardGroup): Video[] {
  const seen = new Set<string>();
  return [...group.videos, ...group.standards.flatMap((s) => s.videos)].filter((v) => !seen.has(v.id) && Boolean(seen.add(v.id)));
}

export function VideoCard({ video }: { video: Video }) {
  return (
    <a
      href={videoUrl(video.id)}
      target="_blank"
      rel="noopener noreferrer"
      className="group block overflow-hidden rounded-xl border border-[var(--color-border)] bg-white hover:border-[var(--color-pacific)]"
    >
      {/* YouTube's own thumbnail; the video opens on youtube.com. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={videoThumbnail(video.id)} alt="" loading="lazy" width={320} height={180} className="aspect-video w-full bg-[var(--color-pacific-light)] object-cover" />
      <span className="block p-3">
        <span className="line-clamp-2 text-sm font-medium text-[var(--color-navy-ink)] group-hover:underline">{video.title}</span>
        <span className="mt-0.5 block text-xs text-[var(--color-ink-muted)]">
          {video.channel}
          {video.topics ? ` · ${video.topics}` : ""}
        </span>
      </span>
    </a>
  );
}

function Unit({ group, open }: { group: StandardGroup; open: boolean }) {
  const videos = unitVideos(group);
  if (!videos.length) return null;
  return (
    <details open={open} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-canvas)]">
      <summary className="cursor-pointer px-4 py-3 font-medium text-[var(--color-navy-ink)]">
        {group.title} <span className="text-xs font-normal text-[var(--color-ink-muted)]">· {videos.length} video{videos.length === 1 ? "" : "s"}</span>
      </summary>
      <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-3">
        {videos.map((v) => (
          <VideoCard key={v.id} video={v} />
        ))}
      </div>
    </details>
  );
}

/**
 * The course's YouTube shelf: the units the class has finished first (what
 * everyone should have by now), then the unit coming up, then the rest. The
 * list is in the standards file, chosen by the teacher; videos link out to
 * YouTube and nothing is embedded.
 */
export function VideoShelf({ config, finishedThrough, you }: { config: MasteryConfig; finishedThrough: number | null; you: boolean }) {
  const withVideos = config.groups.filter((g) => unitVideos(g).length);
  if (!withVideos.length) return null;
  const covered = withVideos.filter((g) => isCovered(g, finishedThrough));
  const next = finishedThrough == null ? null : withVideos.find((g) => g.unitNumber === finishedThrough + 1) ?? null;
  const rest = withVideos.filter((g) => !covered.includes(g) && g !== next);
  return (
    <section>
      <h2 className="font-display text-xl text-[var(--color-navy-ink)]">Videos</h2>
      <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
        {covered.length
          ? `${you ? "Your class has" : "The class has"} finished through ${covered.at(-1)!.title.split(" · ")[0]}. Start here if anything there feels shaky.`
          : "Well-made explanations for each unit, picked for this course."}{" "}
        They open on YouTube.
      </p>
      <div className="mt-3 space-y-2">
        {covered.map((g) => (
          <Unit key={g.code} group={g} open={g === covered.at(-1) || covered.length <= 2} />
        ))}
        {next && (
          <>
            <p className="pt-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">Coming up</p>
            <Unit group={next} open={!covered.length} />
          </>
        )}
        {rest.length > 0 && (
          <>
            {(covered.length > 0 || next) && <p className="pt-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">Later in the course</p>}
            {rest.map((g) => (
              <Unit key={g.code} group={g} open={false} />
            ))}
          </>
        )}
      </div>
    </section>
  );
}
