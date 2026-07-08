import bcrypt from "bcryptjs";
import { count, eq, or, sql } from "drizzle-orm";
import { AuthError } from "@/lib/auth/errors";
import type { ChangePasswordInput, LoginInput, MemberCreateInput, OnboardingInput } from "@/lib/auth/schemas";
import { createSessionToken, type SessionUser, type UserRole } from "@/lib/auth/token";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getAuthSecret } from "@/lib/env";

const ONBOARDING_ADVISORY_LOCK_KEY = 77_481_307;

type AuthSessionRecord = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  department: string | null;
  username: string | null;
  role: string;
  sessionVersion: number;
  createdAt: Date;
};

type AuthLoginRecord = AuthSessionRecord & {
  passwordHash: string;
};

type PasswordRecord = {
  id: string;
  passwordHash: string;
};

type UserCreateExecutor = Pick<typeof db, "insert" | "select">;

interface PublicUser extends SessionUser {
  fullName: string;
  createdAt: string;
}

const DUMMY_PASSWORD_HASH = "$2b$12$ULM1ZLkMVlqUmKWyZs936uzGo.z3gHkvJXPtcv9aHW.EK/O.wY5RS";

const sessionColumns = {
  id: users.id,
  firstName: users.firstName,
  lastName: users.lastName,
  email: users.email,
  department: users.department,
  username: users.username,
  role: users.role,
  sessionVersion: users.sessionVersion,
  createdAt: users.createdAt,
};

const loginColumns = {
  ...sessionColumns,
  passwordHash: users.passwordHash,
};

const passwordColumns = {
  id: users.id,
  passwordHash: users.passwordHash,
};

function toSessionUser(user: AuthSessionRecord): SessionUser {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    department: user.department,
    role: toUserRole(user.role),
  };
}

function toPublicUser(user: AuthSessionRecord): PublicUser {
  const safeUser = toSessionUser(user);

  return {
    ...safeUser,
    fullName: `${safeUser.firstName} ${safeUser.lastName}`.trim(),
    createdAt: user.createdAt.toISOString(),
  };
}

function ensureAuthRuntimeReady() {
  getAuthSecret();
}

export async function isOnboardingRequired(executor: Pick<typeof db, "select"> = db) {
  ensureAuthRuntimeReady();
  const [row] = await executor.select({ total: count() }).from(users);
  return (row?.total ?? 0) === 0;
}

export async function createInitialAdmin(input: OnboardingInput) {
  ensureAuthRuntimeReady();
  const passwordHash = await bcrypt.hash(input.password, 12);

  const createdUser = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${ONBOARDING_ADVISORY_LOCK_KEY})`);

    if (!(await isOnboardingRequired(tx))) {
      throw new AuthError("Workspace onboarding is already complete.", 409);
    }

    return createUserWithPasswordHash(input, "admin", passwordHash, tx);
  });

  return {
    user: toPublicUser(createdUser),
    token: await createSessionToken(toSessionUser(createdUser), createdUser.sessionVersion),
  };
}

export async function createMember(input: MemberCreateInput) {
  ensureAuthRuntimeReady();
  const createdUser = await createUser(input, "member", db);

  return {
    user: serializeMember(createdUser),
  };
}

async function createUser(input: MemberCreateInput | OnboardingInput, role: UserRole, executor: UserCreateExecutor) {
  const passwordHash = await bcrypt.hash(input.password, 12);
  return createUserWithPasswordHash(input, role, passwordHash, executor);
}

async function createUserWithPasswordHash(
  input: MemberCreateInput | OnboardingInput,
  role: UserRole,
  passwordHash: string,
  executor: UserCreateExecutor
) {
  const existingUser = await findExistingAccount(input.email, input.username, executor);

  if (existingUser?.email === input.email) {
    throw new AuthError("An account with this email already exists.", 409);
  }

  if (input.username && existingUser?.username === input.username) {
    throw new AuthError("An account with this username already exists.", 409);
  }

  const [createdUser] = await executor
    .insert(users)
    .values({
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      department: input.department,
      username: input.username ?? null,
      passwordHash,
      role,
    })
    .returning(sessionColumns);

  if (!createdUser) {
    throw new AuthError("Unable to create your account right now.", 500);
  }

  return createdUser;
}

async function findExistingAccount(email: string, username: string | null, executor: Pick<typeof db, "select">) {
  const filters = username ? or(eq(users.email, email), sql`lower(${users.username}) = ${username}`) : eq(users.email, email);

  return executor
    .select({ id: users.id, email: users.email, username: users.username })
    .from(users)
    .where(filters)
    .limit(1)
    .then((rows) => rows[0]);
}

export async function loginUser(input: LoginInput) {
  ensureAuthRuntimeReady();

  const user = await db
    .select(loginColumns)
    .from(users)
    .where(or(eq(users.email, input.identifier), sql`lower(${users.username}) = ${input.identifier}`))
    .limit(1)
    .then((rows) => rows[0] as AuthLoginRecord | undefined);

  if (!user) {
    await bcrypt.compare(input.password, DUMMY_PASSWORD_HASH);
    throw new AuthError("Invalid email, username, or password.", 401);
  }

  const isPasswordValid = await bcrypt.compare(input.password, user.passwordHash);

  if (!isPasswordValid) {
    throw new AuthError("Invalid email, username, or password.", 401);
  }

  return {
    user: toPublicUser(user),
    token: await createSessionToken(toSessionUser(user), user.sessionVersion),
  };
}

export async function changeUserPassword(userId: string, input: ChangePasswordInput) {
  ensureAuthRuntimeReady();

  const user = await db
    .select(passwordColumns)
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .then((rows) => rows[0] as PasswordRecord | undefined);

  if (!user) {
    throw new AuthError("Account not found.", 404);
  }

  const isCurrentPasswordValid = await bcrypt.compare(input.currentPassword, user.passwordHash);

  if (!isCurrentPasswordValid) {
    throw new AuthError("Current password is incorrect.", 401);
  }

  const isSamePassword = await bcrypt.compare(input.newPassword, user.passwordHash);

  if (isSamePassword) {
    throw new AuthError("Choose a new password that is different from the current one.", 400);
  }

  const passwordHash = await bcrypt.hash(input.newPassword, 12);

  const [updatedUser] = await db
    .update(users)
    .set({
      passwordHash,
      sessionVersion: sql`${users.sessionVersion} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning(sessionColumns);

  if (!updatedUser) {
    throw new AuthError("Unable to update your password right now.", 500);
  }

  return {
    user: toSessionUser(updatedUser),
    sessionVersion: updatedUser.sessionVersion,
  };
}

export async function getActiveSessionUser(userId: string, sessionVersion: number) {
  const user = await db
    .select(sessionColumns)
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .then((rows) => rows[0] as AuthSessionRecord | undefined);

  if (!user || !isCurrentSessionVersion(sessionVersion, user.sessionVersion)) {
    return null;
  }

  return {
    ...toSessionUser(user),
    sessionVersion: user.sessionVersion,
  };
}

export function isCurrentSessionVersion(tokenVersion: number, userVersion: number) {
  return Number.isInteger(tokenVersion) && tokenVersion === userVersion;
}

function serializeMember(user: AuthSessionRecord) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    department: user.department,
    role: toUserRole(user.role),
    username: user.username,
    organization: null,
    jobTitle: null,
    createdAt: user.createdAt.toISOString(),
  };
}

function toUserRole(role: string): UserRole {
  return role === "admin" ? "admin" : "member";
}
