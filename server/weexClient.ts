/**
 * WEEX Futures REST API client
 * ---------------------------------------------------------------------------
 * Implemented strictly against the official WEEX futures documentation:
 *   https://www.weex.com/api-doc/catalog/core-trading-futures/api/rest-api/market-api
 *   https://www.weex.com/api-doc/catalog/core-trading-futures/api/rest-api/account-api
 *   https://www.weex.com/api-doc/catalog/core-trading-futures/api/rest-api/transaction-api
 *   https://www.weex.com/api-doc/products/spot/QuickStart/Signature
 *
 * Signature (docs):
 *   signature = BASE64( HMAC_SHA256( secret,
 *       timestamp + METHOD.toUpperCase() + requestPath +
 *       (queryString ? "?" + queryString : "") + body ) )
 *   Headers: ACCESS-KEY, ACCESS-SIGN, ACCESS-TIMESTAMP, ACCESS-PASSPHRASE
 *
 * Both public and signed endpoints are supported, for the production domain
 * (https://api-contract.weex.com) and the simulation domain
 * (https://api-sim.weex.com).
 */

export type WeexEnvironment = 'production' | 'simulation';

export interface WeexCredentials {
  apiKey: string;
  apiSecret: string;
  passphrase: string;
  environment?: WeexEnvironment;
}

export const WEEX_BASE_URLS: Record<WeexEnvironment, string> = {
  production: 'https://api-contract.weex.com',
  simulation: 'https://api-sim.weex.com',
};

export class WeexApiError extends Error {
  public readonly code: string;
  public readonly httpStatus: number;
  public readonly endpoint: string;
  public readonly raw?: unknown;

  constructor(message: string, options: { code?: string; httpStatus?: number; endpoint: string; raw?: unknown }) {
    super(message);
    this.name = 'WeexApiError';
    this.code = options.code || 'WEEX_API_ERROR';
    this.httpStatus = options.httpStatus || 0;
    this.endpoint = options.endpoint;
    this.raw = options.raw;
  }
}

export interface WeexSymbolRules {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  pricePrecision: number;
  quantityPrecision: number;
  minOrderSize: number;
  contractVal: number;
  maxLeverage: number;
  minLeverage: number;
  takerFeeRate: number;
  makerFeeRate: number;
  contractType?: string;
}

export interface WeexTicker {
  symbol: string;
  lastPrice: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
  quoteVolume: number;
  markPrice: number;
  indexPrice: number;
}

export interface WeexBalanceRow {
  asset: string;
  balance: number;
  availableBalance: number;
  frozen: number;
  unrealizePnl: number;
}

export interface WeexExchangePosition {
  id: number | string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  leverage: number;
  unrealizedPnl: number;
  marginType?: string;
  liquidatePrice?: number;
  updatedTime?: number;
  raw: Record<string, unknown>;
}

export type WeexOrderSide = 'BUY' | 'SELL';
export type WeexPositionSide = 'LONG' | 'SHORT';
export type WeexOrderType = 'LIMIT' | 'MARKET';

export interface PlaceOrderInput {
  symbol: string;
  side: WeexOrderSide;
  positionSide: WeexPositionSide;
  type: WeexOrderType;
  quantity: string;
  newClientOrderId: string;
  timeInForce?: 'GTC' | 'IOC' | 'FOK' | 'POST_ONLY';
  price?: string;
  tpTriggerPrice?: string;
  slTriggerPrice?: string;
  reduceOnly?: boolean;
}

export interface PlaceTpSlInput {
  symbol: string;
  planType: 'TAKE_PROFIT' | 'STOP_LOSS';
  triggerPrice: string;
  positionSide: WeexPositionSide;
  clientAlgoId: string;
  /** 0 / omitted => market execution */
  executePrice?: string;
  /** 0 / omitted + closePosition=true => whole position */
  quantity?: string;
  triggerPriceType?: 'CONTRACT_PRICE' | 'MARK_PRICE';
  closePosition?: boolean;
}

