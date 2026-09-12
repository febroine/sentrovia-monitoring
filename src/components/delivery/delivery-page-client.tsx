"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CircleX,
  CircleDashed,
  MailCheck,
  MessageCircle,
  RefreshCw,
  RotateCcw,
  Send,
  Trash2,
  Webhook,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatCalendarDateInput, shiftLocalCalendarDays } from "@/lib/delivery/history-range";
import type { DeliveryChannelHealth, DeliveryHistoryRecord, DeliveryOverview } from "@/lib/delivery/types";
import { toEnglishUppercase } from "@/lib/text/casing";
import { formatPanelDateTime } from "@/lib/time";
import {
  buildDeliveryChannelReadiness,
  type DeliveryChannelReadiness,
  type DeliveryNotificationSettings,
  type DeliveryReadinessStatus,
} from "@/components/delivery/delivery-readiness";

const EMPTY_OVERVIEW: DeliveryOverview = {
  webhook: null,
  history: [],
  summary: { delivered: 0, failed: 0, retrying: 0, pendingWebhookRetries: 0, pendingRetries: 0, deadLettered: 0 },
  channelHealth: buildEmptyChannelHealth(),
  pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 1 },
};

type MessageResponse = { message?: string; delivery?: DeliveryHistoryRecord };
type HistoryDeletionRange = "last_7_days" | "last_30_days" | "custom";
type DeliveryPageMessage = { text: string; tone: "error" | "success" };
type SettingsResponse = {
  settings?: {
    notifications?: DeliveryNotificationSettings;
  };
  message?: string;
};

