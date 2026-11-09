// Gemeinsame Helfer: Abruf mit Zeitlimit, Cache mit Altbestand, gedrosselte Warteschlange.

const UA = "marktwelt/0.1 (privates Dashboard)";

export async function getText(url: string, timeoutMs = 12000): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "*/*" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

export async function getJson<T = unknown>(url: string, timeoutMs?: number): Promise<T> {
  return JSON.parse(await getText(url, timeoutMs)) as T;
}

export async function postJson<T = unknown>(url: string, body: unknown, timeoutMs = 12000): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return (await res.json()) as T;
}

type Entry = { value: unknown; at: number; pending?: Promise<unknown> };
const store = new Map<string, Entry>();

/**
 * Liefert den Wert aus dem Cache, solange er jünger als ttl ist.
 * Schlägt ein neuer Abruf fehl, kommt der alte Wert zurück (falls vorhanden).
 */
export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const e = store.get(key);
  const now = Date.now();
  if (e && now - e.at < ttlMs) return e.value as T;
  if (e?.pending) return e.pending as Promise<T>;
  const pending = load()
    .then((value) => {
      store.set(key, { value, at: Date.now() });
      return value;
    })
    .catch((err) => {
      if (e) {
        store.set(key, { value: e.value, at: e.at });
        return e.value as T;
      }
      store.delete(key);
      throw err;
    });
  store.set(key, { value: e?.value, at: e?.at ?? 0, pending });
  return pending;
}

/** Warteschlange: höchstens `concurrency` gleichzeitig, mindestens `gapMs` zwischen Starts. */
export function throttle(concurrency: number, gapMs: number) {
  let active = 0;
  let last = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    if (active >= concurrency || queue.length === 0) return;
    const wait = Math.max(0, last + gapMs - Date.now());
    if (wait > 0) {
      setTimeout(next, wait);
      return;
    }
    last = Date.now();
    active++;
    queue.shift()!();
  };
  return <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => {
        fn()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      });
      next();
    });
}

export const num = (s: string | null | undefined): number | null => {
  if (s == null) return null;
  const v = Number(String(s).replace(/[$,%+\s]/g, ""));
  return Number.isFinite(v) ? v : null;
};

export async function settle<T>(items: T[], fn: (t: T) => Promise<unknown>) {
  return Promise.all(items.map((t) => fn(t).catch((e: Error) => ({ error: e.message }))));
}
