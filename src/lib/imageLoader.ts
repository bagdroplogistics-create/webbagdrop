/** next/image custom loader — used only on the two basePath-prefixed
 *  builds (/admin-1, /new-website; see next.config.ts). Next's own built-in
 *  optimizer has a known bug combining basePath with either its default
 *  on-the-fly resizing (internal self-fetch 404s: "url parameter is valid
 *  but internal response is invalid") or images.unoptimized (drops the
 *  basePath prefix from the plain <img src> it generates). A custom loader
 *  sidesteps both: it just returns the local file's own path, correctly
 *  prefixed, with no resizing — same visual result as unoptimized, minus
 *  the bug. Default, unprefixed deployments never load this file. */
export default function basePathImageLoader({ src }: { src: string; width: number; quality?: number }): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  if (/^https?:\/\//.test(src)) return src;
  return src.startsWith("/") ? `${base}${src}` : src;
}
