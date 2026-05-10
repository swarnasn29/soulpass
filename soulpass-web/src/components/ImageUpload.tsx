"use client";

import { useCallback, useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/cn";

export type ImageUploadValue = {
  url: string; // gateway URL — what the UI renders
  arUri: string; // ar://<txId> — durable, what we persist
  txId: string;
};

type Props = {
  value: ImageUploadValue | null;
  onChange: (v: ImageUploadValue | null) => void;
  label?: string;
  hint?: string;
  aspect?: "video" | "square" | "wide"; // 16/9, 1/1, 21/9
  kind?: string; // tag passed to /api/upload (e.g. "event-cover", "venue", "avatar")
  owner?: string;
  eventAddress?: string;
  className?: string;
};

const ASPECT_CLASS: Record<NonNullable<Props["aspect"]>, string> = {
  video: "aspect-[16/9]",
  square: "aspect-square",
  wide: "aspect-[21/9]",
};

export function ImageUpload({
  value,
  onChange,
  label,
  hint,
  aspect = "video",
  kind = "media",
  owner,
  eventAddress,
  className,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  const upload = useCallback(
    async (file: File) => {
      setErr(null);
      setBusy(true);
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("kind", kind);
        if (owner) fd.append("owner", owner);
        if (eventAddress) fd.append("eventAddress", eventAddress);

        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `Upload failed (${res.status})`);
        }
        const j = (await res.json()) as ImageUploadValue;
        onChange({ url: j.url, arUri: j.arUri, txId: j.txId });
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [kind, owner, eventAddress, onChange],
  );

  const onPick = (f: FileList | null) => {
    const file = f?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErr("Only image files are allowed.");
      return;
    }
    void upload(file);
  };

  return (
    <div className={cn("w-full space-y-1.5", className)}>
      {label && (
        <label className="text-xs font-medium uppercase tracking-wider text-[var(--color-muted)]">
          {label}
        </label>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          onPick(e.dataTransfer.files);
        }}
        className={cn(
          "group relative flex w-full cursor-pointer items-center justify-center overflow-hidden rounded-3xl border bg-[var(--color-bg)] transition-colors",
          ASPECT_CLASS[aspect],
          drag
            ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5"
            : "border-[var(--color-border)] hover:border-white/20",
        )}
        onClick={() => inputRef.current?.click()}
        role="button"
        aria-label={label ?? "Upload image"}
      >
        {value?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value.url}
            alt={label ?? "Uploaded image"}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-white/60">
            <ImagePlus className="h-7 w-7" />
            <p className="text-sm">Drop image or click to upload</p>
            <p className="text-[11px] text-white/40">PNG · JPG · WEBP · up to 10MB</p>
          </div>
        )}

        {busy && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-white">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-xs uppercase tracking-wider">Pinning to Arweave…</span>
          </div>
        )}

        {value?.url && !busy && (
          <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-center justify-between gap-2">
            <span className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-accent)] backdrop-blur">
              <ShieldCheck className="h-3 w-3" />
              Stored on Arweave
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              className="pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white/80 backdrop-blur hover:text-[var(--color-danger)]"
              aria-label="Remove image"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
          className="hidden"
          onChange={(e) => onPick(e.target.files)}
        />
      </div>

      {value?.txId && (
        <p className="truncate text-[11px] text-white/40">
          tx: {value.txId.slice(0, 10)}…{value.txId.slice(-6)}
        </p>
      )}
      {err && <p className="text-xs text-[var(--color-danger)]">{err}</p>}
      {hint && !err && <p className="text-xs text-[var(--color-muted)]">{hint}</p>}
    </div>
  );
}

