export function resolveDatabaseUrl(environment = process.env, options = {}) {
  const configuredUrl = environment.DATABASE_URL?.trim();
  if (configuredUrl) {
    return configuredUrl;
  }

  const user = environment.POSTGRES_USER || options.defaultUser;
  const password = environment.POSTGRES_PASSWORD;
  const database = environment.POSTGRES_DB || options.defaultDatabase;
  if (!user || !password || !database) {
    return null;
  }

  const protocol = options.protocol || "postgres";
  const host = environment.POSTGRES_HOST || "localhost";
  const port = environment.POSTGRES_PORT || "5432";
  return `${protocol}://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}`;
}
