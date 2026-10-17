import { getDb, insert, doc, docs, resetDatabase, nowIso } from "../src/demo/db.js";

const db = await getDb();
await resetDatabase();
const created = await insert("users", {
  id: "check-user-1",
  email: "check@warq.demo",
  name: "Check User",
  shopName: "Check Shop",
  subscriptionStatus: "active",
  unlimitedAccess: true,
  createdAt: nowIso(),
  updatedAt: nowIso(),
});
const readBack = await doc("SELECT * FROM users WHERE id = $1", ["check-user-1"]);
const groups = await docs("SELECT * FROM users LIMIT 5");
const version = await db.query("SELECT version() AS version");
console.log(JSON.stringify({
  inserted: created,
  readBack,
  count: groups.length,
  engine: version.rows?.[0]?.version,
}, null, 2));
await resetDatabase();
