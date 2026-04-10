"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2, Info, RefreshCcw, ShieldAlert, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { LogRecord } from "@/lib/logs/types";

const STATUS_GROUPS = [
  {
    title: "1xx Informational",
    icon: Info,
    accent: "text-sky-600",
    border: "border-l-sky-500",
    items: [
      ["100", "Continue", "The first part of the request was received and the client can continue."],
      ["101", "Switching Protocols", "The server agreed to change the protocol being used."],
      ["102", "Processing", "The server accepted the request and is still working on it."],
      ["103", "Early Hints", "The server is sending preliminary headers before the final response."],
    ],
  },
  {
    title: "2xx Success",
    icon: CheckCircle2,
    accent: "text-emerald-600",
    border: "border-l-emerald-500",
    items: [
      ["200", "OK", "The request completed successfully."],
      ["201", "Created", "The request succeeded and created a new resource."],
      ["202", "Accepted", "The request was accepted for processing but is not finished yet."],
      ["204", "No Content", "The request succeeded and there is no response body to return."],
      ["206", "Partial Content", "The server returned only the requested part of the resource."],
    ],
  },
  {
    title: "3xx Redirection",
    icon: RefreshCcw,
    accent: "text-amber-600",
    border: "border-l-amber-500",
    items: [
      ["301", "Moved Permanently", "The resource has permanently moved to a new URL."],
      ["302", "Found", "The resource is temporarily available at a different URL."],
      ["303", "See Other", "The response should be retrieved from another URL with GET."],
      ["307", "Temporary Redirect", "The request should be repeated at another URL without changing the method."],
      ["308", "Permanent Redirect", "The request should permanently use another URL without changing the method."],
    ],
  },
  {
    title: "4xx Client Errors",
    icon: TriangleAlert,
    accent: "text-orange-600",
    border: "border-l-orange-500",
    items: [
      ["400", "Bad Request", "The server rejected the request because it was invalid."],
      ["401", "Unauthorized", "Authentication is required before access is allowed."],
      ["403", "Forbidden", "The server understood the request but refused access."],
      ["404", "Not Found", "The requested resource could not be found."],
      ["405", "Method Not Allowed", "The HTTP method is not supported for the target resource."],
      ["408", "Request Timeout", "The server timed out while waiting for the request."],
      ["409", "Conflict", "The request conflicts with the current state of the resource."],
      ["429", "Too Many Requests", "The client has sent too many requests in a short time."],
    ],
  },
  {
    title: "5xx Server Errors",
    icon: ShieldAlert,
    accent: "text-red-600",
    border: "border-l-red-500",
    items: [
      ["500", "Internal Server Error", "The server failed while processing the request."],
      ["501", "Not Implemented", "The server does not support the requested functionality."],
      ["502", "Bad Gateway", "An upstream server returned an invalid response."],
      ["503", "Service Unavailable", "The service is temporarily unavailable or overloaded."],
      ["504", "Gateway Timeout", "An upstream dependency took too long to respond."],
      ["505", "HTTP Version Not Supported", "The server does not support the HTTP version used by the request."],
    ],
  },
];

export function StatusCodesClient() {
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogRecord[]>([]);
  const [loading, setLoading] = useState(false);

  async function selectCode(code: string) {
    setSelectedCode(code);
    setLoading(true);

    try {
      const response = await fetch(`/api/logs?statusCode=${code}`, { cache: "no-store" });
      const data = (await response.json()) as { logs?: LogRecord[] };
      setLogs(data.logs ?? []);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <header className="rounded-2xl border bg-card p-6">
        <div className="max-w-3xl space-y-3">
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">HTTP reference</p>
          <h1 className="text-3xl font-semibold tracking-tight">Status Codes</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            A readable English catalog of common HTTP response codes. Click any code to inspect logs that recorded it.
          </p>
        </div>
      </header>

      <div className="grid gap-4">
        {STATUS_GROUPS.map((group, index) => (
          <Card key={group.title} className={`overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300 ${group.border}`} style={{ animationDelay: `${index * 60}ms` }}>
            <CardContent className="p-0">
              <div className="flex items-center justify-between border-b bg-muted/20 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl border bg-background p-2 shadow-sm">
                    <group.icon className={`h-4 w-4 ${group.accent}`} />
                  </div>
                  <p className="text-sm font-medium">{group.title}</p>
                </div>
                <ArrowRight className={`h-4 w-4 ${group.accent}`} />
              </div>
              <div className="divide-y">
                {group.items.map(([code, label, description]) => (
                  <button key={code} type="button" className="grid w-full gap-2 px-4 py-4 text-left transition-colors hover:bg-muted/20 md:grid-cols-[96px_220px_minmax(0,1fr)] md:items-start" onClick={() => void selectCode(code)}>
                    <p className={`text-lg font-semibold tracking-tight ${group.accent}`}>{code}</p>
                    <p className="text-sm font-medium text-foreground">{label}</p>
                    <p className="text-sm text-muted-foreground">{description}</p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {selectedCode ? (
        <Card className="overflow-hidden">
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Logs for HTTP {selectedCode}</p>
                <p className="text-xs text-muted-foreground">Recent event records that captured this status code.</p>
              </div>
              <Badge variant="outline">{logs.length} logs</Badge>
            </div>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading logs...</p>
            ) : logs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No logs recorded for this status code yet.</p>
            ) : (
              <div className="space-y-3">
                {logs.slice(0, 20).map((log) => (
                  <div key={log.id} className="rounded-xl border px-4 py-3">
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="text-sm font-medium">{log.monitorName ?? "Unknown monitor"}</p>
                        <p className="text-xs text-muted-foreground">{log.companyName ?? "Unassigned"} · {new Date(log.createdAt).toLocaleString()}</p>
                      </div>
                      <Badge variant="secondary">{log.eventType}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{log.message ?? log.rcaSummary ?? "No additional details."}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
