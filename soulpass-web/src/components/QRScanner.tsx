"use client";

import { useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { motion, AnimatePresence } from "framer-motion";
import { X, Camera } from "lucide-react";

export default function QRScanner({
  isOpen,
  onClose,
  onScan,
  title = "Scan QR",
  hint = "Point your camera at any SoulPass code.",
}: {
  isOpen: boolean;
  onClose: () => void;
  onScan: (data: string) => void;
  title?: string;
  hint?: string;
}) {
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    const elementId = "soulpass-qr-reader";

    (async () => {
      try {
        const scanner = new Html5Qrcode(elementId, { verbose: false });
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decoded) => {
            if (cancelled) return;
            onScan(decoded);
            void scanner.stop().catch(() => {});
          },
          () => {},
        );
      } catch {
        // Permission denied or no camera — silently leave the modal up.
      }
    })();

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      if (s && s.isScanning) {
        void s.stop().then(() => s.clear()).catch(() => {});
      }
      scannerRef.current = null;
    };
  }, [isOpen, onScan]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl"
        >
          <motion.div
            initial={{ scale: 0.96, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
          >
            <button
              onClick={onClose}
              className="absolute right-4 top-4 rounded-full bg-white/5 p-2 hover:bg-white/10"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-xl bg-[var(--color-accent)]/10 p-2 text-[var(--color-accent)]">
                <Camera className="h-5 w-5" />
              </div>
              <div>
                <div className="font-display text-lg font-bold">{title}</div>
                <div className="text-xs text-white/50">{hint}</div>
              </div>
            </div>
            <div
              id="soulpass-qr-reader"
              className="aspect-square w-full overflow-hidden rounded-2xl bg-black"
            />
            <div className="mt-4 text-center font-mono text-[10px] uppercase tracking-widest text-white/40">
              SoulPass secure scanner
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