export function DeliveryPageClient() {
  const [overview, setOverview] = useState<DeliveryOverview>(EMPTY_OVERVIEW);
  const [loading, setLoading] = useState(true);
  const [notificationSettings, setNotificationSettings] = useState<DeliveryNotificationSettings | null>(null);
  const [notificationSettingsLoading, setNotificationSettingsLoading] = useState(true);
  const [notificationSettingsError, setNotificationSettingsError] = useState<string | null>(null);
  const [message, setMessage] = useState<DeliveryPageMessage | null>(null);
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
        tone: "text-emerald-600 dark:text-emerald-400",
      },
      {
        label: "Retry queue",
        value: String(overview.summary.pendingRetries),
        sub: "Delivery items waiting for retry",
        tone: "text-primary",
      },
      {
        label: "Failed",
        value: String(overview.summary.failed),
        sub: "Review failed attempts",
        tone: "text-rose-600 dark:text-rose-400",
      },
      {
        label: "Retrying",
        value: String(overview.summary.retrying),
        sub: "Waiting for the next attempt",
        tone: "text-amber-600 dark:text-amber-400",
      },
      {
        label: "Dead-lettered",
        value: String(overview.summary.deadLettered),
        sub: "Exhausted or permanent failures",
        tone: "text-rose-700 dark:text-rose-300",
      },
    ],
    [overview.summary]
  );
  const isFirstRun = isDeliveryFirstRun(overview);

  const loadOverview = useCallback(async (requestedPage = 1) => {
    setLoading(true);
    setNotificationSettingsLoading(true);

    try {
      const [deliveryResult, settingsResult] = await Promise.allSettled([
        fetch(`/api/delivery?page=${requestedPage}`, { cache: "no-store" }),
        fetch("/api/settings", { cache: "no-store" }),
      ]);

      if (deliveryResult.status === "rejected") {
        throw deliveryResult.reason;
      }

      const response = deliveryResult.value;
      const data = await readJsonOrNull<{ overview?: DeliveryOverview; message?: string }>(response);
      if (!response.ok) {
        throw new Error(data?.message ?? "Unable to load delivery operations.");
      }

      if (settingsResult.status === "fulfilled") {
        const settingsResponse = settingsResult.value;
        const settingsData = await readJsonOrNull<SettingsResponse>(settingsResponse);
        if (settingsResponse.ok && settingsData?.settings?.notifications) {
          setNotificationSettings(settingsData.settings.notifications);
          setNotificationSettingsError(null);
        } else {
          setNotificationSettings(null);
          setNotificationSettingsError(settingsData?.message ?? "Unable to load notification settings.");
        }
      } else {
        setNotificationSettings(null);
        setNotificationSettingsError("Unable to load notification settings.");
      }

      const nextOverview = normalizeOverview(data?.overview);
      setOverview(nextOverview);
      setHistoryPage(nextOverview.pagination.page);
      setWebhookUrl(nextOverview.webhook?.url ?? "");
      setWebhookActive(nextOverview.webhook?.isActive ?? true);
      setMessage(null);
    } catch (error) {
      setMessage({ text: toMessage(error, "Unable to load delivery operations."), tone: "error" });
    } finally {
      setLoading(false);
      setNotificationSettingsLoading(false);
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

      const nextOverview = normalizeOverview(data?.overview);
      setOverview(nextOverview);
      setHistoryPage(nextOverview.pagination.page);
      setWebhookSecret("");
      setMessage({ text: "Webhook endpoint saved.", tone: "success" });
    } catch (error) {
      setMessage({ text: toMessage(error, "Unable to save webhook settings."), tone: "error" });
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
        if (data?.delivery) {
          await loadOverview(1);
          return;
        }
        throw new Error(data?.message ?? `Unable to send ${channel} test.`);
      }

      await loadOverview(1);
    } catch (error) {
      setMessage({ text: toMessage(error, `Unable to send ${channel} test.`), tone: "error" });
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
        throw new Error(data?.message ?? "Unable to retry the delivery queue.");
      }

      const nextOverview = normalizeOverview(data?.overview);
      setOverview(nextOverview);
      setHistoryPage(nextOverview.pagination.page);
      setMessage({ text: `Processed ${data?.result?.processed ?? 0} delivery retry item(s).`, tone: "success" });
    } catch (error) {
      setMessage({ text: toMessage(error, "Unable to retry the delivery queue."), tone: "error" });
    } finally {
      setPendingAction(null);
    }
  }

  async function retryDelivery(eventId: string) {
    setPendingAction(`retry-${eventId}`);

    try {
      const response = await fetch(`/api/delivery/retry?eventId=${encodeURIComponent(eventId)}`, { method: "POST" });
      const data = await readJsonOrNull<{ delivery?: DeliveryHistoryRecord; overview?: DeliveryOverview; message?: string }>(response);
      if (!response.ok) {
        throw new Error(data?.message ?? "Unable to retry this delivery.");
      }

      const nextOverview = normalizeOverview(data?.overview);
      setOverview(nextOverview);
      setHistoryPage(nextOverview.pagination.page);
      setSelectedRow(data?.delivery ?? null);
      setMessage({ text: "Delivery retry completed.", tone: "success" });
    } catch (error) {
      setMessage({ text: toMessage(error, "Unable to retry this delivery."), tone: "error" });
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
          fromTimezoneOffsetMinutes: historyDeletionRange === "custom"
            ? getLocalCalendarBoundaryOffset(customFrom)
            : undefined,
          toExclusiveTimezoneOffsetMinutes: historyDeletionRange === "custom"
            ? getLocalCalendarBoundaryOffset(customTo, 1)
            : undefined,
        }),
      });
      const data = await readJsonOrNull<{ count?: number; overview?: DeliveryOverview; message?: string }>(response);
      if (!response.ok) {
        throw new Error(data?.message ?? "Unable to delete delivery history.");
      }

      const nextOverview = normalizeOverview(data?.overview);
      setOverview(nextOverview);
      setHistoryPage(nextOverview.pagination.page);
      setSelectedRow(null);
      setClearHistoryOpen(false);
      setMessage({ text: `Deleted ${data?.count ?? 0} completed delivery record(s).`, tone: "success" });
    } catch (error) {
      setMessage({ text: toMessage(error, "Unable to delete delivery history."), tone: "error" });
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
            Channel health, delivery attempts, and retries.
          </p>
        </div>
        <Button variant="outline" onClick={() => void loadOverview(historyPage)} disabled={loading}>
          <RefreshCw data-icon="inline-start" className="h-4 w-4" />
          Refresh
        </Button>
      </header>

      {message ? (
        <div
          role={message.tone === "error" ? "alert" : "status"}
          className={
            message.tone === "error"
              ? "rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive"
              : "rounded-md bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400"
          }
        >
          {message.text}
        </div>
      ) : null}

      {isFirstRun ? (
        <FirstRunDeliveryGuide
          overview={overview}
          notificationSettings={notificationSettings}
          settingsLoading={notificationSettingsLoading}
          settingsError={notificationSettingsError}
        />
      ) : (
        <>
          <dl className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            {cards.map((card) => (
              <div key={card.label} className="rounded-md bg-muted/25 px-4 py-3">
                <dt className="text-xs font-medium text-muted-foreground">{card.label}</dt>
                <dd className={`mt-1 text-lg font-semibold tabular-nums ${card.tone}`}>{card.value}</dd>
                <p className="mt-0.5 text-xs text-muted-foreground">{card.sub}</p>
              </div>
            ))}
          </dl>

          <section className="rounded-lg bg-card/45" aria-labelledby="channel-health-title">
            <div className="flex flex-col gap-1 rounded-t-lg bg-muted/20 px-5 py-3 sm:flex-row sm:items-baseline sm:justify-between">
              <h2 id="channel-health-title" className="text-base font-medium">Channel health</h2>
              <p className="text-xs text-muted-foreground">Attempts and failures from the last 24 hours.</p>
            </div>
            <div className="grid gap-2 p-2">
              {overview.channelHealth.map((channel) => (
                <ChannelHealthRow key={channel.channel} channel={channel} />
              ))}
            </div>
          </section>
        </>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <section id="webhook-setup" className="rounded-lg bg-card/45 p-4" aria-labelledby="webhook-title">
          <div className="mb-4">
            <h2 id="webhook-title" className="text-base font-medium">Webhook endpoint</h2>
            <p className="mt-1 text-sm text-muted-foreground">Failed POST requests are retried automatically.</p>
          </div>
          <div className="space-y-4">
            <Field label="URL" id="webhook-url" value={webhookUrl} onChange={setWebhookUrl} placeholder="https://hooks.example.com/sentrovia" />
            <Field label="Secret" id="webhook-secret" value={webhookSecret} onChange={setWebhookSecret} placeholder={overview.webhook?.secretConfigured ? "Secret already configured" : "Optional HMAC shared secret"} />
            <div className="flex items-center justify-between rounded-md bg-muted/25 p-3">
              <div>
                <p className="text-sm font-medium">Webhook active</p>
                <p className="text-xs text-muted-foreground">Inactive endpoints stay saved but stop receiving events.</p>
              </div>
              <Switch aria-label="Webhook active" checked={webhookActive} onCheckedChange={setWebhookActive} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void saveWebhook()} disabled={!webhookUrl.trim() || pendingAction !== null}>
                <Webhook data-icon="inline-start" className="h-4 w-4" />
                Save webhook
              </Button>
              <Button variant="outline" onClick={() => void sendTest("webhook")} disabled={!webhookUrl.trim() || pendingAction !== null}>
                <Send data-icon="inline-start" className="h-4 w-4" />
                Send test webhook
              </Button>
            </div>
          </div>
        </section>

        <section id="delivery-test" className="rounded-lg bg-card/45 p-4" aria-labelledby="delivery-test-title">
          <h2 id="delivery-test-title" className="mb-4 text-base font-medium">Test delivery</h2>
          <div className="space-y-4">
            {pendingAction ? <ActionProgress label={pendingAction} /> : null}
            <Field label="Email target" id="email-target" value={emailTarget} onChange={setEmailTarget} placeholder="alerts@example.com" />
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Telegram bot token" id="telegram-token" value={telegramBotToken} onChange={setTelegramBotToken} placeholder="123456:ABC..." />
              <Field label="Telegram chat ID" id="telegram-chat-id" value={telegramChatId} onChange={setTelegramChatId} placeholder="-1001234567890" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="delivery-message">Message</Label>
              <Textarea id="delivery-message" value={testMessage} onChange={(event) => setTestMessage(event.target.value)} rows={4} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void sendTest("email")} disabled={pendingAction !== null}>
                <MailCheck data-icon="inline-start" className="size-4" />
                Test email
              </Button>
              <Button variant="outline" onClick={() => void sendTest("telegram")} disabled={pendingAction !== null}>
                <Send data-icon="inline-start" className="size-4" />
                Test Telegram
              </Button>
              <Button variant="outline" onClick={() => void sendTest("discord")} disabled={pendingAction !== null}>
                <MessageCircle data-icon="inline-start" className="size-4" />
                Test Discord
              </Button>
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-lg bg-card/45" aria-labelledby="delivery-history-title">
        <div className="rounded-t-lg bg-muted/20 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1.5">
              <h2 id="delivery-history-title" className="text-base font-medium">Delivery history</h2>
              <p className="mt-1 text-sm text-muted-foreground">Newest attempts first. Failed deliveries can be retried.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void retryQueue()}
                disabled={pendingAction !== null || overview.pagination.totalItems === 0}
              >
                <RotateCcw data-icon="inline-start" className="h-4 w-4" />
                Retry queue
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setClearHistoryOpen(true)}
                disabled={pendingAction !== null || overview.pagination.totalItems === 0}
              >
                <Trash2 data-icon="inline-start" className="h-4 w-4" />
                Clear history
              </Button>
            </div>
          </div>
        </div>
        <div>
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
                      title="No deliveries yet"
                      description="Alert, report, and test deliveries will appear here."
                    />
                  </TableCell>
                </TableRow>
              ) : (
                overview.history.map((item) => (
                  <TableRow key={item.id} className="cursor-pointer" onClick={() => setSelectedRow(item)}>
                    <TableCell className="pl-6">
                      <button
                        type="button"
                        className="rounded-sm text-left text-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                        aria-label={`Open ${toTitleCase(item.channel)} delivery details`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedRow(item);
                        }}
                      >
                        {toTitleCase(item.channel)}
                      </button>
                    </TableCell>
                    <TableCell className="font-medium">{toTitleCase(item.kind)}</TableCell>
                    <TableCell className="max-w-[260px] truncate">{item.destination}</TableCell>
                    <TableCell className={statusTone(item.status, item.deadLetteredAt)}>{statusLabel(item)}</TableCell>
                    <TableCell>{item.attempts}</TableCell>
                    <TableCell>{item.responseCode ?? "N/A"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatPanelDateTime(item.createdAt)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <div className="flex flex-col gap-3 rounded-b-lg bg-muted/20 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {overview.pagination.totalItems === 0
                ? "No records"
                : `${overview.pagination.totalItems} records - 10 per page`}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="First delivery history page"
                onClick={() => void loadOverview(1)}
                disabled={loading || historyPage <= 1}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
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
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Last delivery history page"
                onClick={() => void loadOverview(overview.pagination.totalPages)}
                disabled={loading || historyPage >= overview.pagination.totalPages}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </section>

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
            <div className="rounded-md bg-amber-500/10 px-3 py-3 text-xs leading-5 text-muted-foreground">
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
              <Trash2 data-icon="inline-start" className="h-4 w-4" />
              {pendingAction === "delete-history" ? "Deleting..." : "Delete records"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedRow)} onOpenChange={(open) => !open && setSelectedRow(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Delivery payload</DialogTitle>
            <DialogDescription>
              Review the exact delivery context, payload, and transport metadata for this outbound attempt.
            </DialogDescription>
          </DialogHeader>
          {selectedRow ? (
            <div className="space-y-4">
              <dl className="grid gap-2 md:grid-cols-2">
                <PayloadMetric label="Channel" value={toTitleCase(selectedRow.channel)} />
                <PayloadMetric label="Kind" value={toTitleCase(selectedRow.kind)} />
                <PayloadMetric label="Status" value={statusLabel(selectedRow)} />
                <PayloadMetric label="Destination" value={selectedRow.destination} />
                <PayloadMetric label="Response" value={selectedRow.responseCode?.toString() ?? "N/A"} />
                <PayloadMetric label="Attempts" value={selectedRow.attempts.toString()} />
              </dl>
              <div className="rounded-md bg-muted/20 p-4">
                <p className="text-sm font-medium">Payload</p>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-md border bg-background p-4 text-xs leading-6 text-muted-foreground">
                  {JSON.stringify(selectedRow.payload ?? {}, null, 2)}
                </pre>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedRow(null)}>
              Close
            </Button>
            {selectedRow?.status === "failed" ? (
              <Button
                onClick={() => void retryDelivery(selectedRow.id)}
                disabled={pendingAction !== null}
              >
                <RotateCcw data-icon="inline-start" className="h-4 w-4" />
                {pendingAction === `retry-${selectedRow.id}` ? "Retrying..." : "Retry delivery"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function getLocalCalendarBoundaryOffset(value: string, dayOffset = 0) {
  const [year, month, day] = value.split("-").map(Number);
  const boundary = new Date(year, month - 1, day + dayOffset);
  return Number.isNaN(boundary.getTime()) ? undefined : boundary.getTimezoneOffset();
}

function normalizeOverview(value: DeliveryOverview | undefined): DeliveryOverview {
  if (!value) return EMPTY_OVERVIEW;

  return {
    ...value,
    summary: { ...EMPTY_OVERVIEW.summary, ...value.summary },
    channelHealth: value.channelHealth ?? EMPTY_OVERVIEW.channelHealth,
  };
}

function isDeliveryFirstRun(overview: DeliveryOverview) {
  const summaryTotal = Object.values(overview.summary).reduce((total, count) => total + count, 0);
  return summaryTotal === 0 && overview.pagination.totalItems === 0;
}

function FirstRunDeliveryGuide({
  overview,
  notificationSettings,
  settingsLoading,
  settingsError,
}: {
  overview: DeliveryOverview;
  notificationSettings: DeliveryNotificationSettings | null;
  settingsLoading: boolean;
  settingsError: string | null;
}) {
  const readiness = buildDeliveryChannelReadiness(overview, notificationSettings);

  return (
    <section className="rounded-lg bg-card/45 p-4" aria-labelledby="delivery-setup-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="delivery-setup-title" className="text-base font-medium">Prepare notification delivery</h2>
          <p className="mt-1 text-sm text-muted-foreground">Check each channel before relying on alerts. Delivery activity appears here after the first attempt.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="inline-flex h-8 items-center rounded-md bg-primary px-2.5 pb-px text-sm leading-none font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40" href="#webhook-setup">Configure webhook</a>
          <a className="inline-flex h-8 items-center rounded-md border border-border bg-background px-2.5 pb-px text-sm leading-none font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40" href="#delivery-test">Send a test</a>
        </div>
      </div>

      {settingsError ? (
        <p role="alert" className="mt-4 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          {settingsError} Channel setup links are still available below.
        </p>
      ) : null}

      {settingsLoading ? (
        <div className="mt-5 rounded-md bg-muted/20 px-4 py-3 text-sm text-muted-foreground" role="status" aria-live="polite">
          Loading channel readiness…
        </div>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {readiness.map((channel) => (
            <ChannelReadinessCard key={channel.channel} channel={channel} />
          ))}
        </div>
      )}
    </section>
  );
}

function ChannelReadinessCard({ channel }: { channel: DeliveryChannelReadiness }) {
  const presentation = readinessPresentation(channel.status);
  const Icon = presentation.Icon;

  return (
    <article className="flex min-h-40 flex-col rounded-md bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <ChannelIcon channel={channel.channel} />
          <h3 className="truncate text-sm font-medium">{channel.label}</h3>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 text-xs font-medium ${presentation.className}`}>
          <Icon className="size-3.5" aria-hidden="true" />
          {presentation.label}
        </span>
      </div>
      <p className="mt-3 flex-1 text-xs leading-5 text-muted-foreground">{channel.detail}</p>
      <Link
        href={channel.href}
        className="mt-4 inline-flex min-h-9 items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        Open channel settings
        <ArrowUpRight className="size-3.5" aria-hidden="true" />
      </Link>
    </article>
  );
}

function ChannelIcon({ channel }: { channel: DeliveryChannelHealth["channel"] }) {
  if (channel === "email") return <MailCheck className="size-4 text-muted-foreground" aria-hidden="true" />;
  if (channel === "telegram") return <Send className="size-4 text-muted-foreground" aria-hidden="true" />;
  if (channel === "discord") return <MessageCircle className="size-4 text-muted-foreground" aria-hidden="true" />;
  return <Webhook className="size-4 text-muted-foreground" aria-hidden="true" />;
}

function readinessPresentation(status: DeliveryReadinessStatus) {
  if (status === "configured") {
    return { label: "Configured", className: "text-emerald-600 dark:text-emerald-400", Icon: CheckCircle2 };
  }
  if (status === "error") {
    return { label: "Error", className: "text-destructive", Icon: CircleX };
  }
  if (status === "no-attempts") {
    return { label: "No attempts", className: "text-amber-600 dark:text-amber-400", Icon: CircleDashed };
  }
  return { label: "Missing", className: "text-muted-foreground", Icon: AlertTriangle };
}

function buildEmptyChannelHealth(): DeliveryChannelHealth[] {
  return ["email", "telegram", "discord", "webhook"].map((channel) => ({
    channel: channel as DeliveryChannelHealth["channel"],
    totalAttempts: 0,
    delivered: 0,
    failed: 0,
    retrying: 0,
    errorRatePct: null,
    status: "unknown",
    lastAttemptAt: null,
    lastErrorMessage: null,
  }));
}

function ChannelHealthRow({ channel }: { channel: DeliveryChannelHealth }) {
  const status = channelStatusPresentation(channel.status);
  return (
    <div className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-3">
        {status.icon ? <span className={status.textClass}>{status.icon}</span> : null}
        <div>
          <p className="text-sm font-medium">{toTitleCase(channel.channel)}</p>
          <p className="text-xs text-muted-foreground">
            {channel.totalAttempts === 0 ? "No attempts in the selected window" : `${channel.totalAttempts} attempts`}
          </p>
          {channel.lastAttemptAt ? (
            <p className="mt-1 text-[11px] text-muted-foreground">Last attempt: {formatTimestamp(channel.lastAttemptAt)}</p>
          ) : null}
        </div>
      </div>
      <div className="grid gap-3 text-xs sm:grid-cols-4 lg:min-w-[560px]">
        <HealthMetric label="Status" value={status.label} tone={status.textClass} />
        <HealthMetric label="Error rate" value={channel.errorRatePct === null ? "No data" : `${channel.errorRatePct.toFixed(1)}%`} />
        <HealthMetric label="Delivered / failed" value={`${channel.delivered} / ${channel.failed}`} />
        <HealthMetric label="Retrying" value={String(channel.retrying)} />
      </div>
      {channel.lastErrorMessage ? (
        <p className="max-w-xl text-xs text-rose-600 dark:text-rose-300">{channel.lastErrorMessage}</p>
      ) : null}
    </div>
  );
}

function HealthMetric({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className={`mt-1 font-medium ${tone}`}>{value}</p>
    </div>
  );
}

function channelStatusPresentation(status: DeliveryChannelHealth["status"]) {
  if (status === "healthy") {
    return { label: "Healthy", textClass: "text-emerald-600 dark:text-emerald-400", icon: <CheckCircle2 className="h-4 w-4" /> };
  }
  if (status === "unhealthy") {
    return { label: "Unhealthy", textClass: "text-rose-600 dark:text-rose-400", icon: <CircleX className="h-4 w-4" /> };
  }
  if (status === "degraded") {
    return { label: "Degraded", textClass: "text-amber-600 dark:text-amber-400", icon: <AlertTriangle className="h-4 w-4" /> };
  }
  return { label: "No data", textClass: "text-muted-foreground", icon: null };
}

function ActionProgress({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-3 text-sm" role="status">
      <RefreshCw className="size-4 animate-spin text-primary" />
      <span className="font-medium">{progressLabel(label)}</span>
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

function statusTone(value: string, deadLetteredAt: string | null = null) {
  if (value === "delivered") {
    return "text-emerald-600 dark:text-emerald-400";
  }

  if (value === "retrying") {
    return "text-amber-600 dark:text-amber-400";
  }

  if (value === "failed") {
    return deadLetteredAt ? "font-medium text-rose-700 dark:text-rose-400" : "text-destructive";
  }

  return "";
}

function progressLabel(value: string) {
  return toTitleCase(value.replace("test-", "sending "));
}

function statusLabel(item: DeliveryHistoryRecord) {
  return item.status === "failed" && item.deadLetteredAt ? "Dead letter" : toTitleCase(item.status);
}

async function readJsonOrNull<T>(response: Response) {
  return (await response.json().catch(() => null)) as T | null;
}

function toMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : formatPanelDateTime(date);
}

function isDeletionRangeReady(range: HistoryDeletionRange, from: string, to: string) {
  return range !== "custom" || (from.length > 0 && to.length > 0 && from <= to);
}

function PayloadMetric({ label, value }: { label: string; value: string }) {
  return (
            <div className="rounded-md bg-background/30 px-4 py-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium">{value}</dd>
    </div>
  );
}
