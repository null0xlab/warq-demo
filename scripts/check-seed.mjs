import { getDb, resetDatabase, docs } from "../src/demo/db.js";
import { seedAll, seedSummary, DEMO_ACCOUNTS, PLANS } from "../src/demo/seed.js";
import { listAccounts } from "../src/demo/auth.js";

await getDb();
await resetDatabase();
const result = await seedAll();
const summary = await seedSummary();
const accounts = Object.values(listAccounts());
const qrs = await docs("SELECT status, COUNT(*)::int AS total FROM qrs GROUP BY status ORDER BY status");
const warrantyStates = await docs(`
  SELECT
    CASE
      WHEN warranty_voided_at IS NOT NULL THEN 'voided'
      WHEN returned_at IS NOT NULL THEN 'returned'
      WHEN sold_at IS NULL THEN 'unsold'
      WHEN warranty_expires_at IS NULL THEN 'no_warranty'
      WHEN warranty_expires_at < NOW() THEN 'expired'
      ELSE 'active'
    END AS state,
    COUNT(*)::int AS total
  FROM qrs
  WHERE status <> 'generated'
  GROUP BY 1
  ORDER BY 1
`);
const claims = await docs("SELECT status, COUNT(*)::int AS total FROM claims GROUP BY status ORDER BY status");
const supportMessages = await docs(
  "SELECT (SELECT COUNT(*)::int FROM support_threads) AS threads, (SELECT COUNT(*)::int FROM support_messages) AS messages, (SELECT COUNT(*)::int FROM ai_chat_messages) AS ai",
);
const registry = await docs("SELECT COUNT(*)::int AS total FROM sales");

console.log(
  JSON.stringify(
    {
      seeded: result,
      summary,
      credentials: accounts.map((account) => ({ email: account.email, uid: account.uid, role: account.role })),
      expectedAccounts: DEMO_ACCOUNTS.length,
      plans: Object.values(PLANS).map((plan) => `${plan.id}:${plan.amount}`),
      qrsByStatus: qrs,
      warrantyStates,
      claims,
      chat: supportMessages[0],
      sales: registry[0]?.total,
    },
    null,
    2,
  ),
);

await resetDatabase();
