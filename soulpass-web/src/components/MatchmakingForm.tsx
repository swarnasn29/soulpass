"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button, Input } from "./ui";
import {
  getTemplate,
  type MatchDimension,
} from "@/lib/matchTemplates";
import { useApi } from "@/hooks/useApi";
import type { StoredTraitValue, UserTraitEntry } from "@/lib/eventMetaStore";

type TraitsMap = Record<string, { value: StoredTraitValue; source: UserTraitEntry["source"]; updatedAt?: number }>;

type Props = {
  templateId: string;
  walletAddress: string;
  // If "missing-only" we hide dimensions that already have stored values.
  // If "all" we show every dimension (useful for /profile/matching).
  mode?: "missing-only" | "all";
  // Whether the user MUST answer required dimensions before this can submit.
  enforceRequired?: boolean;
  submitLabel?: string;
  onSubmitted?: (traits: TraitsMap) => void | Promise<void>;
  // External traits prop overrides the fetch (useful for /profile/matching where
  // the parent already has the data).
  initialTraits?: TraitsMap;
};

type FieldValue = string | string[] | number | [number, number] | undefined;

function defaultValue(d: MatchDimension): FieldValue {
  switch (d.type) {
    case "single":
      return undefined;
    case "multi":
      return [];
    case "number":
      return undefined;
    case "range":
      return d.min != null && d.max != null ? [d.min, d.max] : [0, 100];
  }
}

function isFilled(d: MatchDimension, v: FieldValue): boolean {
  if (v === undefined || v === null) return false;
  if (d.type === "multi") return Array.isArray(v) && v.length > 0;
  if (d.type === "single") return typeof v === "string" && v.length > 0;
  if (d.type === "number") return typeof v === "number" && Number.isFinite(v);
  if (d.type === "range") return Array.isArray(v) && v.length === 2;
  return false;
}

