"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AIMatchCandidate = {
  wallet: string;
  name: string | null;
  avatar: string | null;
  bio: string | null;
  reputation: number | null;
  preRankScore: number | null;
  preRankReasons: string[];
};

export type AIMatchResult = {
  primary: { wallet: string; reason: string } | null;
  alternates: Array<{ wallet: string; reason: string }>;
  candidates: AIMatchCandidate[];
  fallback?: boolean;
};

export type AIMatchMeta = {
  templateId: string;
  templateName: string;
  intent: string;
  model: string;
  candidateCount: number;
  candidates: AIMatchCandidate[];
};

export type AIMatchPhase = "idle" | "thinking" | "writing" | "done" | "error";

export type AIMatchState = {
  phase: AIMatchPhase;
  meta: AIMatchMeta | null;
  thinking: string;
  result: AIMatchResult | null;
  error: string | null;
};

const INITIAL: AIMatchState = {
  phase: "idle",
  meta: null,
  thinking: "",
  result: null,
  error: null,
};

// Streams Server-Sent Events from /api/events/[address]/ai-match. Uses fetch
// instead of EventSource so we can POST in the future, send headers, and abort
// cleanly when the component unmounts or the user re-runs.
export function useAIMatch(args: { eventAddress: string; viewerWallet: string; intent: string }) {
  const { eventAddress, viewerWallet, intent } = args;
  const [state, setState] = useState<AIMatchState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState({ ...INITIAL, phase: "thinking" });

    try {
      const url = `/api/events/${eventAddress}/ai-match?for=${viewerWallet}&intent=${encodeURIComponent(
        intent,
      )}`;
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { Accept: "text/event-stream" },
        cache: "no-store",
      });
      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Stream request failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        // SSE messages are separated by a blank line.
        let nl: number;
        while ((nl = buf.indexOf("\n\n")) !== -1) {
          const block = buf.slice(0, nl);
          buf = buf.slice(nl + 2);

          let event = "message";
          const dataLines: string[] = [];
          for (const line of block.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
          }
          if (dataLines.length === 0) continue;
          const dataStr = dataLines.join("\n");

          if (event === "thinking") {
            // Plain-text token deltas — append.
            setState((s) => ({ ...s, phase: "thinking", thinking: s.thinking + dataStr }));
          } else if (event === "answer") {
            setState((s) => (s.phase === "thinking" ? { ...s, phase: "writing" } : s));
          } else if (event === "meta") {
            try {
              const meta = JSON.parse(dataStr) as AIMatchMeta;
              setState((s) => ({ ...s, meta }));
            } catch {
              // ignore malformed
            }
          } else if (event === "result") {
            try {
              const result = JSON.parse(dataStr) as AIMatchResult;
              setState((s) => ({ ...s, phase: "done", result }));
            } catch {
              setState((s) => ({ ...s, phase: "error", error: "Bad result payload" }));
            }
          } else if (event === "error") {
            setState((s) => ({ ...s, phase: "error", error: dataStr }));
          }
        }
      }

      setState((s) => (s.phase === "done" || s.phase === "error" ? s : { ...s, phase: "done" }));
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setState((s) => ({ ...s, phase: "error", error: (e as Error).message }));
    }
  }, [eventAddress, viewerWallet, intent]);

  // Auto-run on mount + when intent / wallet / event change.
  useEffect(() => {
    void run();
    return () => abortRef.current?.abort();
    // run() already memoizes on its deps
  }, [run]);

  return { ...state, refresh: run };
}
