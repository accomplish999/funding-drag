export class HttpStatusError extends Error {
  readonly status: number;
  readonly url: string;

  constructor(status: number, url: string, body: string) {
    const host = safeHost(url);
    const clipped = body.replace(/\s+/g, " ").trim().slice(0, 180);
    super(clipped ? `HTTP ${status} from ${host}. ${clipped}` : `HTTP ${status} from ${host}.`);
    this.name = "HttpStatusError";
    this.status = status;
    this.url = url;
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export interface HttpClient {
  get(url: string): Promise<unknown>;
  post(url: string, body: unknown): Promise<unknown>;
}

const USER_AGENT = "funding-drag/0.1.0 (+https://github.com/accomplish999/funding-drag)";

async function readJson(response: Response, url: string): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) {
    throw new HttpStatusError(response.status, url, text);
  }
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpStatusError(response.status, url, "Response was not JSON.");
  }
}

export function createHttp(fetchImpl: typeof fetch = fetch): HttpClient {
  const headers = { Accept: "application/json", "User-Agent": USER_AGENT };
  return {
    async get(url: string): Promise<unknown> {
      const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(20_000) });
      return readJson(response, url);
    },
    async post(url: string, body: unknown): Promise<unknown> {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
      return readJson(response, url);
    },
  };
}