export function MatchmakingForm({
  templateId,
  walletAddress,
  mode = "missing-only",
  enforceRequired = true,
  submitLabel = "Save",
  onSubmitted,
  initialTraits,
}: Props) {
  const template = useMemo(() => getTemplate(templateId), [templateId]);
  const [traits, setTraits] = useState<TraitsMap>(initialTraits ?? {});
  const [loading, setLoading] = useState(!initialTraits);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { apiFetch } = useApi();

  // Load current traits + suggestions once.
  useEffect(() => {
    if (initialTraits) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/users/${walletAddress}/traits?templateId=${templateId}`,
          { cache: "no-store" },
        );
        const data = await res.json();
        if (cancelled) return;
        setTraits(data.traits ?? {});
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [walletAddress, templateId, initialTraits]);

  if (!template) {
    return <p className="text-sm text-white/60">Unknown template.</p>;
  }

  const visibleDims = mode === "all"
    ? template.dimensions
    : template.dimensions.filter((d) => !isFilled(d, traits[d.traitKey]?.value as FieldValue));

  const setField = (key: string, value: FieldValue) => {
    setTraits((prev) => ({
      ...prev,
      [key]: { value: value as StoredTraitValue, source: "user" },
    }));
  };

  const submit = async () => {
    setErr(null);
    if (enforceRequired) {
      for (const d of template.dimensions) {
        if (!d.required) continue;
        const v = traits[d.traitKey]?.value as FieldValue;
        if (!isFilled(d, v)) {
          setErr(`Please answer: ${d.question}`);
          return;
        }
      }
    }
    setSubmitting(true);
    try {
      // Only PUT trait keys present on this template (others may exist for other events).
      const payload: Record<string, { value: StoredTraitValue; source: UserTraitEntry["source"] }> = {};
      for (const d of template.dimensions) {
        const entry = traits[d.traitKey];
        if (!entry || !isFilled(d, entry.value as FieldValue)) continue;
        payload[d.traitKey] = { value: entry.value, source: entry.source ?? "user" };
      }
      const res = await apiFetch(`/api/users/${walletAddress}/traits`, {
        method: "PUT",
        body: JSON.stringify({ traits: payload }),
      });
      const data = await res.json();
      // Await onSubmitted so the parent (e.g., on-chain register tx) finishes
      // before we clear the loading state — otherwise the button looks done
      // while the register tx is still in flight.
      await onSubmitted?.(data.traits ?? {});
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-white/60">Loading…</p>;
  }

  if (visibleDims.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-2xl border border-[var(--color-positive)]/30 bg-[var(--color-positive)]/10 p-4 text-[var(--color-positive)]">
          <Check className="h-4 w-4" />
          <span className="text-sm font-semibold">All set — no extra info needed.</span>
        </div>
        <Button onClick={submit} loading={submitting} className="w-full">
          {submitLabel}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {visibleDims.map((d) => {
        const entry = traits[d.traitKey];
        const v = entry?.value as FieldValue | undefined;
        const inferred = entry?.source && entry.source !== "user";
        const sourceLabel = inferred ? sourceText(entry!.source) : null;

        return (
          <div key={d.traitKey} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">{d.question}</p>
                {d.required && (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                    Required
                  </span>
                )}
              </div>
              {sourceLabel && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-accent)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-accent)]">
                  <Sparkles className="h-3 w-3" />
                  {sourceLabel}
                </span>
              )}
            </div>

            <div className="mt-3">
              <DimensionInput d={d} value={v ?? defaultValue(d)} onChange={(v) => setField(d.traitKey, v)} />
            </div>
          </div>
        );
      })}

      {err && (
        <p className="rounded-2xl border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]">
          {err}
        </p>
      )}
      <Button onClick={submit} loading={submitting} className="w-full">
        {submitLabel}
      </Button>
    </div>
  );
}

function sourceText(s: UserTraitEntry["source"]): string {
  switch (s) {
    case "reputation_bucket":
      return "From your reputation";
    case "bio_keywords":
      return "From your bio";
    case "previous_event":
      return "From a previous event";
    case "badge_mix":
      return "From your badges";
    default:
      return "Auto-filled";
  }
}

function DimensionInput({
  d,
  value,
  onChange,
}: {
  d: MatchDimension;
  value: FieldValue;
  onChange: (v: FieldValue) => void;
}) {
  if (d.type === "single") {
    const v = typeof value === "string" ? value : "";
    return (
      <div className="flex flex-wrap gap-2">
        {(d.options ?? []).map((opt) => {
          const active = v === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                active
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-black"
                  : "border-[var(--color-border)] bg-[var(--color-surface)] text-white/80 hover:border-white/20",
              )}
            >
              {opt}
            </button>
          );
        })}
      </div>
    );
  }

  if (d.type === "multi") {
    const v = Array.isArray(value) ? (value as string[]) : [];
    const toggle = (opt: string) => {
      onChange(v.includes(opt) ? v.filter((x) => x !== opt) : [...v, opt]);
    };
    return (
      <div className="flex flex-wrap gap-2">
        {(d.options ?? []).map((opt) => {
          const active = v.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                active
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface)] text-white/80 hover:border-white/20",
              )}
            >
              {opt}
            </button>
          );
        })}
      </div>
    );
  }

  if (d.type === "number") {
    const v = typeof value === "number" ? value : "";
    return (
      <Input
        type="number"
        min={d.min}
        max={d.max}
        value={v === "" ? "" : String(v)}
        onChange={(e) => {
          const n = e.target.value === "" ? undefined : Number(e.target.value);
          onChange(typeof n === "number" && Number.isFinite(n) ? n : undefined);
        }}
        placeholder={d.label}
      />
    );
  }

  if (d.type === "range") {
    const r = Array.isArray(value) ? (value as [number, number]) : [d.min ?? 0, d.max ?? 100];
    return (
      <div className="flex items-center gap-3">
        <Input
          type="number"
          min={d.min}
          max={d.max}
          value={String(r[0])}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange([n, r[1]]);
          }}
          placeholder="Min"
        />
        <span className="text-white/40">–</span>
        <Input
          type="number"
          min={d.min}
          max={d.max}
          value={String(r[1])}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange([r[0], n]);
          }}
          placeholder="Max"
        />
      </div>
    );
  }

  return null;
}

export type { TraitsMap };
export { isFilled };
