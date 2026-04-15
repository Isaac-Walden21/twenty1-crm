// Smoke test for Apollo API key + lodge search.
// Run: APOLLO_API_KEY=... tsx scripts/test-apollo.ts
// Or:  npm run test-apollo  (after adding to package.json)

import { searchLodgeDecisionMakers } from "../src/lib/apollo";

async function main() {
  if (!process.env.APOLLO_API_KEY) {
    console.error("APOLLO_API_KEY not set. Add to .env.local or export in shell.");
    process.exit(1);
  }

  console.log("Searching Apollo: US fishing lodge owners/GMs, 1-50 employees, page 1 x 5...\n");

  const res = await searchLodgeDecisionMakers({ page: 1, perPage: 5 });

  console.log(`Total matches: ${res.pagination.total_entries}`);
  console.log(`Total pages:   ${res.pagination.total_pages}`);
  console.log(`Returned:      ${res.people.length}\n`);

  for (const p of res.people) {
    const org = p.organization;
    console.log("—".repeat(60));
    console.log(`${p.name ?? "(no name)"} — ${p.title ?? "(no title)"}`);
    console.log(`  Email:    ${p.email ?? "(hidden — needs reveal credit)"} [${p.email_status ?? "?"}]`);
    console.log(`  Company:  ${org?.name ?? "?"}`);
    console.log(`  Website:  ${org?.website_url ?? org?.primary_domain ?? "?"}`);
    console.log(`  Location: ${[p.city, p.state].filter(Boolean).join(", ") || "?"}`);
    console.log(`  Size:     ${org?.estimated_num_employees ?? "?"} employees`);
  }

  console.log("\nDone. If emails show as hidden, you need to spend credits to reveal them");
  console.log("(Apollo's default search hides emails until you click reveal / enrich).");
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
