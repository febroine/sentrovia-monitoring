import path from "node:path";
import { pathToFileURL } from "node:url";
import nextEnv from "@next/env";
import postgres from "postgres";
import { resolveDatabaseUrl } from "./database-url.mjs";

const ONBOARDING_ADVISORY_LOCK_KEY = 77_481_307;
const ADMIN_MEMBERSHIP_ADVISORY_LOCK_KEY = 63_194_207;
const { loadEnvConfig } = nextEnv;

export function parseRecoveryIdentifier(args) {
  const inlineValue = args.find((argument) => argument.startsWith("--identifier="))?.slice("--identifier=".length);
  const optionIndex = args.indexOf("--identifier");
  const value = inlineValue ?? (optionIndex >= 0 ? args[optionIndex + 1] : undefined);
  const identifier = value?.trim().toLowerCase() ?? "";

  if (!identifier || identifier.startsWith("--")) {
    throw new Error("Provide an existing email or username with --identifier.");
  }
  if (identifier.length > 255) {
    throw new Error("The recovery identifier is too long.");
  }

  return identifier;
}

// Access comes from workspace memberships (users.role is a legacy copy), so recovery promotes the
// account's membership in each of its workspaces that has no admin left.
export async function recoverAdmin(sql, identifier) {
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${ONBOARDING_ADVISORY_LOCK_KEY})`;
    await tx`select pg_advisory_xact_lock(${ADMIN_MEMBERSHIP_ADVISORY_LOCK_KEY})`;

    const [counts] = await tx`select count(*)::integer as user_count from users`;
    if (counts.user_count === 0) {
      throw new Error("No accounts exist. Complete first-run onboarding instead.");
    }

    const matches = await tx`
      select id, email, username
      from users
      where lower(email) = ${identifier} or lower(username) = ${identifier}
      limit 2
    `;
    if (matches.length === 0) {
      throw new Error("No account matches that email or username.");
    }
    if (matches.length > 1) {
      throw new Error("The identifier is ambiguous. Use the account email address.");
    }
    const account = matches[0];

    const memberships = await tx`
      select membership.workspace_id,
        exists (
          select 1 from workspace_members admin
          where admin.workspace_id = membership.workspace_id and admin.role = 'admin'
        ) as has_admin
      from workspace_members membership
      where membership.user_id = ${account.id}
    `;
    if (memberships.length === 0) {
      throw new Error("That account is not a member of any workspace.");
    }
    const workspaceIds = memberships.filter((row) => !row.has_admin).map((row) => row.workspace_id);
    if (workspaceIds.length === 0) {
      throw new Error("Recovery stopped because the workspace already has an admin.");
    }

    await tx`
      update workspace_members
      set role = 'admin', updated_at = now()
      where user_id = ${account.id} and workspace_id in ${tx(workspaceIds)}
    `;
    await tx`
      update users
      set role = 'admin', session_version = session_version + 1, updated_at = now()
      where id = ${account.id}
    `;
    return { email: account.email, username: account.username, workspaces: workspaceIds.length };
  });
}

async function main() {
  loadEnvConfig(process.cwd());
  const identifier = parseRecoveryIdentifier(process.argv.slice(2));
  const databaseUrl = resolveDatabaseUrl(process.env);
  if (!databaseUrl) {
    throw new Error("Database connection is not configured in .env.local or .env.");
  }

  const sql = postgres(databaseUrl, { max: 1, prepare: false, connect_timeout: 10 });
  try {
    const account = await recoverAdmin(sql, identifier);
    console.log(`Admin access restored for ${account.email}. Existing sessions for that account were closed.`);
  } finally {
    await sql.end({ timeout: 5 }).catch(() => undefined);
  }
}

function isMainModule() {
  return Boolean(process.argv[1]) && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
}

if (isMainModule()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Admin recovery failed.");
    process.exitCode = 1;
  });
}
