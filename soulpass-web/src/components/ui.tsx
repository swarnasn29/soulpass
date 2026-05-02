"use client";

import { cn } from "@/lib/cn";
import {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  TextareaHTMLAttributes,
  forwardRef,
} from "react";
import { Loader2 } from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    loading?: boolean;
    size?: "sm" | "md" | "lg";
  }
>(function Button(
  { className, variant = "primary", loading, size = "md", children, disabled, ...rest },
  ref,
) {
  const base =
    "inline-flex items-center justify-center gap-2 font-display font-semibold tracking-tight transition-all rounded-full select-none disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]";
  const sizes = {
    sm: "h-9 px-4 text-sm",
    md: "h-11 px-5 text-[15px]",
    lg: "h-14 px-7 text-base",
  };
  const variants: Record<ButtonVariant, string> = {
    primary:
      "bg-[var(--color-accent)] text-black hover:bg-lime-300",
    secondary:
      "bg-[var(--color-surface-2)] text-white border border-[var(--color-border)] hover:bg-[#1B1E22]",
    ghost:
      "bg-transparent text-white/70 hover:text-white hover:bg-white/5",
    danger:
      "bg-[var(--color-danger)]/15 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/25 border border-[var(--color-danger)]/40",
  };
  return (
    <button
      ref={ref}
      className={cn(base, sizes[size], variants[variant], className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
});

type IconType = React.ComponentType<{ className?: string }>;

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & {
    label?: string;
    hint?: string;
    icon?: IconType;
  }
>(function Input({ className, label, hint, icon: Icon, id, ...rest }, ref) {
  const inputId = id || rest.name;
  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs font-medium uppercase tracking-wider text-[var(--color-muted)]"
        >
          {label}
        </label>
      )}
      <div className="relative w-full">
        {Icon && (
          <Icon className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            "h-12 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-white placeholder:text-white/40 outline-none transition-colors focus:border-[var(--color-accent)]/60 focus:ring-2 focus:ring-[var(--color-accent)]/20",
            Icon ? "pl-11 pr-4" : "px-5",
            className,
          )}
          {...rest}
        />
      </div>
      {hint && <p className="text-xs text-[var(--color-muted)]">{hint}</p>}
    </div>
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; hint?: string }
>(function Textarea({ className, label, hint, id, ...rest }, ref) {
  const inputId = id || rest.name;
  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs font-medium uppercase tracking-wider text-[var(--color-muted)]"
        >
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={inputId}
        rows={4}
        className={cn(
          "w-full resize-none rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4 text-sm text-white placeholder:text-white/40 outline-none transition-colors focus:border-[var(--color-accent)]/60 focus:ring-2 focus:ring-[var(--color-accent)]/20",
          className,
        )}
        {...rest}
      />
      {hint && <p className="text-xs text-[var(--color-muted)]">{hint}</p>}
    </div>
  );
});

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-6",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function Section({
  title,
  children,
  className,
  contentClassName,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-6 sm:p-8",
        className,
      )}
    >
      <h2 className="font-display text-xl font-bold tracking-tight text-white">
        {title}
      </h2>
      <div className={cn("mt-5", contentClassName)}>{children}</div>
    </section>
  );
}

export function Pill({
  children,
  tone = "default",
  className,
}: {
  children: React.ReactNode;
  tone?: "default" | "accent" | "warn" | "positive";
  className?: string;
}) {
  const tones = {
    default: "bg-white/5 text-white/70 border-white/10",
    accent: "bg-[var(--color-accent)]/10 text-[var(--color-accent)] border-[var(--color-accent)]/30",
    warn: "bg-[var(--color-warn)]/10 text-[var(--color-warn)] border-[var(--color-warn)]/30",
    positive: "bg-[var(--color-positive)]/10 text-[var(--color-positive)] border-[var(--color-positive)]/30",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatTile({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4",
        accent
          ? "bg-[var(--color-accent)] text-black border-[var(--color-accent)]"
          : "bg-[var(--color-surface)] border-[var(--color-border)] text-white",
      )}
    >
      <div className={cn("text-[10px] font-bold uppercase tracking-wider", accent ? "text-black/70" : "text-[var(--color-muted)]")}>
        {label}
      </div>
      <div className="mt-1 font-display text-2xl font-bold tabular-nums leading-none">{value}</div>
      {sub && (
        <div className={cn("mt-1 text-xs", accent ? "text-black/60" : "text-[var(--color-muted)]")}>{sub}</div>
      )}
    </div>
  );
}
