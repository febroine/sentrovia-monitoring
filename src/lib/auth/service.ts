import bcrypt from "bcryptjs";
import { count, eq } from "drizzle-orm";
import { AuthError } from "@/lib/auth/errors";
import type { ChangePasswordInput, LoginInput, RegisterInput } from "@/lib/auth/schemas";
import { createSessionToken, type SessionUser } from "@/lib/auth/token";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { env, getAuthSecret } from "@/lib/env";

type AuthSessionRecord = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  department: string | null;
  createdAt: Date;
};

type AuthLoginRecord = AuthSessionRecord & {
  passwordHash: string;
};

type PasswordRecord = {
  id: string;
  passwordHash: string;
};

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

export async function registerUser(input: RegisterInput) {
  ensureAuthRuntimeReady();
  await assertRegistrationAllowed();

  const existingUser = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1)
    .then((rows) => rows[0]);

  if (existingUser) {
    throw new AuthError("An account with this email already exists.", 409);
  }

  const passwordHash = await bcrypt.hash(input.password, 12);

  const [createdUser] = await db
    .insert(users)
    .values({
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      passwordHash,
    })
    .returning(sessionColumns);

  if (!createdUser) {
    throw new AuthError("Unable to create your account right now.", 500);
  }

  return {
    user: toPublicUser(createdUser),
    token: await createSessionToken(toSessionUser(createdUser)),
  };
}

async function assertRegistrationAllowed() {
  if (env.authAllowPublicSignup) {
    return;
  }

  const [row] = await db.select({ total: count() }).from(users);
  if ((row?.total ?? 0) > 0) {
    throw new AuthError("Registration is disabled for this installation.", 403);
  }
}

export async function loginUser(input: LoginInput) {
  ensureAuthRuntimeReady();

  const user = await db
    .select(loginColumns)
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1)
    .then((rows) => rows[0] as AuthLoginRecord | undefined);

  if (!user) {
    await bcrypt.compare(input.password, DUMMY_PASSWORD_HASH);
    throw new AuthError("Invalid email or password.", 401);
  }

  const isPasswordValid = await bcrypt.compare(input.password, user.passwordHash);

  if (!isPasswordValid) {
    throw new AuthError("Invalid email or password.", 401);
  }

  return {
    user: toPublicUser(user),
    token: await createSessionToken(toSessionUser(user)),
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

  await db
    .update(users)
    .set({
      passwordHash,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

export async function getActiveSessionUser(userId: string) {
  const user = await db
    .select(sessionColumns)
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .then((rows) => rows[0] as AuthSessionRecord | undefined);

  return user ? toSessionUser(user) : null;
}
