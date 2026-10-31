"use client";
/** Client-bundle entry point for the basePath fetch patch in
 *  src/lib/basePath.ts — that module does the actual work at
 *  module-evaluation time (not in a React effect, so it's guaranteed to
 *  run before any component's own effects could fire a fetch() of their
 *  own). This component's only job is to force that module into the
 *  client bundle, mounted first thing in the root layout. Renders nothing. */
import "@/lib/basePath";

export default function BasePathFetch() {
  return null;
}
