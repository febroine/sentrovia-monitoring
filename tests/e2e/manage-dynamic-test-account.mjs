import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import postgres from "postgres";

const action = process.argv[2];
const runId = normalizeRunId(process.env.SENTROVIA_E2E_RUN_ID ?? "");
const username = `e2e_${runId}`;
const email = `${username}@example.test`;
const sql = postgres({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  database: process.env.POSTGRES_DB,
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  max: 1,
  prepare: false,
});

try {
  if (action === "create") {
    const account = await createDynamicTestAccount();
    process.stdout.write(`${JSON.stringify(account)}\n`);
  } else if (action === "cleanup") {
    await deleteDynamicTestAccount();
  } else {
    throw new Error("Use 'create' or 'cleanup' when managing a dynamic E2E account.");
  }
} finally {
  await sql.end({ timeout: 5 });
}

async function createDynamicTestAccount() {
  const password = `Sentrovia-${crypto.randomBytes(18).toString("base64url")}a1!`;
  const passwordHash = await bcrypt.hash(password, 12);
  const userId = crypto.randomUUID();

  await sql.begin(async (transaction) => {
    await deleteDynamicTestAccount(transaction);
    await transaction`
      insert into users (id, first_name, last_name, email, department, username, password_hash, role)
      values (${userId}, 'E2E', 'Runner', ${email}, 'Automated testing', ${username}, ${passwordHash}, 'admin')
    `;
    await transaction`
      insert into user_settings (id, user_id)
      values (${crypto.randomUUID()}, ${userId})
    `;
  });

  return { email, password, username };
}

async function deleteDynamicTestAccount(executor = sql) {
  await executor`
    delete from users
    where lower(email) = ${email} and lower(username) = ${username}
  `;
}

function normalizeRunId(value) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 36);
  if (normalized.length < 8) {
    throw new Error("SENTROVIA_E2E_RUN_ID must contain at least eight alphanumeric characters.");
  }

  return normalized;
}
