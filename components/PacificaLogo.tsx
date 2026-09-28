import Image from "next/image";

/** Unmodified artwork from Pacifica’s official website. Requires a dark background. */
export function PacificaLogo() {
  return <Image className="pacifica-logo" src="/brand/pacifica-logo.svg" alt="Pacifica Christian High School" width={204} height={48} priority />;
}
