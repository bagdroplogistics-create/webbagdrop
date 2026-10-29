import type { Metadata } from "next";
import { Suspense } from "react";
import HeadBoard from "./HeadBoard";

/** /board/[token] — a department head's read-only live board. The token is
 *  a signed, expiring grant for exactly one department view, minted by an
 *  admin on the Dashboard tab; verification and data scoping happen in
 *  /api/board/metrics, so this page carries no secrets of its own. */

export const metadata: Metadata = { title: "Bagdrop · Department board" };

export default function BoardPage({ params }: PageProps<"/board/[token]">) {
  return (
    <Suspense fallback={null}>
      <Resolve params={params} />
    </Suspense>
  );
}

async function Resolve({ params }: { params: PageProps<"/board/[token]">["params"] }) {
  const { token } = await params;
  return <HeadBoard token={decodeURIComponent(token)} />;
}
