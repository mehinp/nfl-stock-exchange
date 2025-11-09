const DEFAULT_API_URL = "https://nflse-backend.up.railway.app";
export const API_URL = (import.meta.env.VITE_API_URL || DEFAULT_API_URL).replace(/\/+$/, "");
const AUTH_TOKEN_KEY = "nflxchange.token";
const AUTH_USER_ID_KEY = "nflxchange.userId";
const AUTH_USER_EMAIL_KEY = "nflxchange.userEmail";

export const buildUrl = (path: string) => `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;

const isBrowser = typeof window !== "undefined";
export const SESSION_EVENT = "nflxchange:session";

const notifySessionChange = () => {
  if (!isBrowser) return;
  window.dispatchEvent(new CustomEvent(SESSION_EVENT));
};

export const authSession = {
  getToken(): string | null {
    if (!isBrowser) return null;
    return localStorage.getItem(AUTH_TOKEN_KEY);
  },
  setSession({
    token,
    userId,
    email,
  }: {
    token: string;
    userId: number;
    email: string;
  }) {
    if (!isBrowser) return;
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem(AUTH_USER_ID_KEY, String(userId));
    localStorage.setItem(AUTH_USER_EMAIL_KEY, email);
    notifySessionChange();
  },
  clear() {
    if (!isBrowser) return;
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_ID_KEY);
    localStorage.removeItem(AUTH_USER_EMAIL_KEY);
    notifySessionChange();
  },
  getUser() {
    if (!isBrowser) return null;
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    const userId = localStorage.getItem(AUTH_USER_ID_KEY);
    const email = localStorage.getItem(AUTH_USER_EMAIL_KEY);
    if (!token || !userId || !email) return null;
    return { token, userId: Number(userId), email };
  },
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers({
    Accept: "application/json",
    "ngrok-skip-browser-warning": "true",
  });

  if (init?.headers) {
    const initialHeaders = new Headers(init.headers);
    initialHeaders.forEach((value, key) => headers.set(key, value));
  }

  const token = authSession.getToken();
  if (token) {
    headers.set("X-Auth-Header", token);
  }

  const response = await fetch(buildUrl(path), {
    ...init,
    headers,
  });

  const raw = await response.text();
  const parseJson = () => {
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  if (!response.ok) {
    const data = parseJson();
    const detail = data?.detail ?? raw ?? `Request to ${path} failed`;
    throw new Error(detail);
  }

  return (parseJson() as T) ?? ({} as T);
}

export type MarketInstrumentType = "team" | "etf";

export interface TeamMarketInformation {
  team_name: string;
  price: number;
  value?: number;
  volume?: number;
  timestamp?: string;
  instrumentType?: MarketInstrumentType;
}

type RawInstrument = {
  team_name: string;
  value?: number | string | null;
  price?: number | string | null;
  volume?: number | string | null;
  timestamp?: string;
  type?: string | null;
};

type TeamListApiResponse =
  | RawInstrument[]
  | {
      teams?: RawInstrument[] | null;
      etfs?: RawInstrument[] | null;
      data?: RawInstrument[] | null;
    }
  | null
  | undefined;

const parseNumeric = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  return undefined;
};

const normalizeInstrument = (
  entry: RawInstrument,
  fallbackType: MarketInstrumentType = "team",
): TeamMarketInformation => {
  const numericValue = parseNumeric(entry.value ?? entry.price);
  const numericPrice = parseNumeric(entry.price ?? entry.value) ?? numericValue;
  const numericVolume = parseNumeric(entry.volume);
  const resolvedType =
    entry.type && entry.type.toLowerCase() === "etf"
      ? "etf"
      : fallbackType;

  return {
    team_name: entry.team_name,
    value: numericValue ?? numericPrice ?? 0,
    price: numericPrice ?? numericValue ?? 0,
    volume: numericVolume,
    timestamp: entry.timestamp ?? "",
    instrumentType: resolvedType,
  };
};

const normalizeInstrumentList = (
  payload: TeamListApiResponse,
  fallbackType: MarketInstrumentType = "team",
): TeamMarketInformation[] => {
  if (!payload) return [];
  if (Array.isArray(payload)) {
    return payload.map((entry) => normalizeInstrument(entry, fallbackType));
  }
  if (typeof payload === "object") {
    const baseArray = Array.isArray(payload.teams)
      ? payload.teams
      : Array.isArray(payload.data)
        ? payload.data
        : [];
    const etfArray = Array.isArray(payload.etfs) ? payload.etfs : [];
    return [
      ...baseArray.map((entry) => normalizeInstrument(entry, "team")),
      ...etfArray.map((entry) => normalizeInstrument(entry, "etf")),
    ];
  }
  return [];
};

export async function fetchTeams() {
  const response = await request<TeamListApiResponse>("/market/all-teams");
  return normalizeInstrumentList(response, "team");
}

export async function fetchTeamHistory(teamName: string) {
  const response = await request<TeamListApiResponse>(`/market/team/${encodeURIComponent(teamName)}`);
  return normalizeInstrumentList(response, "team");
}


export interface AuthResponse {
  success: boolean;
  access_token: string;
  token_type: string;
  user_id: number;
}

interface SignupPayload {
  email: string;
  password: string;
  confirm_password: string;
  balance: number;
}

interface LoginPayload {
  email: string;
  password: string;
}

export async function signupUser(payload: SignupPayload) {
  const result = await request<AuthResponse>("/auth/signup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  authSession.setSession({
    token: result.access_token,
    userId: result.user_id,
    email: payload.email,
  });
  return result;
}

export async function loginUser(payload: LoginPayload) {
  const result = await request<AuthResponse>("/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  authSession.setSession({
    token: result.access_token,
    userId: result.user_id,
    email: payload.email,
  });
  return result;
}

export async function fetchFlashPicks() {
  throw new Error("Flash picks endpoint not implemented on the public API");
}

type TradeAction = "buy" | "sell";

export interface TradePayload {
  team_name: string;
  quantity: number;
}

export interface TradeResponse {
  success: boolean;
  team_name: string;
  quantity: number;
  price: string;
  balance: string;
}

export function executeTrade(action: TradeAction, payload: TradePayload) {
  return request<TradeResponse>(`/trades/${action}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export interface PortfolioPosition {
  team_name: string;
  quantity: number;
  avg_price?: string;
  avg_buy_price: string;
  current_price: string;
  position_value: string;
  cost_basis: string;
  unrealized_pnl: string;
  last_transaction: string;
}

