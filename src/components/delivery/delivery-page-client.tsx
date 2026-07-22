"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, FlaskConical, Inbox, RefreshCw, RotateCcw, Send, Trash2, Webhook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatCalendarDateInput, shiftLocalCalendarDays } from "@/lib/delivery/history-range";
import type { DeliveryHistoryRecord, DeliveryOverview } from "@/lib/delivery/types";
import { toEnglishUppercase } from "@/lib/text/casing";

const EMPTY_OVERVIEW: DeliveryOverview = {
  webhook: null,
  history: [],
  summary: { delivered: 0, failed: 0, retrying: 0, pendingWebhookRetries: 0 },
  pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 1 },
};

type MessageResponse = { message?: string };
type HistoryDeletionRange = "last_7_days" | "last_30_days" | "custom";

export function DeliveryPageClient() {
  const [overview, setOverview] = useState<DeliveryOverview>(EMPTY_OVERVIEW);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [webhookActive, setWebhookActive] = useState(true);
  const [emailTarget, setEmailTarget] = useState("");
  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [testMessage, setTestMessage] = useState("Sentrovia delivery smoke test.");
  const [selectedRow, setSelectedRow] = useState<DeliveryHistoryRecord | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [clearHistoryOpen, setClearHistoryOpen] = useState(false);
  const [historyDeletionRange, setHistoryDeletionRange] = useState<HistoryDeletionRange>("last_7_days");
  const [customFrom, setCustomFrom] = useState(() => formatCalendarDateInput(shiftLocalCalendarDays(new Date(), -7)));
  const [customTo, setCustomTo] = useState(() => formatCalendarDateInput(new Date()));

  const cards = useMemo(
    () => [
      {
        label: "Delivered",
        value: String(overview.summary.delivered),
        sub: "All completed deliveries",
        border: "border-l-emerald-500",
      },
      {
        label: "Retry Queue",
        value: String(overview.summary.pendingWebhookRetries),
        sub: "Webhook items waiting for retry",
        border: "border-l-amber-500",
      },
      {
        label: "Failed",
        value: String(overview.summary.failed),
        sub: "Review failed attempts",
        border: "border-l-rose-500",
      },
      {
        label: "Retrying",
        value: String(overview.summary.retrying),
        sub: "Waiting for the next attempt",
        border: "border-l-slate-400",
      },
    ],
    [overview.summary]
  );

  const loadOverview = useCallback(async (requestedPage = 1) => {
    setLoading(true);

    try {
      const response = await fetch(`/api/delivery?page=${requestedPage}`, { cache: "no-store" });
      const data = await readJsonOrNull<{ overview?: DeliveryOverview; message?: string }>(response);
      if (!response.ok) {
        throw new Error(data?.message ?? "Unable to load delivery operations.");
      }

      const nextOverview = data?.overview ?? EMPTY_OVERVIEW;
      setOverview(nextOverview);
      setHistoryPage(nextOverview.pagination.page);
      setWebhookUrl(nextOverview.webhook?.url ?? "");
      setWebhookActive(nextOverview.webhook?.isActive ?? true);
      setMessage(null);
    } catch (error) {
      setMessage(toMessage(error, "Unable to load delivery operations."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadOverview(1);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadOverview]);

  async function saveWebhook() {
    setPendingAction("save-webhook");

    try {
      const response = await fetch("/api/delivery", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: webhookUrl, secret: webhookSecret, isActive: webhookActive }),
      });
      const data = await readJsonOrNull<{ overview?: DeliveryOverview; message?: string }>(response);
      if (!response.ok) {
        throw new Error(data?.message ?? "Unable to save webhook settings.");
      }

      setOverview(data?.overview ?? EMPTY_OVERVIEW);
      setHistoryPage(data?.overview?.pagination.page ?? 1);
      setWebhookSecret("");
      setMessage("Webhook endpoint saved.");
    } catch (error) {
      setMessage(toMessage(error, "Unable to save webhook settings."));
    } finally {
      setPendingAction(null);
    }
  }

  async function sendTest(channel: "email" | "telegram" | "webhook" | "discord") {
    setPendingAction(`test-${channel}`);

    try {
      const response = await fetch("/api/delivery/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          destination: emailTarget,
          botToken: telegramBotToken,
          chatId: telegramChatId,
          message: testMessage,
        }),
      });
      const data = await readJsonOrNull<MessageResponse>(response);
      if (!response.ok) {
        throw new Error(data?.message ?? `Unable to send ${channel} test.`);
      }

      await loadOverview(1);
      setMessage(`${toTitleCase(channel)} test sent.`);
    } catch (error) {
      setMessage(toMessage(error, `Unable to send ${channel} test.`));
    } finally {
      setPendingAction(null);
    }
  }

  async function retryQueue() {
    setPendingAction("retry-queue");

    try {
      const response = await fetch("/api/delivery/retry", { method: "POST" });
      const data = await readJsonOrNull<{
        overview?: DeliveryOverview;
        result?: { processed: number };
        message?: string;
      }>(response);
      if (!response.ok) {
        throw new Error(data?.message ?? "Unable to retry webhook queue.");
      }

      setOverview(data?.overview ?? EMPTY_OVERVIEW);
      setHistoryPage(data?.overview?.pagination.page ?? 1);
      setMessage(`Processed ${data?.result?.processed ?? 0} webhook retry item(s).`);
    } catch (error) {
      setMessage(toMessage(error, "Unable to retry webhook queue."));
    } finally {
      setPendingAction(null);
    }
  }

  async function deleteHistory() {
    setPendingAction("delete-history");

    try {
      const response = await fetch("/api/delivery", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          range: historyDeletionRange,
          from: historyDeletionRange === "custom" ? customFrom : undefined,
          to: historyDeletionRange === "custom" ? customTo : undefined,
          timezoneOffsetMinutes: historyDeletionRange === "custom" ? new Date().getTimezoneOffset() : undefined,
        }),
      });
      const data = await readJsonOrNull<{ count?: number; overview?: DeliveryOverview; message?: string }>(response);
      if (!response.ok) {
        throw new Error(data?.message ?? "Unable to delete delivery history.");
      }

      const nextOverview = data?.overview ?? EMPTY_OVERVIEW;
      setOverview(nextOverview);
      setHistoryPage(nextOverview.pagination.page);
      setSelectedRow(null);
      setClearHistoryOpen(false);
      setMessage(`Deleted ${data?.count ?? 0} completed delivery record(s).`);
    } catch (error) {
      setMessage(toMessage(error, "Unable to delete delivery history."));
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Notification delivery</h1>
          <p className="text-sm text-muted-foreground">
            Manage webhook delivery, run email and telegram smoke tests, and review the retry queue.
          </p>
        </div>
        <Button variant="outline" onClick={() => void loadOverview(historyPage)} disabled={loading}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </header>

      {message ? <div className="rounded-lg border px-4 py-3 text-sm">{message}</div> : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label} className="overflow-hidden">
            <CardContent className={`border-l-2 px-4 py-3 ${card.border}`}>
              <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
              <p className="mt-2 text-xl font-semibold tracking-tight">{card.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{card.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/15 pb-3">
            <CardTitle className="text-base">Webhook endpoint</CardTitle>
            <CardDescription>Store one outbound webhook and let Sentrovia retry failed posts.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 border-l-2 border-l-sky-500 p-5">
            <Field label="URL" id="webhook-url" value={webhookUrl} onChange={setWebhookUrl} placeholder="https://hooks.example.com/sentrovia" />
            <Field label="Secret" id="webhook-secret" value={webhookSecret} onChange={setWebhookSecret} placeholder={overview.webhook?.secretConfigured ? "Secret already configured" : "Optional HMAC shared secret"} />
            <div className="flex items-center justify-between rounded-lg border px-3 py-3">
              <div>
                <p className="text-sm font-medium">Webhook Active</p>
                <p className="text-xs text-muted-foreground">Inactive endpoints stay saved but stop receiving events.</p>
              </div>
              <Switch checked={webhookActive} onCheckedChange={setWebhookActive} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void saveWebhook()} disabled={!webhookUrl.trim() || pendingAction !== null}>
                <Webhook className="mr-2 h-4 w-4" />
                Save Webhook
              </Button>
              <Button variant="outline" onClick={() => void sendTest("webhook")} disabled={!webhookUrl.trim() || pendingAction !== null}>
                <Send className="mr-2 h-4 w-4" />
                Send Test Webhook
              </Button>
              <Button variant="outline" onClick={() => void retryQueue()} disabled={pendingAction !== null}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Retry Queue
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/15 pb-3">
            <CardTitle className="text-base">Test delivery</CardTitle>
            <CardDescription>Validate email and telegram routing before relying on alerts.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 border-l-2 border-l-violet-500 p-5">
            {pendingAction ? <ActionProgress label={pendingAction} /> : null}
            <Field label="Email Target" id="email-target" value={emailTarget} onChange={setEmailTarget} placeholder="alerts@example.com" />
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Telegram Bot Token" id="telegram-token" value={telegramBotToken} onChange={setTelegramBotToken} placeholder="123456:ABC..." />
              <Field label="Telegram Chat ID" id="telegram-chat-id" value={telegramChatId} onChange={setTelegramChatId} placeholder="-1001234567890" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="delivery-message">Message</Label>
              <Textarea id="delivery-message" value={testMessage} onChange={(event) => setTestMessage(event.target.value)} rows={4} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button className="bg-violet-600 text-white hover:bg-violet-500" onClick={() => void sendTest("email")} disabled={pendingAction !== null}>
                <FlaskConical className="mr-2 h-4 w-4" />
                Test Email
              </Button>
              <Button className="bg-violet-600 text-white hover:bg-violet-500" onClick={() => void sendTest("telegram")} disabled={pendingAction !== null}>
                <FlaskConical className="mr-2 h-4 w-4" />
                Test Telegram
              </Button>
              <Button variant="outline" onClick={() => void sendTest("discord")} disabled={pendingAction !== null}>
                <FlaskConical className="mr-2 h-4 w-4" />
                Test Discord
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/15 pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1.5">
              <CardTitle className="text-base">Delivery history</CardTitle>
              <CardDescription>Email, Telegram, Discord, and webhook attempts ordered from newest to oldest.</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setClearHistoryOpen(true)}
              disabled={pendingAction !== null || overview.summary.delivered + overview.summary.failed === 0}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Clear History
            </Button>
          </div>
        </CardHeader>
        <CardContent className="border-l-2 border-l-emerald-500 p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="pl-6">Channel</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Response</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overview.history.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <EmptyState
                      icon={Inbox}
                      title="No deliveries recorded yet"
                      description="Delivery attempts will appear here after alerts, report sends, or test messages run."
                    />
                  </TableCell>
                </TableRow>
              ) : (
                overview.history.map((item) => (
                  <TableRow key={item.id} className="cursor-pointer" onClick={() => setSelectedRow(item)}>
                    <TableCell className="pl-6">
                      <span className="inline-flex rounded-full border border-border/70 bg-muted/20 px-2.5 py-1 text-xs font-medium">
                        {toTitleCase(item.channel)}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium">{toTitleCase(item.kind)}</TableCell>
                    <TableCell className="max-w-[260px] truncate">{item.destination}</TableCell>
                    <TableCell className={statusTone(item.status)}>{toTitleCase(item.status)}</TableCell>
                    <TableCell>{item.attempts}</TableCell>
                    <TableCell>{item.responseCode ?? "N/A"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <div className="flex flex-col gap-3 border-t bg-muted/10 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {overview.pagination.totalItems === 0
                ? "No records"
                : `${overview.pagination.totalItems} records - 10 per page`}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Previous delivery history page"
                onClick={() => void loadOverview(historyPage - 1)}
                disabled={loading || historyPage <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-20 text-center text-xs text-muted-foreground">
                Page {overview.pagination.page} of {overview.pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Next delivery history page"
                onClick={() => void loadOverview(historyPage + 1)}
                disabled={loading || historyPage >= overview.pagination.totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={clearHistoryOpen} onOpenChange={(open) => pendingAction === null && setClearHistoryOpen(open)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Clear delivery history?</DialogTitle>
            <DialogDescription>
              Completed deliveries in the selected period will be permanently removed from the database. Pending and retrying webhook items are preserved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="history-deletion-range">Period</Label>
              <Select
                value={historyDeletionRange}
                onValueChange={(value) => value && setHistoryDeletionRange(value as HistoryDeletionRange)}
              >
                <SelectTrigger id="history-deletion-range">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="last_7_days">Last 7 days</SelectItem>
                  <SelectItem value="last_30_days">Last 30 days</SelectItem>
                  <SelectItem value="custom">Custom date range</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {historyDeletionRange === "custom" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="history-from">From</Label>
                  <Input id="history-from" type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="history-to">To</Label>
                  <Input id="history-to" type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} />
                </div>
              </div>
            ) : null}
            <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-3 text-xs leading-5 text-muted-foreground">
              This action cannot be undone. Active retry queue entries are never deleted by history cleanup.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearHistoryOpen(false)} disabled={pendingAction !== null}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void deleteHistory()}
              disabled={pendingAction !== null || !isDeletionRangeReady(historyDeletionRange, customFrom, customTo)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {pendingAction === "delete-history" ? "Deleting..." : "Delete Records"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedRow)} onOpenChange={(open) => !open && setSelectedRow(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Delivery Payload</DialogTitle>
            <DialogDescription>
              Review the exact delivery context, payload, and transport metadata for this outbound attempt.
            </DialogDescription>
          </DialogHeader>
          {selectedRow ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <PayloadMetric label="Channel" value={toTitleCase(selectedRow.channel)} />
                <PayloadMetric label="Kind" value={toTitleCase(selectedRow.kind)} />
                <PayloadMetric label="Status" value={toTitleCase(selectedRow.status)} />
                <PayloadMetric label="Destination" value={selectedRow.destination} />
                <PayloadMetric label="Response" value={selectedRow.responseCode?.toString() ?? "N/A"} />
                <PayloadMetric label="Attempts" value={selectedRow.attempts.toString()} />
              </div>
              <div className="rounded-lg border bg-muted/15 p-4">
                <p className="text-sm font-medium">Payload</p>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-xl border bg-background p-4 text-xs leading-6 text-muted-foreground">
                  {JSON.stringify(selectedRow.payload ?? {}, null, 2)}
                </pre>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ActionProgress({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 px-3 py-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-violet-700 dark:text-violet-300">{progressLabel(label)}</span>
        <span className="text-xs text-muted-foreground">Please wait...</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-violet-500/10">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-violet-500" />
      </div>
    </div>
  );
}

function Field({
  label,
  id,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  );
}

function toTitleCase(value: string) {
  return value
    .split(/[\s-_]+/)
    .filter(Boolean)
    .map((part) => toEnglishUppercase(part.charAt(0)) + part.slice(1))
    .join(" ");
}

function statusTone(value: string) {
  if (value === "delivered") {
    return "text-emerald-600 dark:text-emerald-400";
  }

  if (value === "retrying") {
    return "text-amber-600 dark:text-amber-400";
  }

  if (value === "failed") {
    return "text-destructive";
  }

  return "";
}

function progressLabel(value: string) {
  return toTitleCase(value.replace("test-", "sending "));
}

async function readJsonOrNull<T>(response: Response) {
  return (await response.json().catch(() => null)) as T | null;
}

function toMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function isDeletionRangeReady(range: HistoryDeletionRange, from: string, to: string) {
  return range !== "custom" || (from.length > 0 && to.length > 0 && from <= to);
}

function PayloadMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-muted/15 px-4 py-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium break-words">{value}</p>
    </div>
  );
}
