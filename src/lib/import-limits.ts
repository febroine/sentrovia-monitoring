export const MONITOR_CONFIG_IMPORT_LIMITS = {
  maxBytes: 1_000_000,
  maxRequestBytes: 1_100_000,
  maxMonitors: 500,
  maxBytesLabel: "1 MB",
};

export const WORKSPACE_BACKUP_IMPORT_LIMITS = {
  maxBytes: 1_500_000,
  maxRequestBytes: 1_600_000,
  maxCompanies: 200,
  maxMonitors: 500,
  maxBytesLabel: "1.5 MB",
};

export const MONITOR_CSV_IMPORT_LIMITS = {
  maxFileBytes: 2_000_000,
  maxFileBytesLabel: "2 MB",
  // Imported CSV text may grow when it is JSON-escaped and TXT imports also
  // include the selected defaults for every monitor.
  maxRequestBytes: 4_100_000,
  maxRows: 500,
};

export const MAX_MONITORS_PER_USER = 10_000;
