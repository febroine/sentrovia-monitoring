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
};

export function toAuthError(error: unknown, fallbackMessage: string) {
  if (isAuthError(error)) {
    return error;
  }

  const databaseError = error as DatabaseErrorShape | undefined;

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

  return new AuthError(fallbackMessage, 500);
}
