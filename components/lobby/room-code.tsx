"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/i18n-provider";
import { formatRoomCode } from "@/lib/race/validation";
import { JoinQr } from "./join-qr";

type Copied = "code" | "link" | null;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** QR code and a big, dictation-friendly room code with copy actions for the teacher. */
export function RoomCode({ code }: { code: string }) {
  const { m } = useI18n();
  const [copied, setCopied] = useState<Copied>(null);
  const [failed, setFailed] = useState(false);

  async function copy(kind: Exclude<Copied, null>) {
    const text = kind === "code" ? code : `${window.location.origin}/join?code=${code}`;
    const ok = await copyText(text);
    setFailed(!ok);
    setCopied(ok ? kind : null);
    if (ok) setTimeout(() => setCopied((current) => (current === kind ? null : current)), 2000);
  }

  return (
    <div className="rounded-2xl bg-brand-soft p-5 text-center sm:p-6 lg:min-w-72">
      <div className="flex justify-center">
        <JoinQr code={code} />
      </div>
      <p className="mt-2 text-xs text-ink-muted">{m.roomCode.scanHint}</p>
      <p className="mt-4 text-xs font-extrabold tracking-widest text-brand-strong uppercase">{m.roomCode.title}</p>
      <p
        className="mt-2 font-mono text-4xl font-bold tracking-[0.2em] text-ink sm:text-5xl"
        aria-label={m.roomCode.aria(code.split("").join(" "))}
      >
        {formatRoomCode(code)}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={() => copy("code")}
          className="min-h-10 rounded-xl bg-surface px-3.5 text-sm font-bold text-brand-strong shadow-card transition hover:shadow-lift active:scale-[0.97]"
        >
          {copied === "code" ? m.roomCode.copied : m.roomCode.copyCode}
        </button>
        <button
          type="button"
          onClick={() => copy("link")}
          className="min-h-10 rounded-xl bg-surface px-3.5 text-sm font-bold text-brand-strong shadow-card transition hover:shadow-lift active:scale-[0.97]"
        >
          {copied === "link" ? m.roomCode.copied : m.roomCode.copyLink}
        </button>
      </div>
      <p className="sr-only" role="status">
        {copied ? m.roomCode.copiedSr : ""}
      </p>
      {failed && <p className="mt-2 text-xs font-semibold text-danger">{m.roomCode.copyFailed}</p>}
    </div>
  );
}
