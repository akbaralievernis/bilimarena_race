"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/i18n-provider";

/**
 * QR code with the join link (/join?code=…): students point the camera and
 * land on the join form with the code filled in. Built in the browser, so the
 * link always has the address the teacher actually opened (Vercel, localhost).
 */
export function JoinQr({ code, className = "size-40" }: { code: string; className?: string }) {
  const { m } = useI18n();
  const [qr, setQr] = useState<{ svg: string; url: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url = `${window.location.origin}/join?code=${encodeURIComponent(code)}`;
    QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#202B46", light: "#FFFFFF" } })
      .then((svg) => {
        if (!cancelled) setQr({ svg, url });
      })
      .catch(() => {
        if (!cancelled) setQr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (!qr) return <div className={`${className} animate-pulse rounded-xl bg-surface`} aria-hidden="true" />;

  return (
    <div
      role="img"
      aria-label={m.roomCode.qrAria(qr.url)}
      className={`${className} overflow-hidden rounded-xl bg-white p-1.5 shadow-card [&>svg]:size-full`}
      // The library returns plain SVG markup for our own URL; nothing user-provided goes in.
      dangerouslySetInnerHTML={{ __html: qr.svg }}
    />
  );
}
