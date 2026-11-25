import { toString as qrString } from "qrcode";

// Ink on paper, from the palette: an SVG image cannot read the CSS tokens.
const ink = "#1f1a16";
const paper = "#faf6ee";

export function storeUrl(publicUrl: string, slug: string): string {
  return `${publicUrl}/s/${slug}`;
}

// Level M survives a smudge on a printed counter card; the margin is the
// quiet zone that phone cameras need.
export function qrSvg(text: string): Promise<string> {
  return qrString(text, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    color: { dark: ink, light: paper },
  });
}
