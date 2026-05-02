"use client";

import { useEffect, useRef } from "react";
import QR from "qrcode";

export function QRCode({
  value,
  size = 240,
  fg = "#F6F7F8",
  bg = "transparent",
}: {
  value: string;
  size?: number;
  fg?: string;
  bg?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    QR.toCanvas(ref.current, value, {
      width: size,
      margin: 1,
      color: { dark: fg, light: bg === "transparent" ? "#0000" : bg },
    }).catch(() => {});
  }, [value, size, fg, bg]);

  return <canvas ref={ref} width={size} height={size} className="rounded-xl" />;
}
