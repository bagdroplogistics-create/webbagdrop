/** Standalone smoke test for the WhatsApp bot's pure text-understanding
 *  helpers (extractFields / matchFaq / isOptOut) — NO Supabase/network
 *  calls, deliberately kept separate from a full handleInboundMessage test
 *  given this project's Supabase project is currently over its free-tier
 *  quota (see the chatbot module's final report). Run with:
 *    npx tsx scripts/wa-bot-parsing-smoke-test.mts
 */
import { extractFields, isOptOut, matchFaq } from "../src/lib/waBot";
import { DEFAULT_FAQ } from "../src/lib/waConfig";

const CITY_NAMES = ["Mumbai", "Pune", "Ahmedabad", "Delhi", "Bengaluru", "Hyderabad", "Chennai", "Goa", "Kolkata", "Jaipur"];

let pass = 0, fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       expected: ${JSON.stringify(expected)}\n       actual:   ${JSON.stringify(actual)}`); }
}

console.log("extractFields —");
check("arrow pattern", extractFields("Mumbai to Delhi, 3 bags, 25/12", CITY_NAMES), { fromName: "Mumbai", toName: "Delhi", bags: 3, date: "25/12" });
check("two cities no arrow", extractFields("I'm flying from Pune and going to Goa with 2 suitcases", CITY_NAMES), { fromName: "Pune", toName: "Goa", bags: 2 });
check("word number", extractFields("two bags from Chennai to Bengaluru tomorrow", CITY_NAMES), { fromName: "Chennai", toName: "Bengaluru", bags: 2, date: "tomorrow" });
check("only one city, nothing else", extractFields("I'm in Jaipur right now", CITY_NAMES), { fromName: "Jaipur" });
check("no recognizable city at all", extractFields("hello there, need help", CITY_NAMES), {});
check("unknown city name never half-matched", extractFields("from Mumba to Delhi", CITY_NAMES), { toName: "Delhi" });

console.log("\nreal-world cases that previously broke (2026-11-20) —");
check("'pickup from X ... deliver to Y' despite an unrelated earlier 'to'", extractFields("i want to book bags pickup from mumbai airport and deliver to ahmedabad", CITY_NAMES), { fromName: "Mumbai", toName: "Ahmedabad" });
check("'to deliver to' — the SECOND 'to' is the real one, no 'from' present", extractFields("And how many days take to deliver to Ahmedabad my home", CITY_NAMES), { toName: "Ahmedabad" });
check("direction keyword AFTER the city, not before", extractFields("Ahmedabad drop location", CITY_NAMES), { toName: "Ahmedabad" });
check("'pickup from' with no destination mentioned yet", extractFields("pickup from Goa please", CITY_NAMES), { fromName: "Goa" });
check("weight, not a bag count — must not be read as bags", extractFields("There is one bag 23kg", CITY_NAMES), { bags: 1 });
check("reversed order — destination named first, keyword-driven", extractFields("drop at Goa, picking up from Mumbai", CITY_NAMES), { fromName: "Mumbai", toName: "Goa" });

console.log("\nisOptOut —");
check("STOP alone", isOptOut("STOP"), true);
check("stop with punctuation", isOptOut("stop."), true);
check("unsubscribe", isOptOut("unsubscribe"), true);
check("STOP inside a real sentence must NOT opt out", isOptOut("please stop sending the wrong price"), false);
check("ordinary message", isOptOut("3 bags from Mumbai to Pune"), false);

console.log("\nmatchFaq —");
check("services question", matchFaq("what services do you offer?", DEFAULT_FAQ)?.id, "services");
check("pricing question (loose wording)", matchFaq("how much does it cost for 2 bags", DEFAULT_FAQ)?.id, "pricing");
check("no match on an unrelated message", matchFaq("ok thanks", DEFAULT_FAQ), null);
check("no match on booking details (shouldn't be mistaken for FAQ)", matchFaq("3 bags Mumbai to Pune 25 dec", DEFAULT_FAQ), null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
