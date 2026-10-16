/**
 * Centralized RESTful API Client using fetch (`apiclient.ts`)
 * Handles JWT token storage, Authorization headers, and JSON serialization.
 */

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt?: string;
}

export interface WatchlistSymbol {
  _id: string;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  label: string;
  addedBy?: string;
  createdAt: string;
}

export interface TelegramBotStatusConfig {
  hasToken: boolean;
  maskedToken: string;
  botId?: number;
  botUsername?: string;
  botFirstName?: string;
  isPollingActive: boolean;
  lastUpdateId: number;
  lastPollAt?: string;
  lastError?: string;
  connectionMode: string;
}

export interface TelegramChatMessage {
  _id: string;
  updateId?: number;
  chatId: string;
  chatType?: string;
  senderUsername?: string;
  senderFirstName?: string;
  senderLastName?: string;
  text: string;
  direction: 'incoming' | 'outgoing';
  isRead: boolean;
  createdAt: string;
}

export interface DatabaseStatusInfo {
  isRemoteConnected: boolean;
  readyState: number;
  /** «اتصال برقرار است» / «اتصال برقرار نیست» */
  statusLabel: string;
  engineLabel: string;
  clusterHost: string;
  databaseName: string;
  hasConfiguredUri: boolean;
  activeUri: string;
  configuredExternalUri: string;
  lastError: string;
  collections: {
    users: number;
    symbols: number;
    telegramMessages: number;
    telegramBotConfigured: boolean;
    registeredSignals?: number;
  };
}

const TOKEN_STORAGE_KEY = 'admin_panel_jwt_token';

export const tokenStorage = {
  getToken(): string | null {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  },
  setToken(token: string): void {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  },
  clearToken(): void {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  },
};

async function requestJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = tokenStorage.getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401) {
      tokenStorage.clearToken();
    }
    throw new Error(data.error || `خطای ارتباط با سرور (${response.status})`);
  }

  return data as T;
}

