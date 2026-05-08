interface HttpStatusMeta {
  label: string;
  category: "informational" | "success" | "redirection" | "client-error" | "server-error" | "unknown";
  explanation: string;
}

const STATUS_CODES: Record<number, HttpStatusMeta> = {
  200: { label: "OK", category: "success", explanation: "The endpoint responded successfully." },
  201: { label: "Created", category: "success", explanation: "The request succeeded and created a resource." },
  204: { label: "No Content", category: "success", explanation: "The endpoint responded successfully without a body." },
  301: { label: "Moved Permanently", category: "redirection", explanation: "The resource has moved to a new permanent URL." },
  302: { label: "Found", category: "redirection", explanation: "The resource is temporarily available at another URL." },
  307: { label: "Temporary Redirect", category: "redirection", explanation: "The request should be repeated at another URL." },
  308: { label: "Permanent Redirect", category: "redirection", explanation: "The request should permanently use another URL." },
  400: { label: "Bad Request", category: "client-error", explanation: "The server rejected the request as invalid." },
  401: { label: "Unauthorized", category: "client-error", explanation: "Authentication is required before access is allowed." },
  403: { label: "Forbidden", category: "client-error", explanation: "The server understood the request but refused access." },
  404: { label: "Not Found", category: "client-error", explanation: "The requested resource could not be found." },
  408: { label: "Request Timeout", category: "client-error", explanation: "The server timed out waiting for the request." },
  429: { label: "Too Many Requests", category: "client-error", explanation: "The endpoint is rate-limiting repeated requests." },
  500: { label: "Internal Server Error", category: "server-error", explanation: "The application failed while processing the request." },
  502: { label: "Bad Gateway", category: "server-error", explanation: "An upstream server returned an invalid response." },
  503: { label: "Service Unavailable", category: "server-error", explanation: "The service is temporarily unavailable or overloaded." },
  504: { label: "Gateway Timeout", category: "server-error", explanation: "An upstream dependency timed out." },
};

export function getHttpStatusMeta(statusCode: number | null | undefined): HttpStatusMeta | null {
  if (!statusCode) {
    return null;
  }

  return (
    STATUS_CODES[statusCode] ?? {
      label: inferFallbackLabel(statusCode),
      category: inferCategory(statusCode),
      explanation: "The endpoint returned a non-standard or currently unmapped status code.",
    }
  );
}

function inferCategory(statusCode: number): HttpStatusMeta["category"] {
  if (statusCode >= 100 && statusCode < 200) {
    return "informational";
  }

  if (statusCode >= 200 && statusCode < 300) {
    return "success";
  }

  if (statusCode >= 300 && statusCode < 400) {
    return "redirection";
  }

  if (statusCode >= 400 && statusCode < 500) {
    return "client-error";
  }

  if (statusCode >= 500 && statusCode < 600) {
    return "server-error";
  }

  return "unknown";
}

function inferFallbackLabel(statusCode: number) {
  if (statusCode >= 400 && statusCode < 500) {
    return "Client Error";
  }

  if (statusCode >= 500 && statusCode < 600) {
    return "Server Error";
  }

  if (statusCode >= 300 && statusCode < 400) {
    return "Redirect";
  }

  if (statusCode >= 200 && statusCode < 300) {
    return "Success";
  }

  return "Unknown Status";
}