export interface PortfolioTrade {
  id: string;
  team_name: string;
  action: "buy" | "sell";
  quantity: number;
  price: string;
  avg_buy_price?: string;
  timestamp: string;
}

export interface PortfolioResponse {
  positions: PortfolioPosition[];
  total_value: string;
  total_unrealized_pnl: string;
  balance?: string;
  cash_balance?: string;
  cashBalance?: string;
  initial_deposit?: string;
  initialDeposit?: string;
  trades?: PortfolioTrade[];
}

export function fetchPortfolio() {
  return request<PortfolioResponse>("/trades/portfolio");
}

export interface PortfolioLiveHistoryPoint {
  timestamp: string;
  balance: string;
}

export interface PortfolioLiveHistoryResponse {
  user_id: number;
  history: PortfolioLiveHistoryPoint[];
  initial_deposit?: string;
  current_cash_balance?: string;
  current_total_account_value?: string;
}

export interface PortfolioRecomputedHistoryPoint {
  timestamp: string;
  current_total_account_value: string;
  current_cash_balance: string;
  initial_deposit: string;
  cost_basis: string;
  pnl: string;
}

export interface PortfolioRecomputedHistoryResponse {
  user_id: number;
  history: PortfolioRecomputedHistoryPoint[];
}

export interface PortfolioCurrentBalance {
  timestamp?: string;
  balance?: string;
  message?: string;
}

export function fetchPortfolioHistory() {
  return request<PortfolioLiveHistoryResponse>("/trades/portfolio/history");
}

export function fetchPortfolioCurrentBalance() {
  return request<PortfolioCurrentBalance>("/trades/portfolio/history/current");
}

export function fetchPortfolioHistoryRecomputed() {
  return request<PortfolioRecomputedHistoryResponse>("/trades/portfolio/history/recomputed");
}