export const apiClient = {
  // Auth API
  async login(email: string, password: string): Promise<{ token: string; user: AdminUser }> {
    const res = await requestJson<{ token: string; user: AdminUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    tokenStorage.setToken(res.token);
    return res;
  },

  async register(name: string, email: string, password: string): Promise<{ token: string; user: AdminUser }> {
    const res = await requestJson<{ token: string; user: AdminUser }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
    tokenStorage.setToken(res.token);
    return res;
  },

  async getCurrentUser(): Promise<{ user: AdminUser }> {
    return requestJson<{ user: AdminUser }>('/api/auth/me');
  },

  // Binance Watchlist API
  async getWatchlist(): Promise<{ symbols: WatchlistSymbol[] }> {
    return requestJson<{ symbols: WatchlistSymbol[] }>('/api/watchlist');
  },

  async addWatchlistSymbol(symbol: string, label?: string): Promise<{ symbol: WatchlistSymbol; symbols: WatchlistSymbol[] }> {
    return requestJson<{ symbol: WatchlistSymbol; symbols: WatchlistSymbol[] }>('/api/watchlist', {
      method: 'POST',
      body: JSON.stringify({ symbol, label }),
    });
  },

  async removeWatchlistSymbol(symbol: string): Promise<{ ok: boolean; symbols: WatchlistSymbol[] }> {
    return requestJson<{ ok: boolean; symbols: WatchlistSymbol[] }>(
      `/api/watchlist/${encodeURIComponent(symbol)}`,
      { method: 'DELETE' }
    );
  },

  // Telegram Direct Bot API
  async getTelegramStatus(): Promise<{
    config: TelegramBotStatusConfig;
    stats: { totalMessages: number; unreadCount: number };
  }> {
    return requestJson('/api/telegram/status');
  },

  async connectTelegramBot(botToken: string): Promise<{
    ok: boolean;
    config: TelegramBotStatusConfig;
  }> {
    return requestJson('/api/telegram/connect', {
      method: 'POST',
      body: JSON.stringify({ botToken }),
    });
  },

  async toggleTelegramPolling(active?: boolean): Promise<{ ok: boolean; isPollingActive: boolean }> {
    return requestJson('/api/telegram/toggle-polling', {
      method: 'POST',
      body: JSON.stringify({ active }),
    });
  },

  async pollTelegramNow(): Promise<{
    ok: boolean;
    newCount: number;
    messages: TelegramChatMessage[];
    lastPollAt?: string;
    lastError?: string;
  }> {
    return requestJson('/api/telegram/poll-now', {
      method: 'POST',
    });
  },

  async getTelegramMessages(): Promise<{ messages: TelegramChatMessage[] }> {
    return requestJson('/api/telegram/messages');
  },

  async sendTelegramMessage(chatId: string, text: string): Promise<{
    ok: boolean;
    sentMessage: TelegramChatMessage;
    messages: TelegramChatMessage[];
  }> {
    return requestJson('/api/telegram/send', {
      method: 'POST',
      body: JSON.stringify({ chatId, text }),
    });
  },

  async markChatRead(chatId: string): Promise<{ ok: boolean; messages: TelegramChatMessage[] }> {
    return requestJson('/api/telegram/mark-read', {
      method: 'POST',
      body: JSON.stringify({ chatId }),
    });
  },

  async deleteTelegramChat(chatId: string): Promise<{ ok: boolean; messages: TelegramChatMessage[] }> {
    return requestJson(`/api/telegram/messages/${encodeURIComponent(chatId)}`, {
      method: 'DELETE',
    });
  },

  // MongoDB Database Management API
  async getDatabaseStatus(): Promise<{ status: DatabaseStatusInfo; users: AdminUser[] }> {
    return requestJson('/api/db/status');
  },

  async connectDatabase(mongoUri: string): Promise<{
    ok: boolean;
    mode: string;
    error?: string;
    status: DatabaseStatusInfo;
  }> {
    return requestJson('/api/db/connect', {
      method: 'POST',
      body: JSON.stringify({ mongoUri }),
    });
  },

  /** Downloads the plain-text signals + trades report and saves it locally. */
  async downloadTextReport(): Promise<string> {
    const token = tokenStorage.getToken();
    const response = await fetch('/api/reports/txt', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      let msg = `خطای دریافت گزارش (${response.status})`;
      try {
        const data = await response.json();
        if (data?.error) msg = data.error;
      } catch {
        /* keep the default message */
      }
      throw new Error(msg);
    }

    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = /filename="?([^";]+)"?/.exec(disposition);
    const filename = match?.[1] || `arz-report-${Date.now()}.txt`;

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    return filename;
  },

  // AvalAI (ChatGPT - https://docs.avalai.ir/fa/) API
  async getAvalAIConfig(): Promise<{ config: AvalAIConfigInfo }> {
    return requestJson('/api/avalai/config');
  },

  async saveAvalAIConfig(payload: {
    apiKey?: string;
    baseUrl?: string;
    modelName: string;
    systemPrompt?: string;
    temperature?: number;
  }): Promise<{ ok: boolean; config: AvalAIConfigInfo }> {
    return requestJson('/api/avalai/config', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async testAvalAIConnection(payload: {
    apiKey?: string;
    baseUrl?: string;
    modelName: string;
  }): Promise<{
    ok: boolean;
    reply: string;
    confirmedModel: string;
    latencyMs: number;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
    config: AvalAIConfigInfo;
  }> {
    return requestJson('/api/avalai/test', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async sendAvalAIChat(payload: {
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    modelName?: string;
  }): Promise<{
    ok: boolean;
    reply: string;
    model: string;
    latencyMs: number;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
  }> {
    return requestJson('/api/avalai/chat', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async analyzeAlBrooksSignal(payload: {
    symbol: string;
    interval: string;
    candles: Array<{
      time: number;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }>;
  }): Promise<{
    ok: boolean;
    signal: AlBrooksSignalInfo;
  }> {
    return requestJson('/api/avalai/albrooks-signal', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async analyzeAlBrooks2Signal(payload: {
    symbol: string;
    interval: string;
    candles: Array<{
      time: number;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }>;
    multiTimeframeCandles?: Record<
      string,
      Array<{
        time: number;
        open: number;
        high: number;
        low: number;
        close: number;
        volume: number;
      }>
    >;
  }): Promise<{
    ok: boolean;
    signal2: AlBrooks2SignalInfo;
  }> {
    return requestJson('/api/avalai/albrooks2-signal', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // Signals Engine API (سیگنال‌ها)
  async getSignals(): Promise<{ signals: RegisteredSignalInfo[] }> {
    return requestJson<{ signals: RegisteredSignalInfo[] }>('/api/signals');
  },

  async getSignalsStatus(): Promise<{ status: SignalEngineStatus }> {
    return requestJson<{ status: SignalEngineStatus }>('/api/signals/status');
  },

  async runSignalsNow(): Promise<{ ok: boolean; message: string }> {
    return requestJson<{ ok: boolean; message: string }>('/api/signals/run-now', {
      method: 'POST',
    });
  },

  async toggleSignalsScheduler(enabled?: boolean): Promise<{
    ok: boolean;
    isSchedulerEnabled: boolean;
    status: SignalEngineStatus;
  }> {
    return requestJson('/api/signals/toggle-scheduler', {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    });
  },

  async deleteSignal(id: string): Promise<{ ok: boolean; signals: RegisteredSignalInfo[] }> {
    return requestJson<{ ok: boolean; signals: RegisteredSignalInfo[] }>(
      `/api/signals/${encodeURIComponent(id)}`,
      { method: 'DELETE' }
    );
  },

  async clearSignals(): Promise<{ ok: boolean; signals: RegisteredSignalInfo[] }> {
    return requestJson<{ ok: boolean; signals: RegisteredSignalInfo[] }>('/api/signals', {
      method: 'DELETE',
    });
  },

  // Virtual Demo Account API (حساب کاربری)
  async getAccount(): Promise<AccountSnapshot> {
    return requestJson<AccountSnapshot>('/api/account');
  },

  async saveAccountSettings(payload: {
    leverage?: number;
    marginPerTradePct?: number;
  }): Promise<AccountSnapshot> {
    return requestJson<AccountSnapshot>('/api/account/settings', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async resetAccount(): Promise<AccountSnapshot> {
    return requestJson<AccountSnapshot>('/api/account/reset', { method: 'POST' });
  },

  // Trade Engine API (ترید)
  async getPositions(): Promise<{
    positions: PositionInfo[];
    userId?: string;
    totalKnown?: number;
    diagnostics?: PositionDiagnostics;
  }> {
    return requestJson<{
      positions: PositionInfo[];
      userId?: string;
      totalKnown?: number;
      diagnostics?: PositionDiagnostics;
    }>('/api/trade/positions');
  },

  async getTradeStatus(): Promise<{ status: TradeEngineStatus }> {
    return requestJson<{ status: TradeEngineStatus }>('/api/trade/status');
  },

  async runTradeTick(): Promise<{
    ok: boolean;
    summary: TradeTickSummary;
    status: TradeEngineStatus;
  }> {
    return requestJson('/api/trade/tick', { method: 'POST' });
  },

  async closePosition(id: string): Promise<{ ok: boolean; positions: PositionInfo[] }> {
    return requestJson<{ ok: boolean; positions: PositionInfo[] }>(
      `/api/trade/positions/${encodeURIComponent(id)}/close`,
      { method: 'POST' }
    );
  },

  async deletePosition(id: string): Promise<{ ok: boolean; positions: PositionInfo[] }> {
    return requestJson<{ ok: boolean; positions: PositionInfo[] }>(
      `/api/trade/positions/${encodeURIComponent(id)}`,
      { method: 'DELETE' }
    );
  },

  async clearPositions(): Promise<{ ok: boolean; positions: PositionInfo[] }> {
    return requestJson<{ ok: boolean; positions: PositionInfo[] }>('/api/trade/positions', {
      method: 'DELETE',
    });
  },
};

export interface TradeAccountInfo {
  _id: string;
  userId: string;
  initialBalance: number;
  balance: number;
  leverage: number;
  marginPerTradePct: number;
  createdAt: string;
  updatedAt: string;
}

export interface TradeStatsInfo {
  initialBalance: number;
  balance: number;
  realizedPnl: number;
  unrealizedPnl: number;
  equity: number;
  usedMargin: number;
  freeMargin: number;
  openPositions: number;
  pendingPositions: number;
  closedPositions: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  leverage: number;
  marginPerTradePct: number;
}

export interface AccountSnapshot {
  account: TradeAccountInfo;
  stats: TradeStatsInfo;
}

export interface PositionFillInfo {
  type: 'OPEN' | 'PARTIAL_CLOSE' | 'CLOSE';
  price: number;
  quantity: number;
  pnl: number;
  note: string;
  at: string;
}

export interface PositionInfo {
  _id: string;
  userId: string;
  signalId: string;
  symbol: string;
  label: string;
  side: 'LONG' | 'SHORT';
  leverage: number;
  status: 'PENDING' | 'OPEN' | 'CLOSED';
  triggerAbove: boolean;
  entryTarget: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  quantity: number;
  remainingQuantity: number;
  notional: number;
  margin: number;
  realizedPnl: number;
  tp1Hit: boolean;
  closeReason: string;
  signalCycleNumber: number;
  aiEngineUsed: string;
  averageScore: number;
  fills: PositionFillInfo[];
  createdAt: string;
  openedAt: string | null;
  closedAt: string | null;
  updatedAt: string;
  currentPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  distanceToEntryPct: number;
}

export interface TradeTickSummary {
  pendingCreated: number;
  filled: number;
  partiallyClosed: number;
  closed: number;
}

export interface PositionDiagnostics {
  remoteReady: boolean;
  diskTotal: number;
  diskMine: number;
  remoteTotal: number;
  remoteMine: number;
  ownerKeys: string[];
  activeUri: string;
}

export interface TradeEngineStatus {
  isRunning: boolean;
  pollIntervalMs: number;
  leverage: number;
  tp1ClosePct: number;
  lastTickAt: string | null;
  lastError: string | null;
  positionsCreatedTotal: number;
  positionsClosedTotal: number;
  /** how many qualified signals were pushed here by the signals engine */
  signalsIngestedTotal: number;
  lastIngestedSignal: {
    signalId: string;
    symbol: string;
    side: 'LONG' | 'SHORT';
    at: string;
  } | null;
  lastIngestAt: string | null;
  lastIngestCreated: number;
  lastIngestNote: string | null;
  /** every user key the engine currently serves */
  knownUserIds: string[];
  lastTickSummary: TradeTickSummary;
}

export interface SignalMethodItem {
  id: string;
  /** true for method 6: shown for information, never counted as a vote */
  isSummary?: boolean;
  title: string;
  direction: 'LONG' | 'SHORT' | 'NO TRADE';
  setupName: string;
  score: number;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit1?: number;
  takeProfit2?: number;
}

export interface RegisteredSignalInfo {
  _id: string;
  symbol: string;
  label: string;
  interval: string;
  consensusDirection: 'LONG' | 'SHORT' | 'NO TRADE';
  isQualified: boolean;
  buySignalsCount: number;
  sellSignalsCount: number;
  totalSignalsChecked: number;
  matchedSignalsCount: number;
  currentPrice: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  riskRewardRatio: string;
  averageScore: number;
  signalsBreakdown: SignalMethodItem[];
  chatGptStatus: string;
  chatGptDirection: 'LONG' | 'SHORT' | 'NO TRADE';
  chatGptSetupName: string;
  chatGptReasoning: string;
  aiEngineUsed: string;
  aiVoteCounted?: boolean;
  cycleNumber: number;
  createdAt: string;
  dispatchedToTrade?: boolean;
  tradeStatus?: string;
  tradeDispatchNote?: string;
  tradeDispatchedAt?: string;
}

export interface SignalCycleSymbolResult {
  symbol: string;
  label: string;
  buySignalsCount: number;
  sellSignalsCount: number;
  totalSignalsChecked: number;
  matchedSignalsCount: number;
  consensusDirection: 'LONG' | 'SHORT' | 'NO TRADE';
  qualified: boolean;
  recorded: boolean;
  dispatchedToTrade?: boolean;
  tradeStatus?: string;
  tradeNote?: string;
  chatGptStatus: string;
  aiEngineUsed: string;
  error?: string;
}

export interface SignalEngineStatus {
  isRunning: boolean;
  isSchedulerEnabled: boolean;
  cycleNumber: number;
  timeframe: string;
  htfTimeframe: string;
  minConsensus: number;
  requestGapMs: number;
  cycleIntervalMs: number;
  lastRunAt: string | null;
  lastFinishedAt: string | null;
  nextRunAt: string | null;
  lastDurationMs: number | null;
  lastError: string | null;
  currentSymbol: string | null;
  currentIndex: number;
  totalSymbols: number;
  registeredLastCycle: number;
  /** qualified signals pushed straight to the trade engine in the last cycle */
  dispatchedLastCycle: number;
  evaluatedLastCycle: number;
  lastCycleResults: SignalCycleSymbolResult[];
}

export interface AlBrooksSignalInfo {
  symbol: string;
  interval: string;
  candlesAnalyzed: number;
  direction: 'LONG' | 'SHORT';
  alwaysInState: string;
  marketCycle: string;
  setupName: string;
  signalCandleIndex: number;
  signalCandleTime: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  ema20Current: number;
  swingHigh20: number;
  swingLow20: number;
  riskRewardRatio: string;
  winProbability: string;
  signalBarDescription: string;
  reasoning: string[];
  aiEngineUsed: string;
  trendlines?: {
    resistance: { startPrice: number; endPrice: number; startIndex: number; endIndex: number };
    support: { startPrice: number; endPrice: number; startIndex: number; endIndex: number };
  };
}

export interface AlBrooks2SignalInfo {
  styleName: string;
  symbol: string;
  marketType: string;
  interval: string;
  candlesAnalyzed: number;
  patternType: string;
  patternStatus: string;
  isValidSignal: boolean;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  scenarioDirection: 'LONG' | 'SHORT';
  patternHigh: number;
  patternLow: number;
  breakoutPrice: number;
  confirmationClosePrice: number | null;
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  riskRewardRatio: string;
  invalidationCondition: string;
  signalStrength: string;
  qualityScore: number;
  touchesCount: {
    upper: number;
    lower: number;
    total: number;
  };
  slopes: {
    upperSlopePct: string;
    lowerSlopePct: string;
    isConverging: boolean;
  };
  wedgeLines?: {
    upper: {
      startTime: number;
      endTime: number;
      startPrice: number;
      endPrice: number;
    };
    lower: {
      startTime: number;
      endTime: number;
      startPrice: number;
      endPrice: number;
    };
  };
  alBrooksConfirmation: {
    priorTrend: string;
    signalBarAnalysis: string;
    entryBarAnalysis: string;
    pullbackAndFailedBreakout: string;
    buyerSellerPressure: string;
  };
  bothBreakoutScenarios: {
    upsideBreakout: string;
    downsideBreakout: string;
  };
  prosReasons: string[];
  consReasons: string[];
  multiTimeframeRanking: Array<{
    rank: number;
    timeframe: string;
    candlesAnalyzed: number;
    patternType: string;
    patternStatus: string;
    statusBucket: 'در آستانه شکست' | 'شکست تأییدشده' | 'هنوز شرایط ورود ندارد';
    direction: 'LONG' | 'SHORT' | 'NEUTRAL';
    qualityScore: number;
    touchesTotal: number;
    entryPrice: number;
    stopLoss: number;
    takeProfit1: number;
    takeProfit2: number;
    riskRewardRatio: string;
  }>;
  finalCategorization: {
    nearBreakout: string[];
    confirmedBreakout: string[];
    noEntryYet: string[];
  };
  aiEngineUsed: string;
}

export interface AvalAIConfigInfo {
  hasApiKey: boolean;
  maskedApiKey: string;
  baseUrl: string;
  modelName: string;
  systemPrompt: string;
  temperature: number;
  lastTestStatus: 'success' | 'error' | 'untested';
  lastTestMessage: string;
  lastTestLatencyMs?: number;
  lastTestedAt?: string;
  updatedAt?: string;
}


