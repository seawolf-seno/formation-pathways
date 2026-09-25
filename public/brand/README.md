# Pacifica website assets

Downloaded unchanged from https://www.pacificachristian.org on 2026-09-25 for the Pacifica pathways prototype.

- `pacifica-logo.svg`: https://www.pacificachristian.org/images/template/pacifica-logo.svg (header wordmark)
- `pacifica-logo-white.svg`: https://www.pacificachristian.org/uploads/images/pacifica-logo-footer.svg (footer wordmark)
- `pacifica-glyph-white.svg`: https://www.pacificachristian.org/uploads/images/Icons/pacifica-glyph-white.svg
- `favicon-32.png`: https://www.pacificachristian.org/favicon/favicon-32x32.png

The white SVG artwork needs a dark background. Header navy `#003260` is taken from the website’s mask-icon color; this is not a comprehensive official brand guide. Artwork remains Pacifica’s branding; downloading does not establish a redistribution license. No applicant or student photographs are included.

Browser pages share `components/PacificaLogo.tsx`. Social cards embed the same local SVG, included in the server deployment trace, without fetching external artwork at runtime.
