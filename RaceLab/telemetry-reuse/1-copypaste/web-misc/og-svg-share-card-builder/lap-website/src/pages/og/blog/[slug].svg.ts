// T198 — dynamic OG image endpoint at
// /og/blog/<slug>.svg. Astro emits one static SVG file per
// BLOG_INDEX entry at build time via getStaticPaths, each
// rendered through the buildBlogPostOgSvg utility.

import type { APIRoute, GetStaticPaths } from 'astro';
import { BLOG_INDEX } from '../../../data/blog-index';
import { buildBlogPostOgSvg } from '../../../utils/og-svg';

export const getStaticPaths: GetStaticPaths = () =>
  BLOG_INDEX.map((post) => ({
    params: { slug: post.slug },
    props: { post },
  }));

interface Props {
  readonly post: (typeof BLOG_INDEX)[number];
}

export const GET: APIRoute<Props> = ({ props }) => {
  const svg = buildBlogPostOgSvg(props.post);
  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
    },
  });
};
