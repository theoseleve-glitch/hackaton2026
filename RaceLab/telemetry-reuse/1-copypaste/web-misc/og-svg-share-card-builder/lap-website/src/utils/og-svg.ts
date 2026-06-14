// T198 — blog-post OG image SVG builder. Generates a
// 1200×630 SVG with the post title, category eyebrow, and
// LAP brand mark. SVG works as og:image content across the
// major social platforms (Facebook, LinkedIn, Slack,
// Discord, Mastodon); avoids canvas/sharp/satori
// dependencies.

import type {
  BlogPostIndexEntry,
  BlogCategory,
} from '../data/blog-index';

const escapeXml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const CATEGORY_LABELS: Readonly<Record<BlogCategory, string>> = {
  pillar: 'Pillar guide',
  'technique-deep-dive': 'Technique deep-dive',
  'founder-story': 'Founder note',
};

/** Word-wraps a title onto N lines fitting the OG canvas. */
const wrapTitle = (title: string, maxCharsPerLine: number): string[] => {
  const words = title.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= maxCharsPerLine) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current.length > 0) {
    lines.push(current);
  }
  return lines;
};

export const buildBlogPostOgSvg = (
  post: BlogPostIndexEntry,
): string => {
  const eyebrow = CATEGORY_LABELS[post.category];
  const titleLines = wrapTitle(post.title, 36);
  const lineHeight = 84;
  const titleStartY = 250;

  const titleTspans = titleLines
    .map(
      (line, i) =>
        `<tspan x="80" y="${titleStartY + i * lineHeight}">${escapeXml(line)}</tspan>`,
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0a0a0b"/>
  <rect x="0" y="0" width="8" height="630" fill="#a8e60d"/>
  <text x="80" y="120" font-family="ui-sans-serif, system-ui, -apple-system, sans-serif" font-size="22" font-weight="600" fill="#a8e60d" letter-spacing="2" text-transform="uppercase">${escapeXml(eyebrow.toUpperCase())}</text>
  <text font-family="ui-sans-serif, system-ui, -apple-system, sans-serif" font-size="68" font-weight="700" fill="#f5f5f4" letter-spacing="-1">${titleTspans}</text>
  <line x1="80" y1="528" x2="1120" y2="528" stroke="#3a3a3d" stroke-width="1"/>
  <text x="80" y="572" font-family="ui-sans-serif, system-ui, -apple-system, sans-serif" font-size="28" font-weight="700" fill="#f5f5f4" letter-spacing="2">LAP</text>
  <text x="148" y="572" font-family="ui-sans-serif, system-ui, -apple-system, sans-serif" font-size="22" font-weight="400" fill="#a3a3a3">— Driver-facing coaching surface for sim and real-world racing</text>
</svg>
`;
};
