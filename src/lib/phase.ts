/** Launch-phase switches. Phase 1 (2026-11-04): Aadhaar / indemnity-bond
 *  verification is OFF — payment accepted is what starts the operation.
 *  Set NEXT_PUBLIC_AADHAAR_REQUIRED=1 to bring the pickup gate, the verify
 *  messages and the "Aadhaar pending" notes back (phase 2). The code behind
 *  it stays in place. */
export const AADHAAR_REQUIRED = process.env.NEXT_PUBLIC_AADHAAR_REQUIRED === "1";

/** Phase 1 went live on this date: the new client messages (captain
 *  assigned, reached hub, delivery captain, problems) go out only for steps
 *  taken from then on, so older moves don't get a burst of late messages. */
export const PHASE1_AT = "2026-11-04T00:00:00+05:30";
export const sincePhase1 = (iso?: string) => !!iso && Date.parse(iso) >= Date.parse(PHASE1_AT);

/** Phase 1 runs the movement in-house: every step from pickup assignment to
 *  delivery is recorded by the team in Operations. No driver app: captains
 *  get no /d links and the desk never waits for a scan from the field.
 *  Set NEXT_PUBLIC_DRIVER_APP=1 to send driver links again. */
export const DRIVER_APP_ENABLED = process.env.NEXT_PUBLIC_DRIVER_APP === "1";
