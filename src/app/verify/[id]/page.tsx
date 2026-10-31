import type { Metadata } from "next";
import { Suspense } from "react";
import VerifyClient from "./VerifyClient";

/** /verify/[id] — the pre-pickup indemnity bond (after payment). Params are awaited
 *  inside <Suspense> so the shell still prerenders (Next 16 requirement). */

export const metadata: Metadata = {
  title: "Sign before pickup · Bagdrop",
};

export default function VerifyPage({ params }: PageProps<"/verify/[id]">) {
  return (
    <Suspense fallback={null}>
      <Gate params={params} />
    </Suspense>
  );
}

async function Gate({ params }: { params: PageProps<"/verify/[id]">["params"] }) {
  const { id } = await params;
  return <VerifyClient id={id} />;
}
