import { Card } from "@/components/ui";

/** Placeholder for a module that hasn't been built in this app yet — shown
 *  honestly rather than faked. Matches the static build's module list; see
 *  README.md for the full not-yet-ported list. */
export default function StubModule({ name }: { name: string }) {
  return (
    <Card className="border-dashed p-10 text-center">
      <h2 className="mb-2 font-display text-lg font-bold">{name}</h2>
      <p className="text-sm text-muted">
        Not built in this app yet — this module existed in the original static Admin OS but hasn&apos;t been ported here. Ask to have it built next if you need it.
      </p>
    </Card>
  );
}
