export class AuthError extends Error {
  constructor(message: string, readonly status: number = 400) {
    super(message);
    this.name = "AuthError";
  }
}

export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}

type DatabaseErrorShape = {
  code?: string;
  errno?: string | number;
  message?: string;
  cause?: DatabaseErrorShape;
};

function unwrapDatabaseError(error: unknown): DatabaseErrorShape {
  const current = (error ?? {}) as DatabaseErrorShape;
  return current.cause ? { ...current.cause, message: current.cause.message ?? current.message } : current;
}

export function toAuthError(error: unknown, fallbackMessage: string) {
  if (isAuthError(error)) {
    return error;
  }

  const databaseError = unwrapDatabaseError(error);
  const message = databaseError.message?.toLowerCase() ?? "";

  if (databaseError?.code === "42703") {
    return new AuthError(
      "Database schema is out of date. Run `npm run db:push` on the server and restart the application.",
      503
    );
  }

  if (message.includes("column") && message.includes("does not exist")) {
    return new AuthError(
      "Database schema is out of date. Run `npm run db:push` on the server and restart the web container.",
      503
    );
  }

  if (databaseError?.code === "28P01") {
    return new AuthError(
      "Database credentials are invalid. Start the Docker PostgreSQL service or update your local database settings in .env.local.",
      503
    );
  }

  if (databaseError?.code === "ECONNREFUSED" || databaseError?.errno === "ECONNREFUSED") {
    return new AuthError(
      "Database is unavailable. Start the PostgreSQL service and run `npm run db:push` once before registering.",
      503
    );
  }

  if (databaseError?.code === "42P01") {
    return new AuthError(
      "Database schema is missing. Run `npm run db:push` before registering.",
      503
    );
  }

  if (message.includes("relation") && message.includes("does not exist")) {
    return new AuthError(
      "Database schema is missing. Run `npm run db:push` on the server and try again.",
      503
    );
  }

  if (databaseError?.code === "23505") {
    return new AuthError("An account with this email already exists.", 409);
  }

  if (message.includes("connect econnrefused") || message.includes("connection refused")) {
    return new AuthError(
      "Database is unavailable. Verify the PostgreSQL host, port, and container status, then try again.",
      503
    );
  }

  if (message.includes("auth_secret must be configured")) {
    return new AuthError(
      "Authentication is not configured for production. Set a strong AUTH_SECRET and restart the application.",
      503
    );
  }

  return new AuthError(fallbackMessage, 500);
}
