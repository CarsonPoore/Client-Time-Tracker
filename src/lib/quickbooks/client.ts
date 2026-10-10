const AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
const API_BASE = {
  sandbox: "https://sandbox-quickbooks.api.intuit.com",
  production: "https://quickbooks.api.intuit.com",
} as const;
const SCOPE = "com.intuit.quickbooks.accounting";
const MINOR_VERSION = "75";
const PAGE_SIZE = 1000;

export type QBEnvironment = keyof typeof API_BASE;

export interface QBConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  environment: QBEnvironment;
}

export interface QBTokens {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
}

export interface QBCustomer {
  id: string;
  displayName: string;
  companyName: string | null;
  email: string | null;
}

export class QuickBooksError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "QuickBooksError";
  }
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  x_refresh_token_expires_in: number;
}

interface RawCustomer {
  Id: string;
  DisplayName: string;
  CompanyName?: string;
  PrimaryEmailAddr?: { Address?: string };
}

export class QuickBooksClient {
  constructor(
    private config: QBConfig,
    private fetchImpl: typeof fetch = fetch,
    private now: () => number = Date.now,
  ) {}

  authorizeUrl(state: string): string {
    const q = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: "code",
      scope: SCOPE,
      redirect_uri: this.config.redirectUri,
      state,
    });
    return `${AUTHORIZE_URL}?${q}`;
  }

  exchangeCode(code: string): Promise<QBTokens> {
    return this.tokenRequest({ grant_type: "authorization_code", code, redirect_uri: this.config.redirectUri });
  }

  refresh(refreshToken: string): Promise<QBTokens> {
    return this.tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
  }

  async revoke(token: string): Promise<void> {
    const res = await this.fetchImpl(REVOKE_URL, {
      method: "POST",
      headers: { Authorization: this.basicAuth(), Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) throw await this.error(res, "revoke");
  }

  async getCompanyName(accessToken: string, realmId: string): Promise<string | null> {
    const res = await this.api<{ CompanyInfo?: { CompanyName?: string } }>(accessToken, realmId, `/companyinfo/${encodeURIComponent(realmId)}`);
    return res.CompanyInfo?.CompanyName ?? null;
  }

  async listCustomers(accessToken: string, realmId: string): Promise<QBCustomer[]> {
    const all: QBCustomer[] = [];
    for (let start = 1; start < 100 * PAGE_SIZE; start += PAGE_SIZE) {
      const query = `select * from Customer where Active = true startposition ${start} maxresults ${PAGE_SIZE}`;
      const res = await this.api<{ QueryResponse: { Customer?: RawCustomer[] } }>(
        accessToken, realmId, `/query?${new URLSearchParams({ query })}`,
      );
      const page = res.QueryResponse.Customer ?? [];
      all.push(...page.map(toCustomer));
      if (page.length < PAGE_SIZE) break;
    }
    return all.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  async getCustomer(accessToken: string, realmId: string, id: string): Promise<QBCustomer | null> {
    if (!/^\d+$/.test(id)) return null;
    try {
      const res = await this.api<{ Customer: RawCustomer }>(accessToken, realmId, `/customer/${id}`);
      return toCustomer(res.Customer);
    } catch (e) {
      if (e instanceof QuickBooksError && (e.status === 400 || e.status === 404)) return null;
      throw e;
    }
  }

  private async api<T>(accessToken: string, realmId: string, path: string): Promise<T> {
    const sep = path.includes("?") ? "&" : "?";
    const url = `${API_BASE[this.config.environment]}/v3/company/${encodeURIComponent(realmId)}${path}${sep}minorversion=${MINOR_VERSION}`;
    const res = await this.fetchImpl(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } });
    if (!res.ok) throw await this.error(res, `GET ${path.split("?")[0]}`);
    return (await res.json()) as T;
  }

  private async tokenRequest(body: Record<string, string>): Promise<QBTokens> {
    const res = await this.fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { Authorization: this.basicAuth(), Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
    });
    if (!res.ok) throw await this.error(res, body.grant_type);
    const t = (await res.json()) as TokenResponse;
    const now = this.now();
    return {
      accessToken: t.access_token,
      refreshToken: t.refresh_token,
      accessExpiresAt: new Date(now + t.expires_in * 1000),
      refreshExpiresAt: new Date(now + t.x_refresh_token_expires_in * 1000),
    };
  }

  private basicAuth(): string {
    return `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString("base64")}`;
  }

  private async error(res: Response, what: string): Promise<QuickBooksError> {
    const body = await res.text().catch(() => "");
    return new QuickBooksError(res.status, `QuickBooks ${what} failed: ${res.status} ${body.slice(0, 200)}`);
  }
}

function toCustomer(c: RawCustomer): QBCustomer {
  return {
    id: c.Id,
    displayName: c.DisplayName,
    companyName: c.CompanyName?.trim() || null,
    email: c.PrimaryEmailAddr?.Address?.trim() || null,
  };
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\b(llc|inc|co|corp|ltd|the)\b/g, "").trim().replace(/\s+/g, " ");

/** Best guess at which QuickBooks customer a CPC client is: exact contact email, then normalized name. */
export function suggestCustomer(
  client: { name: string; contact_email: string | null },
  customers: QBCustomer[],
): QBCustomer | null {
  const email = client.contact_email?.trim().toLowerCase();
  if (email) {
    const byEmail = customers.filter((c) => c.email?.toLowerCase() === email);
    if (byEmail.length === 1) return byEmail[0];
  }
  const name = normalize(client.name);
  if (!name) return null;
  const byName = customers.filter((c) => normalize(c.displayName) === name || (c.companyName && normalize(c.companyName) === name));
  return byName.length === 1 ? byName[0] : null;
}
