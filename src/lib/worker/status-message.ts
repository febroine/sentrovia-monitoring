const MAX_STATUS_MESSAGE_LENGTH = 240;

export function sanitizeWorkerStatusMessage(message: string | null | undefined) {
  if (!message) {
    return message;
  }

  if (containsDatabaseQueryDetails(message)) {
    return "A worker maintenance task failed. Monitor checks will continue; review the server log for details.";
  }

  if (message.length <= MAX_STATUS_MESSAGE_LENGTH) {
    return message;
  }

  return `${message.slice(0, MAX_STATUS_MESSAGE_LENGTH - 3)}...`;
}

function containsDatabaseQueryDetails(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("failed query:") || (normalized.includes("params:") && normalized.includes("select "));
}