export interface WeexOrderInfo {
  orderId: number | string;
  clientOrderId?: string;
  symbol: string;
  side: WeexOrderSide;
  positionSide: WeexPositionSide;
  type: WeexOrderType;
  status: string;
  price: string;
  avgPrice: string;
  origQty: string;
  executedQty: string;
  cumQuote?: string;
  reduceOnly?: boolean;
  time?: number;
  updateTime?: number;
  raw: Record<string, unknown>;
}

export interface WeexTradeRow {
  id: number | string;
  orderId: number | string;
  symbol: string;
  side: WeexOrderSide;
  positionSide: WeexPositionSide;
  price: string;
  qty: string;
  quoteQty: string;
  realizedPnl: string;
  commission: string;
  commissionAsset: string;
  time: number;
  raw: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Small numeric helpers
// ---------------------------------------------------------------------------
export function toNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : fallback;
}

/** Rounds DOWN to a precision so an order never exceeds the requested size. */
export function floorToPrecision(value: number, precision: number): number {
  const p = Math.max(0, Math.min(12, Math.trunc(precision)));
  const factor = Math.pow(10, p);
  return Math.floor(value * factor + 1e-9) / factor;
}

export function formatToPrecision(value: number, precision: number): string {
  const p = Math.max(0, Math.min(12, Math.trunc(precision)));
  return floorToPrecision(value, p).toFixed(p);
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** WEEX sometimes wraps payloads in `{code,msg,data}`; the docs show raw bodies. */
function unwrapBody(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const obj = body as Record<string, unknown>;

  const hasEnvelope =
    'data' in obj && ('code' in obj || 'success' in obj || 'msg' in obj || 'message' in obj);
  if (!hasEnvelope) return body;

  const successFlag = obj.success;
  const code = obj.code !== undefined ? String(obj.code) : '';
  const failed =
    successFlag === false ||
    (code !== '' && code !== '0' && code !== '00000' && code !== 'SUCCESS' && code !== '200');

  if (failed) {
    const message =
      String(obj.msg ?? obj.message ?? obj.errorMessage ?? '') ||
      `WEEX request failed (code=${code || 'unknown'})`;
    throw new WeexApiError(message, { code: code || 'WEEX_REJECTED', endpoint: '' });
  }
  return obj.data;
}

export class WeexClient {
  private readonly baseUrl: string;
  private readonly credentials?: WeexCredentials;

  constructor(credentials?: WeexCredentials) {
    this.credentials = credentials;
    this.baseUrl = WEEX_BASE_URLS[credentials?.environment || 'production'];
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public hasCredentials(): boolean {
    return Boolean(
      this.credentials?.apiKey && this.credentials?.apiSecret && this.credentials?.passphrase
    );
  }

  // -------------------------------------------------------------------------
  // Signature + transport
  // -------------------------------------------------------------------------
  private async sign(
    timestamp: string,
    method: string,
    requestPath: string,
    queryString: string,
    body: string
  ): Promise<string> {
    const secret = this.credentials?.apiSecret || '';
    const payload =
      timestamp +
      method.toUpperCase() +
      requestPath +
      (queryString ? `?${queryString}` : '') +
      body;

    const key = await globalThis.crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await globalThis.crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(payload)
    );
    return toBase64(signature);
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    requestPath: string,
    options: {
      query?: Record<string, string | number | boolean | undefined>;
      body?: Record<string, unknown>;
      auth?: boolean;
    } = {}
  ): Promise<T> {
    const queryPairs: string[] = [];
    for (const [key, value] of Object.entries(options.query || {})) {
      if (value === undefined || value === null || value === '') continue;
      queryPairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
    const queryString = queryPairs.join('&');
    const bodyString =
      options.body !== undefined && options.body !== null ? JSON.stringify(options.body) : '';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (options.auth) {
      if (!this.hasCredentials()) {
        throw new WeexApiError('کلید API و Secret و Passphrase صرافی WEEX تنظیم نشده است.', {
          code: 'MISSING_CREDENTIALS',
          endpoint: requestPath,
        });
      }
      const timestamp = String(Date.now());
      headers['ACCESS-KEY'] = this.credentials!.apiKey;
      headers['ACCESS-TIMESTAMP'] = timestamp;
      headers['ACCESS-PASSPHRASE'] = this.credentials!.passphrase;
      headers['ACCESS-SIGN'] = await this.sign(
        timestamp,
        method,
        requestPath,
        queryString,
        bodyString
      );
    }

    const url = `${this.baseUrl}${requestPath}${queryString ? `?${queryString}` : ''}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: bodyString || undefined,
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err: any) {
      throw new WeexApiError(`ارتباط با WEEX برقرار نشد: ${err?.message || 'network error'}`, {
        code: 'NETWORK_ERROR',
        endpoint: requestPath,
      });
    }

    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      /* keep the raw text */
    }

    if (!response.ok) {
      const obj = (parsed || {}) as Record<string, unknown>;
      const message =
        String(obj.msg ?? obj.message ?? obj.errorMessage ?? obj.error ?? '') ||
        (typeof parsed === 'string' ? parsed.slice(0, 300) : '') ||
        `WEEX HTTP ${response.status}`;
      throw new WeexApiError(message, {
        code: String(obj.code ?? `HTTP_${response.status}`),
        httpStatus: response.status,
        endpoint: requestPath,
        raw: parsed,
      });
    }

    try {
      return unwrapBody(parsed) as T;
    } catch (err: any) {
      if (err instanceof WeexApiError) {
        throw new WeexApiError(err.message, {
          code: err.code,
          httpStatus: response.status,
          endpoint: requestPath,
          raw: parsed,
        });
      }
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // Public market endpoints
  // -------------------------------------------------------------------------
  public async serverTime(): Promise<number> {
    const data = await this.request<Record<string, unknown>>('GET', '/capi/v3/market/time');
    return toNumber(data?.serverTime, Date.now());
  }

  public async exchangeInfo(symbol?: string): Promise<unknown> {
    return this.request('GET', '/capi/v3/market/exchangeInfo', {
      query: { symbol },
    });
  }

  public async ticker24h(symbol?: string): Promise<WeexTicker[]> {
    const data = await this.request<unknown>('GET', '/capi/v3/market/ticker/24hr', {
      query: { symbol },
    });
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    return rows.map((row: any) => ({
      symbol: String(row.symbol || '').toUpperCase(),
      lastPrice: toNumber(row.lastPrice),
      priceChangePercent: toNumber(row.priceChangePercent),
      highPrice: toNumber(row.highPrice),
      lowPrice: toNumber(row.lowPrice),
      quoteVolume: toNumber(row.quoteVolume),
      markPrice: toNumber(row.markPrice),
      indexPrice: toNumber(row.indexPrice),
    }));
  }

  public async bestBidAsk(symbol?: string): Promise<
    Array<{ symbol: string; bidPrice: number; askPrice: number; time: number }>
  > {
    const data = await this.request<unknown>('GET', '/capi/v3/market/ticker/bookTicker', {
      query: { symbol },
    });
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    return rows.map((row: any) => ({
      symbol: String(row.symbol || '').toUpperCase(),
      bidPrice: toNumber(row.bidPrice),
      askPrice: toNumber(row.askPrice),
      time: toNumber(row.time, Date.now()),
    }));
  }

  public async depth(symbol: string, limit: 15 | 200 = 15): Promise<unknown> {
    return this.request('GET', '/capi/v3/market/depth', { query: { symbol, limit } });
  }

  public async klines(
    symbol: string,
    interval: '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '12h' | '1d' | '1w',
    limit = 100
  ): Promise<unknown[]> {
    const data = await this.request<unknown>('GET', '/capi/v3/market/klines', {
      query: { symbol, interval, limit },
    });
    return Array.isArray(data) ? data : [];
  }

  public async symbolPrice(
    symbol: string,
    priceType: 'INDEX' | 'MARK' = 'MARK'
  ): Promise<number> {
    const data = await this.request<Record<string, unknown>>('GET', '/capi/v3/market/symbolPrice', {
      query: { symbol, priceType },
    });
    return toNumber(data?.price);
  }

  public async premiumIndex(symbol?: string): Promise<unknown[]> {
    const data = await this.request<unknown>('GET', '/capi/v3/market/premiumIndex', {
      query: { symbol },
    });
    return Array.isArray(data) ? data : data ? [data] : [];
  }

  public async apiTradingSymbols(): Promise<string[]> {
    const data = await this.request<unknown>('GET', '/capi/v3/market/apiTradingSymbols');
    return Array.isArray(data) ? data.map((s) => String(s).toUpperCase()) : [];
  }

  /** Parses `/market/exchangeInfo` into a compact precision/rules map. */
  public async getSymbolRules(): Promise<Record<string, WeexSymbolRules>> {
    const data: any = await this.exchangeInfo();
    const symbols: any[] = Array.isArray(data?.symbols)
      ? data.symbols
      : Array.isArray(data)
        ? data
        : [];
    const out: Record<string, WeexSymbolRules> = {};
    for (const s of symbols) {
      const symbol = String(s.symbol || '').toUpperCase();
      if (!symbol) continue;
      out[symbol] = {
        symbol,
        baseAsset: String(s.baseAsset || ''),
        quoteAsset: String(s.quoteAsset || 'USDT'),
        pricePrecision: toNumber(s.pricePrecision, 2),
        quantityPrecision: toNumber(s.quantityPrecision, 3),
        minOrderSize: toNumber(s.minOrderSize, 0),
        contractVal: toNumber(s.contractVar ?? s.contractVal, 1),
        minLeverage: toNumber(s.minLeverage, 1),
        maxLeverage: toNumber(s.maxLeverage, 125),
        makerFeeRate: toNumber(s.makerFeeRate, 0.0002),
        takerFeeRate: toNumber(s.takerFeeRate, 0.0006),
        contractType: s.contractType ? String(s.contractType) : undefined,
      };
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Signed account endpoints
  // -------------------------------------------------------------------------
  public async balance(): Promise<WeexBalanceRow[]> {
    const data = await this.request<unknown>('GET', '/capi/v3/account/balance', { auth: true });
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    return rows.map((row: any) => ({
      asset: String(row.asset || ''),
      balance: toNumber(row.balance),
      availableBalance: toNumber(row.availableBalance),
      frozen: toNumber(row.frozen),
      unrealizePnl: toNumber(row.unrealizePnl),
    }));
  }

  public async accountConfig(): Promise<{
    canTrade: boolean;
    dualSidePosition: boolean;
    canDeposit: boolean;
    canWithdraw: boolean;
    updateTime?: number;
  }> {
    const data: any = await this.request('GET', '/capi/v3/account/accountConfig', { auth: true });
    return {
      canTrade: Boolean(data?.canTrade),
      dualSidePosition: Boolean(data?.dualSidePosition),
      canDeposit: Boolean(data?.canDeposit),
      canWithdraw: Boolean(data?.canWithdraw),
      updateTime: toNumber(data?.updateTime) || undefined,
    };
  }

  public async symbolConfig(symbol?: string): Promise<unknown[]> {
    const data = await this.request<unknown>('GET', '/capi/v3/account/symbolConfig', {
      auth: true,
      query: { symbol },
    });
    return Array.isArray(data) ? data : data ? [data] : [];
  }

  public async commissionRate(
    symbol: string
  ): Promise<{ maker: number; taker: number; apiMaker: number; apiTaker: number }> {
    const data: any = await this.request('GET', '/capi/v3/account/commissionRate', {
      auth: true,
      query: { symbol },
    });
    return {
      maker: toNumber(data?.makerCommissionRate),
      taker: toNumber(data?.takerCommissionRate),
      apiMaker: toNumber(data?.apiMakerCommissionRate),
      apiTaker: toNumber(data?.apiTakerCommissionRate),
    };
  }

  public async positions(): Promise<WeexExchangePosition[]> {
    const data = await this.request<unknown>('GET', '/capi/v3/account/position/allPosition', {
      auth: true,
    });
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    return rows
      .map((row: any) => {
        const size = toNumber(row.size);
        const rawSide = String(row.side || '').toUpperCase();
        // A signed size also identifies the direction on some WEEX responses.
        const side: 'LONG' | 'SHORT' = rawSide === 'SHORT' || size < 0 ? 'SHORT' : 'LONG';
        const openValue = toNumber(row.openValue);
        const absSize = Math.abs(size);
        return {
          id: row.id ?? row.positionId ?? '',
          symbol: String(row.symbol || '').toUpperCase(),
          side,
          size: absSize,
          entryPrice: absSize > 0 && openValue > 0 ? openValue / absSize : toNumber(row.entryPrice),
          leverage: toNumber(row.leverage, 1),
          unrealizedPnl: toNumber(row.unrealizePnl),
          marginType: row.marginType ? String(row.marginType) : undefined,
          liquidatePrice: toNumber(row.liquidatePrice),
          updatedTime: toNumber(row.updatedTime) || undefined,
          raw: row,
        };
      })
      .filter((p) => p.symbol && p.size > 0);
  }

  public async singlePosition(symbol: string): Promise<WeexExchangePosition[]> {
    const data = await this.request<unknown>('GET', '/capi/v3/account/position/singlePosition', {
      auth: true,
      query: { symbol },
    });
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    return rows
      .map((row: any) => {
        const size = Math.abs(toNumber(row.size));
        const rawSide = String(row.side || '').toUpperCase();
        const openValue = toNumber(row.openValue);
        return {
          id: row.id ?? row.positionId ?? '',
          symbol: String(row.symbol || '').toUpperCase(),
          side: (rawSide === 'SHORT' || toNumber(row.size) < 0 ? 'SHORT' : 'LONG') as
            | 'LONG'
            | 'SHORT',
          size,
          entryPrice: size > 0 && openValue > 0 ? openValue / size : toNumber(row.entryPrice),
          leverage: toNumber(row.leverage, 1),
          unrealizedPnl: toNumber(row.unrealizePnl),
          marginType: row.marginType ? String(row.marginType) : undefined,
          liquidatePrice: toNumber(row.liquidatePrice),
          updatedTime: toNumber(row.updatedTime) || undefined,
          raw: row,
        };
      })
      .filter((p) => p.size > 0);
  }

  public async income(params: {
    asset?: string;
    symbol?: string;
    incomeType?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Promise<unknown> {
    return this.request('POST', '/capi/v3/account/income', {
      auth: true,
      body: params as Record<string, unknown>,
    });
  }

  // -------------------------------------------------------------------------
  // Signed trading endpoints
  // -------------------------------------------------------------------------
  public async placeOrder(
    input: PlaceOrderInput
  ): Promise<{ orderId: string; clientOrderId?: string; success: boolean; errorCode?: string; errorMessage?: string }> {
    const body: Record<string, unknown> = {
      symbol: input.symbol,
      side: input.side,
      positionSide: input.positionSide,
      type: input.type,
      quantity: input.quantity,
      newClientOrderId: input.newClientOrderId,
    };
    if (input.type === 'LIMIT') {
      body.timeInForce = input.timeInForce || 'GTC';
      body.price = input.price;
    }
    if (input.tpTriggerPrice) body.tpTriggerPrice = input.tpTriggerPrice;
    if (input.slTriggerPrice) body.slTriggerPrice = input.slTriggerPrice;
    if (input.reduceOnly !== undefined) body.reduceOnly = input.reduceOnly;

    const data: any = await this.request('POST', '/capi/v3/order', { auth: true, body });
    return {
      orderId: String(data?.orderId ?? ''),
      clientOrderId: data?.clientOrderId ? String(data.clientOrderId) : undefined,
      success: data?.success !== false,
      errorCode: data?.errorCode ? String(data.errorCode) : undefined,
      errorMessage: data?.errorMessage ? String(data.errorMessage) : undefined,
    };
  }

  public async placeTpSlOrder(input: PlaceTpSlInput): Promise<{
    success: boolean;
    orderId: string;
    errorCode?: string;
    errorMessage?: string;
  }> {
    const body: Record<string, unknown> = {
      symbol: input.symbol,
      planType: input.planType,
      triggerPrice: input.triggerPrice,
      positionSide: input.positionSide,
      clientAlgoId: input.clientAlgoId,
      triggerPriceType: input.triggerPriceType || 'MARK_PRICE',
      closePosition: input.closePosition !== false,
    };
    if (input.quantity) body.quantity = input.quantity;
    if (input.executePrice) body.executePrice = input.executePrice;

    const data: any = await this.request('POST', '/capi/v3/placeTpSlOrder', { auth: true, body });
    return {
      success: data?.success !== false,
      orderId: String(data?.orderId ?? ''),
      errorCode: data?.errorCode ? String(data.errorCode) : undefined,
      errorMessage: data?.errorMessage ? String(data.errorMessage) : undefined,
    };
  }

  public async modifyTpSlOrder(input: {
    orderId: string | number;
    triggerPrice: string;
    executePrice?: string;
    triggerPriceType?: 'CONTRACT_PRICE' | 'MARK_PRICE';
  }): Promise<{ success: boolean }> {
    const data: any = await this.request('POST', '/capi/v3/modifyTpSlOrder', {
      auth: true,
      body: {
        orderId: input.orderId,
        triggerPrice: input.triggerPrice,
        executePrice: input.executePrice || '0',
        triggerPriceType: input.triggerPriceType || 'MARK_PRICE',
      },
    });
    return { success: data?.success !== false };
  }

  public async cancelOrder(params: {
    orderId?: string | number;
    origClientOrderId?: string;
  }): Promise<{ success: boolean; orderId?: string }> {
    const data: any = await this.request('DELETE', '/capi/v3/order', {
      auth: true,
      query: {
        orderId: params.orderId,
        origClientOrderId: params.origClientOrderId,
      },
    });
    return { success: data?.success !== false, orderId: data?.orderId ? String(data.orderId) : undefined };
  }

  public async cancelAllOpenOrders(symbol?: string): Promise<unknown> {
    return this.request('DELETE', '/capi/v3/allOpenOrders', {
      auth: true,
      query: { symbol },
    });
  }

  public async closePositions(params: {
    symbol?: string;
    positionId?: string | number;
  }): Promise<Array<{ positionId: string; success: boolean; successOrderId?: string; errorMessage?: string }>> {
    const data = await this.request<unknown>('POST', '/capi/v3/closePositions', {
      auth: true,
      body: {
        symbol: params.symbol,
        positionId: params.positionId,
      } as Record<string, unknown>,
    });
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    return rows.map((row: any) => ({
      positionId: String(row.positionId ?? ''),
      success: row.success !== false,
      successOrderId: row.successOrderId ? String(row.successOrderId) : undefined,
      errorMessage: row.errorMessage ? String(row.errorMessage) : undefined,
    }));
  }

  public async getOrder(orderId: string | number): Promise<WeexOrderInfo> {
    const data: any = await this.request('GET', '/capi/v3/order', {
      auth: true,
      query: { orderId },
    });
    return {
      orderId: data?.orderId ?? orderId,
      clientOrderId: data?.clientOrderId ? String(data.clientOrderId) : undefined,
      symbol: String(data?.symbol || '').toUpperCase(),
      side: String(data?.side || 'BUY').toUpperCase() as WeexOrderSide,
      positionSide: String(data?.positionSide || 'LONG').toUpperCase() as WeexPositionSide,
      type: String(data?.type || 'MARKET').toUpperCase() as WeexOrderType,
      status: String(data?.status || '').toUpperCase(),
      price: String(data?.price ?? '0'),
      avgPrice: String(data?.avgPrice ?? '0'),
      origQty: String(data?.origQty ?? '0'),
      executedQty: String(data?.executedQty ?? '0'),
      cumQuote: data?.cumQuote !== undefined ? String(data.cumQuote) : undefined,
      reduceOnly: Boolean(data?.reduceOnly),
      time: toNumber(data?.time) || undefined,
      updateTime: toNumber(data?.updateTime) || undefined,
      raw: data || {},
    };
  }

  public async openOrders(symbol?: string): Promise<WeexOrderInfo[]> {
    const data = await this.request<unknown>('GET', '/capi/v3/openOrders', {
      auth: true,
      query: { symbol },
    });
    return (Array.isArray(data) ? data : data ? [data] : []).map((row: any) =>
      this.mapOrder(row)
    );
  }

  public async orderHistory(params: {
    symbol?: string;
    limit?: number;
    startTime?: number;
    endTime?: number;
  } = {}): Promise<WeexOrderInfo[]> {
    const data = await this.request<unknown>('GET', '/capi/v3/order/history', {
      auth: true,
      query: {
        symbol: params.symbol,
        limit: params.limit ?? 100,
        startTime: params.startTime,
        endTime: params.endTime,
      },
    });
    return (Array.isArray(data) ? data : data ? [data] : []).map((row: any) =>
      this.mapOrder(row)
    );
  }

  public async openAlgoOrders(symbol?: string): Promise<unknown[]> {
    const data = await this.request<unknown>('GET', '/capi/v3/openAlgoOrders', {
      auth: true,
      query: { symbol, limit: 100 },
    });
    return Array.isArray(data) ? data : data ? [data] : [];
  }

  public async cancelAlgoOrders(symbol?: string): Promise<unknown> {
    return this.request('DELETE', '/capi/v3/algoOpenOrders', {
      auth: true,
      query: { symbol },
    });
  }

  public async userTrades(params: {
    symbol?: string;
    orderId?: string | number;
    limit?: number;
    startTime?: number;
    endTime?: number;
  } = {}): Promise<WeexTradeRow[]> {
    const data = await this.request<unknown>('GET', '/capi/v3/userTrades', {
      auth: true,
      query: {
        symbol: params.symbol,
        orderId: params.orderId,
        limit: params.limit ?? 100,
        startTime: params.startTime,
        endTime: params.endTime,
      },
    });
    return (Array.isArray(data) ? data : data ? [data] : []).map((row: any) => ({
      id: row.id ?? '',
      orderId: row.orderId ?? '',
      symbol: String(row.symbol || '').toUpperCase(),
      side: String(row.side || 'BUY').toUpperCase() as WeexOrderSide,
      positionSide: String(row.positionSide || 'LONG').toUpperCase() as WeexPositionSide,
      price: String(row.price ?? '0'),
      qty: String(row.qty ?? '0'),
      quoteQty: String(row.quoteQty ?? '0'),
      realizedPnl: String(row.realizedPnl ?? '0'),
      commission: String(row.commission ?? '0'),
      commissionAsset: String(row.commissionAsset ?? ''),
      time: toNumber(row.time),
      raw: row,
    }));
  }

  private mapOrder(row: any): WeexOrderInfo {
    return {
      orderId: row?.orderId ?? '',
      clientOrderId: row?.clientOrderId ? String(row.clientOrderId) : undefined,
      symbol: String(row?.symbol || '').toUpperCase(),
      side: String(row?.side || 'BUY').toUpperCase() as WeexOrderSide,
      positionSide: String(row?.positionSide || 'LONG').toUpperCase() as WeexPositionSide,
      type: String(row?.type || 'MARKET').toUpperCase() as WeexOrderType,
      status: String(row?.status || '').toUpperCase(),
      price: String(row?.price ?? '0'),
      avgPrice: String(row?.avgPrice ?? '0'),
      origQty: String(row?.origQty ?? '0'),
      executedQty: String(row?.executedQty ?? '0'),
      cumQuote: row?.cumQuote !== undefined ? String(row.cumQuote) : undefined,
      reduceOnly: Boolean(row?.reduceOnly),
      time: toNumber(row?.time) || undefined,
      updateTime: toNumber(row?.updateTime) || undefined,
      raw: row || {},
    };
  }
}
