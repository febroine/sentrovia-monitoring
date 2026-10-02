"use client";

import { useEffect, useState } from "react";
import {
  describeFailurePhase,
  type FailureEvidence,
  type FailureEvidenceHop,
} from "@/lib/monitors/failure-evidence";

type EvidenceState =
  | { status: "loading" }
  | { status: "ready"; evidence: FailureEvidence | null }
  | { status: "error" };

// What the failed check itself saw, loaded when its timeline point is opened.
export function FailureEvidencePanel({ checkId }: { checkId: string }) {
  const [state, setState] = useState<EvidenceState>({ status: "loading" });

  useEffect(() => {
    // The panel is keyed by the check, so it starts in the loading state for every check.
    const controller = new AbortController();
    fetch(`/api/monitors/history/evidence?checkId=${encodeURIComponent(checkId)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load the check details.");
        const data = (await response.json()) as { evidence?: FailureEvidence | null };
        setState({ status: "ready", evidence: data.evidence ?? null });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error" });
      });
    return () => controller.abort();
  }, [checkId]);

  if (state.status === "loading") {
    return <p className="text-xs text-muted-foreground">Loading what the check saw…</p>;
  }
  if (state.status === "error") {
    return <p className="text-xs text-destructive">The check details could not be loaded.</p>;
  }
  if (!state.evidence) {
    return null;
  }

  const { evidence } = state;
  const finalHop = evidence.hops[evidence.hops.length - 1];

  return (
    <div className="rounded-md bg-muted/20 p-4">
      <p className="text-sm font-medium">What the check saw</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Recorded by the failed check itself.{" "}
        {evidence.phase === "response"
          ? "The server answered and the answer was rejected."
          : `It stopped while ${describeFailurePhase(evidence.phase)}.`}
      </p>

      {finalHop ? (
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs lg:grid-cols-6">
          <EvidencePill className="col-span-2" label="Server address" value={formatAddress(finalHop)} />
          <EvidencePill label="DNS" value={formatMs(finalHop.timings.dnsMs)} />
          <EvidencePill label="Connect" value={finalHop.reusedConnection ? "Reused" : formatMs(finalHop.timings.connectMs)} />
          <EvidencePill label="TLS" value={formatMs(finalHop.timings.tlsMs)} />
          <EvidencePill
            label="First byte"
            value={finalHop.timings.firstByteMs === null && evidence.phase === "first-byte" ? "No answer" : formatMs(finalHop.timings.firstByteMs)}
          />
        </div>
      ) : null}

      {evidence.error ? <p className="mt-3 break-words text-xs text-muted-foreground">Error: {evidence.error}</p> : null}

      {evidence.hops.length > 1 ? (
        <div className="mt-4">
          <p className="text-xs font-medium text-muted-foreground">Redirects</p>
          <ol className="mt-2 grid gap-1 text-xs">
            {evidence.hops.map((hop, index) => (
              <li key={`${index}-${hop.url}`} className="break-all rounded-md bg-background/30 px-3 py-2">
                {hop.method} {hop.url} → {hop.statusCode === null ? "no response" : `HTTP ${hop.statusCode}`}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {finalHop && Object.keys(finalHop.headers).length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-medium text-muted-foreground">Response headers</p>
          <dl className="mt-2 grid gap-1 text-xs">
            {Object.entries(finalHop.headers).map(([name, value]) => (
              <div key={name} className="flex flex-wrap gap-x-2 rounded-md bg-background/30 px-3 py-1.5">
                <dt className="font-medium text-foreground">{name}</dt>
                <dd className="min-w-0 break-all text-muted-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {evidence.certificate ? (
        <div className="mt-4 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
          <span>Certificate: {evidence.certificate.subject ?? "--"}</span>
          <span>Issuer: {evidence.certificate.issuer ?? "--"}</span>
          <span>Valid until: {evidence.certificate.validTo ?? "--"}</span>
          <span>Protocol: {evidence.certificate.protocol ?? "--"}</span>
        </div>
      ) : null}

      {evidence.body ? (
        <div className="mt-4">
          <p className="text-xs font-medium text-muted-foreground">
            Response body{evidence.body.contentType ? ` (${evidence.body.contentType})` : ""}
          </p>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background/40 px-3 py-2 text-xs">
            {evidence.body.excerpt}
            {evidence.body.truncated ? "\n…" : ""}
          </pre>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Text only, first 2,000 characters; markup, scripts and anything that looks like a secret are removed.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function EvidencePill({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={`min-w-0 rounded-md bg-background/30 px-3 py-2 ${className}`}>
      <p className="font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground [overflow-wrap:anywhere]">{value}</p>
    </div>
  );
}

function formatAddress(hop: FailureEvidenceHop) {
  if (!hop.remoteAddress) return "--";
  const host = hop.remoteAddress.includes(":") ? `[${hop.remoteAddress}]` : hop.remoteAddress;
  return hop.remotePort ? `${host}:${hop.remotePort}` : host;
}

function formatMs(value: number | null) {
  if (value === null) return "--";
  return value >= 10_000 ? `${(value / 1000).toFixed(1)} s` : `${Math.round(value)} ms`;
}
