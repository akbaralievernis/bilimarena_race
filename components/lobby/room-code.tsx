"use client";

import { useState } from "react";
import { formatRoomCode } from "@/lib/race/validation";

type Copied = "code" | "link" | null;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Big, dictation-friendly room code with copy actions for the teacher. */
export function RoomCode({ code }: { code: string }) {
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
      <p className="text-xs font-extrabold tracking-widest text-brand-strong uppercase">Код комнаты</p>
      <p
        className="mt-2 font-mono text-4xl font-bold tracking-[0.2em] text-ink sm:text-5xl"
        aria-label={`Код комнаты: ${code.split("").join(" ")}`}
      >
        {formatRoomCode(code)}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={() => copy("code")}
          className="min-h-10 rounded-xl bg-surface px-3.5 text-sm font-bold text-brand-strong shadow-card transition hover:shadow-lift active:scale-[0.97]"
        >
          {copied === "code" ? "Скопировано" : "Копировать код"}
        </button>
        <button
          type="button"
          onClick={() => copy("link")}
          className="min-h-10 rounded-xl bg-surface px-3.5 text-sm font-bold text-brand-strong shadow-card transition hover:shadow-lift active:scale-[0.97]"
        >
          {copied === "link" ? "Скопировано" : "Копировать ссылку"}
        </button>
      </div>
      <p className="sr-only" role="status">
        {copied ? "Скопировано в буфер обмена" : ""}
      </p>
      {failed && <p className="mt-2 text-xs font-semibold text-danger">Не удалось скопировать — продиктуйте код.</p>}
    </div>
  );
}
