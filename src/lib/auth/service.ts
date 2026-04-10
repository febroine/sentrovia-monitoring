import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { AuthError } from "@/lib/auth/errors";
import type { ChangePasswordInput, LoginInput, RegisterInput } from "@/lib/auth/schemas";
import { createSessionToken, type SessionUser } from "@/lib/auth/token";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export interface PublicUser extends SessionUser {
  fullName: string;
  createdAt: string;
}

const DUMMY_PASSWORD_HASH = "$2b$12$ULM1ZLkMVlqUmKWyZs936uzGo.z3gHkvJXPtcv9aHW.EK/O.wY5RS";

function toSessionUser(user: typeof users.$inferSelect): SessionUser {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    department: user.department ?? null,
  };
}

function toPublicUser(user: typeof users.$inferSelect): PublicUser {
  const safeUser = toSessionUser(user);

  return {
    ...safeUser,
    fullName: `${safeUser.firstName} ${safeUser.lastName}`.trim(),
    createdAt: user.createdAt.toISOString(),
  };
}

export async function registerUser(input: RegisterInput) {
  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, input.email),
    columns: { id: true },
  });

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
      department: input.department,
      passwordHash,
    })
    .returning();

  if (!createdUser) {
    throw new AuthError("Unable to create your account right now.", 500);
  }

  return {
    user: toPublicUser(createdUser),
    token: await createSessionToken(toSessionUser(createdUser)),
  };
}

export async function loginUser(input: LoginInput) {
  const user = await db.query.users.findFirst({
    where: eq(users.email, input.email),
  });

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
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

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
