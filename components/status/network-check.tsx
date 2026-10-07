"use client";

import { useCallback, useEffect, useState } from "react";
import { buttonClass } from "@/components/ui/button-styles";

type Result = { state: "pending" } | { state: "ok"; detail: string } | { state: "fail"; detail: string };

const TIMEOUT_MS = 8_000;

async function checkHttp(url: string, key: string): Promise<Result> {
  const started = performance.now();
  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return { state: "fail", detail: `сервер ответил ${response.status}` };
    const ms = Math.round(performance.now() - started);
    return { state: "ok", detail: ms > 1500 ? `${ms} мс — медленно, но работает` : `${ms} мс` };
  } catch {
    return { state: "fail", detail: "нет связи с Supabase из этой сети" };
  }
}

/** Opens the same Realtime WebSocket the race uses; school firewalls sometimes block it. */
function checkSocket(url: string, key: string): Promise<Result> {
  return new Promise((resolve) => {
    const socketUrl = `${url.replace(/^http/, "ws")}/realtime/v1/websocket?apikey=${encodeURIComponent(key)}&vsn=1.0.0`;
    const started = performance.now();
    let socket: WebSocket | null = null;
    const finish = (result: Result) => {
      clearTimeout(timer);
      if (socket) {
        socket.onopen = socket.onerror = null;
        socket.close();
      }
      resolve(result);
    };
    const timer = setTimeout(
      () => finish({ state: "fail", detail: "WebSocket не открылся — карта будет обновляться раз в 10 с" }),
      TIMEOUT_MS,
    );
    try {
      socket = new WebSocket(socketUrl);
    } catch {
      finish({ state: "fail", detail: "браузер не поддерживает WebSocket" });
      return;
    }
    socket.onopen = () => finish({ state: "ok", detail: `${Math.round(performance.now() - started)} мс` });
    socket.onerror = () =>
      finish({ state: "fail", detail: "WebSocket заблокирован — карта будет обновляться раз в 10 с" });
  });
}

function Row({ label, result }: { label: string; result: Result }) {
  const mark =
    result.state === "pending" ? (
      <span className="size-5 animate-spin rounded-full border-2 border-line border-t-brand" aria-hidden="true" />
    ) : result.state === "ok" ? (
      <span className="grid size-6 place-items-center rounded-full bg-teal-soft text-sm font-bold text-teal-strong" aria-hidden="true">
        ✓
      </span>
    ) : (
      <span className="grid size-6 place-items-center rounded-full bg-danger-soft text-sm font-bold text-danger" aria-hidden="true">
        !
      </span>
    );
  return (
    <li className="flex items-start gap-3 py-3">
      <span className="mt-0.5 grid w-6 shrink-0 place-items-center">{mark}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{label}</span>
        <span className="block text-sm text-ink-muted">
          {result.state === "pending" ? "проверяем…" : result.detail}
          <span className="sr-only">{result.state === "ok" ? " — в порядке" : result.state === "fail" ? " — проблема" : ""}</span>
        </span>
      </span>
    </li>
  );
}

/** Checks the network of THIS device — open the page on a student's phone in the school Wi-Fi. */
export function NetworkCheck({ url, publishableKey }: { url: string; publishableKey: string }) {
  const [http, setHttp] = useState<Result>({ state: "pending" });
  const [socket, setSocket] = useState<Result>({ state: "pending" });

  const run = useCallback(() => {
    void checkHttp(url, publishableKey).then(setHttp);
    void checkSocket(url, publishableKey).then(setSocket);
  }, [url, publishableKey]);

  useEffect(run, [run]);

  const busy = http.state === "pending" || socket.state === "pending";
  return (
    <div>
      <ul className="divide-y divide-line">
        <Row label="Связь с сервером" result={http} />
        <Row label="Обновления в реальном времени (WebSocket)" result={socket} />
      </ul>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setHttp({ state: "pending" });
          setSocket({ state: "pending" });
          run();
        }}
        className={buttonClass({ variant: "secondary", size: "sm", className: "mt-4" })}
      >
        Проверить ещё раз
      </button>
    </div>
  );
}
