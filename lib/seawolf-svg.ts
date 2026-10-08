// Static drawings for share-card images (next/og renders SVG images, not CSS
// animation). Same pup as components/sor/SeawolfSurf.tsx: an original drawing,
// not the school's mascot artwork.

export interface SeawolfColors {
  body: string;
  light: string;
  board: string;
  eye: string;
  nose: string;
  water: string;
}

const dataUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

/** The pup on its board, 120×80, no water. */
export function seawolfSvg(c: SeawolfColors): string {
  return dataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80">
<g transform="rotate(-4 60 54)">
<circle cx="31" cy="49" r="1.6" fill="${c.water}"/><circle cx="27" cy="45" r="1.2" fill="${c.water}"/><circle cx="33" cy="44" r="1" fill="${c.water}"/>
<ellipse cx="60" cy="55" rx="31" ry="4.2" fill="${c.board}"/>
<path d="M33 55 H87" stroke="#ffffff" stroke-width="1" stroke-linecap="round" opacity=".7"/>
<path d="M46 38 Q35 37 33 25 Q37 27 39 26 Q41 32 48 34 Z" fill="${c.body}"/>
<ellipse cx="57" cy="41" rx="14" ry="9.5" fill="${c.body}"/>
<rect x="47" y="44" width="5" height="10" rx="2.5" fill="${c.body}"/>
<rect x="63" y="43" width="5" height="11" rx="2.5" fill="${c.body}"/>
<path d="M62 36 Q69 39 67 47 Q62 46 60 41 Z" fill="${c.light}"/>
<path d="M71 21 L74 9 L78 20 Z" fill="${c.body}"/>
<path d="M64 22 L65 11 L70 19 Z" fill="${c.body}"/>
<circle cx="70" cy="28" r="9" fill="${c.body}"/>
<path d="M75 25 Q86 25 88 30 Q85 34 75 33 Z" fill="${c.light}"/>
<circle cx="87.5" cy="29" r="1.8" fill="${c.nose}"/>
<path d="M80 32 Q83 33.5 85.5 32" stroke="${c.nose}" stroke-width=".9" fill="none" stroke-linecap="round"/>
<circle cx="73.5" cy="25.5" r="1.5" fill="${c.eye}"/><circle cx="73.9" cy="25.1" r=".5" fill="#ffffff"/>
</g></svg>`);
}

/** A band of two rolling waves with a white crest, `width`×`height`. */
export function wavesSvg(width: number, height: number, back: string, front: string, crest: string): string {
  const period = width / 6;
  const amp = height * 0.07;
  const wave = (y: number, shift: number) => {
    let d = `M${-period + shift} ${y}`;
    for (let x = -period + shift; x < width + period; x += period) {
      d += ` q${period / 2} ${-amp * 2} ${period} 0`;
    }
    return d;
  };
  const backY = height * 0.28;
  const frontY = height * 0.45;
  return dataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
<path d="${wave(backY, period / 3)} L${width + period} ${height} L${-period} ${height} Z" fill="${back}" opacity=".85"/>
<path d="${wave(frontY, 0)} L${width + period} ${height} L${-period} ${height} Z" fill="${front}"/>
<path d="${wave(frontY, 0)}" fill="none" stroke="${crest}" stroke-width="${Math.max(3, height * 0.012)}" opacity=".85"/>
</svg>`);
}
