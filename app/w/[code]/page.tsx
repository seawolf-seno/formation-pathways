import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicShare } from "@/lib/family-page";
import { fitSentences } from "@/lib/family-share";
import { requestOrigin } from "@/lib/origin";
import { SharedPathway } from "@/components/discover/SharedPathway";

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const share = await getPublicShare(code);
  if (!share) return { title: "Pacifica Christian", robots: { index: false, follow: false } };
  const origin = await requestOrigin();
  const title = `A way ${share.firstName} could grow at Pacifica`;
  const description = `“${share.pathway.name}.” ${fitSentences(share.pathway.glimpse || share.pathway.firstSemester, 150)}`;
  const image = { url: `${origin}/w/${code}/card?format=og`, width: 1200, height: 630, alt: `${share.firstName}'s pathway: ${share.pathway.name}` };
  return {
    title: `${title} · Pacifica Christian`,
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, images: [image], type: "website", siteName: "Pacifica Christian High School" },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

/** What a family's shared link opens (components/discover/SharedPathway.tsx). */
export default async function SharedPathwayPage({ params }: Props) {
  const { code } = await params;
  const share = await getPublicShare(code);
  if (!share) notFound();
  return <SharedPathway share={share} cardSrc={`/w/${code}/card?format=feed`} />;
}
