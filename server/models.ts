import mongoose, { Schema, Document } from 'mongoose';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

// ============================================================================
// 1. Mongoose Schemas & Models (Real MongoDB ODM)
// ============================================================================

export interface IAdminUser {
  _id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: string;
  createdAt: string;
}

export interface ICryptoSymbol {
  _id: string;
  symbol: string;       // e.g. "BTCUSDT"
  baseAsset: string;    // e.g. "BTC"
  quoteAsset: string;   // e.g. "USDT"
  label: string;        // e.g. "بیت‌کوین (Bitcoin)"
  addedBy?: string;
  createdAt: string;
}

export interface ITelegramConfig {
  _id: string;
  botToken: string;
  botId?: number;
  botUsername?: string;
  botFirstName?: string;
  isPollingActive: boolean;
  lastUpdateId: number;
  lastPollAt?: string;
  lastError?: string;
  updatedAt: string;
}

export interface ITelegramMessage {
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

export interface IAvalAIConfig {
  _id: string;
  apiKey: string;
  baseUrl: string;
  modelName: string;
  systemPrompt: string;
  temperature: number;
  lastTestStatus?: 'success' | 'error' | 'untested';
  lastTestMessage?: string;
  lastTestLatencyMs?: number;
  lastTestedAt?: string;
  updatedAt: string;
}

export interface ISignalMethodItem {
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

export interface IRegisteredSignal {
  _id: string;
  symbol: string;
  label: string;
  interval: string; // '15m'
  consensusDirection: 'LONG' | 'SHORT' | 'NO TRADE'; // خرید | فروش | بدون توافق
  isQualified: boolean; // true when matchedSignalsCount >= 3
  buySignalsCount: number;
  sellSignalsCount: number;
  totalSignalsChecked: number;
  matchedSignalsCount: number; // >= 3 => qualified
  currentPrice: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  riskRewardRatio: string;
  averageScore: number;
  signalsBreakdown: ISignalMethodItem[];
  chatGptStatus: string;
  chatGptDirection: 'LONG' | 'SHORT' | 'NO TRADE';
  chatGptSetupName: string;
  chatGptReasoning: string;
  aiEngineUsed: string;
  /** true when a real ChatGPT verdict counted as a vote */
  aiVoteCounted?: boolean;
  /** direction voted by the independent single-method Al Brooks signal */
  singleMethodDirection?: string;
  /** how many agreeing methods were averaged into the order levels (0 = fallback) */
  levelsAveragedFrom?: number;
  cycleNumber: number;
  createdAt: string;
  /** true when this qualified signal was pushed straight to the trade engine */
  dispatchedToTrade?: boolean;
  /** outcome of the trade hand-off (Persian message) */
  tradeDispatchNote?: string;
  /** CREATED | BREAKOUT_REJECTED | SYMBOL_ACTIVE_OR_NO_MARGIN | ... */
  tradeStatus?: string;
  tradeDispatchedAt?: string;
}

// ============================================================================
// Virtual Demo Trading Account & Positions
// ============================================================================
export interface ITradeAccount {
  _id: string;
  userId: string;
  initialBalance: number; // 100 USD virtual
  balance: number; // realized cash
  leverage: number; // 5x
  marginPerTradePct: number; // % of balance locked as margin per position
  createdAt: string;
  updatedAt: string;
}

export interface IPositionFill {
  type: 'OPEN' | 'PARTIAL_CLOSE' | 'CLOSE';
  price: number;
  quantity: number;
  pnl: number;
  note: string;
  at: string;
}

export interface IPosition {
  _id: string;
  userId: string;
  signalId: string;
  symbol: string;
  label: string;
  side: 'LONG' | 'SHORT';
  leverage: number;
  status: 'PENDING' | 'OPEN' | 'CLOSED';
  triggerAbove: boolean; // wait for price to rise (true) or fall (false) to entryTarget
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
  fills: IPositionFill[];
  createdAt: string;
  openedAt: string | null;
  closedAt: string | null;
  updatedAt: string;
}

// ============================================================================
// WEEX Trading (virtual/paper + live exchange) Models
// ============================================================================
export interface IWeexFill {
  type: 'OPEN' | 'PARTIAL_CLOSE' | 'CLOSE';
  price: number;
  quantity: number;
  pnl: number;
  fee: number;
  note: string;
  at: string;
}

export interface IWeexSettings {
  _id: string;
  userId: string;
  /** paper = simulated fills on WEEX prices, live = real orders on the exchange */
  mode: 'paper' | 'live';
  environment: 'production' | 'simulation';
  apiKey: string;
  apiSecret: string;
  passphrase: string;
  leverage: number;
  marginPerTradePct: number;
  /** % of the position closed at TP1 (rest runs to TP2 / SL) */
  tp1ClosePct: number;
  /** automatically mirror every approved (qualified) signal */
  autoTrade: boolean;
  /** only take pullback entries (skip breakouts), same rule as the demo engine */
  pullbackOnly: boolean;
  /** taker fee percentage used by the paper engine (0.05 = 0.05%) */
  feeRatePct: number;
  paperInitialBalance: number;
  paperBalance: number;
  lastTestStatus: 'success' | 'error' | 'untested';
  lastTestMessage: string;
  lastTestAt?: string;
  updatedAt: string;
}

export interface IWeexPosition {
  _id: string;
  userId: string;
  mode: 'paper' | 'live';
  signalId: string;
  symbol: string;
  label: string;
  side: 'LONG' | 'SHORT';
  status: 'PENDING' | 'OPEN' | 'CLOSED';
  orderType: 'MARKET' | 'LIMIT';
  /** pending LIMIT waits for the price to rise (true) or fall (false) to entryTarget */
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
  leverage: number;
  realizedPnl: number;
  feePaid: number;
  tp1Hit: boolean;
  closeReason: string;
  signalCycleNumber: number;
  aiEngineUsed: string;
  averageScore: number;
  fills: IWeexFill[];
  exchangeOrderId: string;
  exchangeTp1OrderId: string;
  exchangeTp2OrderId: string;
  exchangeSlOrderId: string;
  exchangePositionId: string;
  lastPrice: number;
  note: string;
  createdAt: string;
  openedAt: string | null;
  closedAt: string | null;
  updatedAt: string;
}

const WeexSettingsSchema = new Schema<IWeexSettings & Document>({
  userId: { type: String, required: true, unique: true, index: true },
  mode: { type: String, enum: ['paper', 'live'], default: 'paper' },
  environment: { type: String, enum: ['production', 'simulation'], default: 'production' },
  apiKey: { type: String, default: '' },
  apiSecret: { type: String, default: '' },
  passphrase: { type: String, default: '' },
  leverage: { type: Number, default: 5 },
  marginPerTradePct: { type: Number, default: 10 },
  tp1ClosePct: { type: Number, default: 50 },
  autoTrade: { type: Boolean, default: false },
  pullbackOnly: { type: Boolean, default: true },
  feeRatePct: { type: Number, default: 0.05 },
  paperInitialBalance: { type: Number, default: 1000 },
  paperBalance: { type: Number, default: 1000 },
  lastTestStatus: { type: String, default: 'untested' },
  lastTestMessage: { type: String, default: '' },
  lastTestAt: { type: String, default: null },
  updatedAt: { type: String, default: () => new Date().toISOString() },
});

const WeexPositionSchema = new Schema<IWeexPosition & Document>({
  userId: { type: String, required: true, index: true },
  mode: { type: String, enum: ['paper', 'live'], default: 'paper', index: true },
  signalId: { type: String, default: '' },
  symbol: { type: String, required: true, index: true },
  label: { type: String, default: '' },
  side: { type: String, enum: ['LONG', 'SHORT'], required: true },
  status: { type: String, enum: ['PENDING', 'OPEN', 'CLOSED'], default: 'PENDING', index: true },
  orderType: { type: String, enum: ['MARKET', 'LIMIT'], default: 'MARKET' },
  triggerAbove: { type: Boolean, default: false },
  entryTarget: { type: Number, default: 0 },
  entryPrice: { type: Number, default: 0 },
  stopLoss: { type: Number, default: 0 },
  takeProfit1: { type: Number, default: 0 },
  takeProfit2: { type: Number, default: 0 },
  quantity: { type: Number, default: 0 },
  remainingQuantity: { type: Number, default: 0 },
  notional: { type: Number, default: 0 },
  margin: { type: Number, default: 0 },
  leverage: { type: Number, default: 5 },
  realizedPnl: { type: Number, default: 0 },
  feePaid: { type: Number, default: 0 },
  tp1Hit: { type: Boolean, default: false },
  closeReason: { type: String, default: '' },
  signalCycleNumber: { type: Number, default: 0 },
  aiEngineUsed: { type: String, default: '' },
  averageScore: { type: Number, default: 0 },
  fills: { type: Schema.Types.Mixed, default: [] },
  exchangeOrderId: { type: String, default: '' },
  exchangeTp1OrderId: { type: String, default: '' },
  exchangeTp2OrderId: { type: String, default: '' },
  exchangeSlOrderId: { type: String, default: '' },
  exchangePositionId: { type: String, default: '' },
  lastPrice: { type: Number, default: 0 },
  note: { type: String, default: '' },
  createdAt: { type: String, default: () => new Date().toISOString() },
  openedAt: { type: String, default: null },
  closedAt: { type: String, default: null },
  updatedAt: { type: String, default: () => new Date().toISOString() },
});

export const WeexSettingsModel =
  mongoose.models.WeexSettings ||
  mongoose.model<IWeexSettings & Document>('WeexSettings', WeexSettingsSchema);

export const WeexPositionModel =
  mongoose.models.WeexPosition ||
  mongoose.model<IWeexPosition & Document>('WeexPosition', WeexPositionSchema);

const TradeAccountSchema = new Schema<ITradeAccount & Document>({
  userId: { type: String, required: true, unique: true, index: true },
  initialBalance: { type: Number, default: 100 },
  balance: { type: Number, default: 100 },
  leverage: { type: Number, default: 5 },
  marginPerTradePct: { type: Number, default: 20 },
  createdAt: { type: String, default: () => new Date().toISOString() },
  updatedAt: { type: String, default: () => new Date().toISOString() },
});

const PositionSchema = new Schema<IPosition & Document>({
  userId: { type: String, required: true, index: true },
  signalId: { type: String, required: true, index: true },
  symbol: { type: String, required: true, index: true },
  label: { type: String, default: '' },
  side: { type: String, enum: ['LONG', 'SHORT'], required: true },
  leverage: { type: Number, default: 5 },
  status: { type: String, enum: ['PENDING', 'OPEN', 'CLOSED'], default: 'PENDING', index: true },
  triggerAbove: { type: Boolean, default: false },
  entryTarget: { type: Number, required: true },
  entryPrice: { type: Number, default: 0 },
  stopLoss: { type: Number, default: 0 },
  takeProfit1: { type: Number, default: 0 },
  takeProfit2: { type: Number, default: 0 },
  quantity: { type: Number, default: 0 },
  remainingQuantity: { type: Number, default: 0 },
  notional: { type: Number, default: 0 },
  margin: { type: Number, default: 0 },
  realizedPnl: { type: Number, default: 0 },
  tp1Hit: { type: Boolean, default: false },
  closeReason: { type: String, default: '' },
  signalCycleNumber: { type: Number, default: 0 },
  aiEngineUsed: { type: String, default: '' },
  averageScore: { type: Number, default: 0 },
  fills: { type: Schema.Types.Mixed, default: [] },
  createdAt: { type: String, default: () => new Date().toISOString() },
  openedAt: { type: String, default: null },
  closedAt: { type: String, default: null },
  updatedAt: { type: String, default: () => new Date().toISOString() },
});

export const TradeAccountModel =
  mongoose.models.TradeAccount ||
  mongoose.model<ITradeAccount & Document>('TradeAccount', TradeAccountSchema);

export const PositionModel =
  mongoose.models.Position ||
  mongoose.model<IPosition & Document>('Position', PositionSchema);

const AdminUserSchema = new Schema<IAdminUser & Document>({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, default: 'مدیر ارشد (Super Admin)' },
  createdAt: { type: String, default: () => new Date().toISOString() },
});

const CryptoSymbolSchema = new Schema<ICryptoSymbol & Document>({
  symbol: { type: String, required: true, unique: true, uppercase: true, trim: true },
  baseAsset: { type: String, required: true, uppercase: true, trim: true },
  quoteAsset: { type: String, required: true, uppercase: true, trim: true },
  label: { type: String, required: true },
  addedBy: { type: String, default: 'system' },
  createdAt: { type: String, default: () => new Date().toISOString() },
});

const TelegramConfigSchema = new Schema<ITelegramConfig & Document>({
  botToken: { type: String, default: '' },
  botId: { type: Number },
  botUsername: { type: String, default: '' },
  botFirstName: { type: String, default: '' },
  isPollingActive: { type: Boolean, default: false },
  lastUpdateId: { type: Number, default: 0 },
  lastPollAt: { type: String },
  lastError: { type: String, default: '' },
  updatedAt: { type: String, default: () => new Date().toISOString() },
});

const TelegramMessageSchema = new Schema<ITelegramMessage & Document>({
  updateId: { type: Number },
  chatId: { type: String, required: true, index: true },
  chatType: { type: String, default: 'private' },
  senderUsername: { type: String, default: '' },
  senderFirstName: { type: String, default: 'کاربر تلگرام' },
  senderLastName: { type: String, default: '' },
  text: { type: String, required: true },
  direction: { type: String, enum: ['incoming', 'outgoing'], required: true },
  isRead: { type: Boolean, default: false },
  createdAt: { type: String, default: () => new Date().toISOString() },
});

const AvalAIConfigSchema = new Schema<IAvalAIConfig & Document>({
  apiKey: { type: String, default: 'aa-u0S6Ls0H00KMvWJrthbwwYMWRUzmtCCL8R1IKXK6W2KepJTw' },
  baseUrl: { type: String, default: 'https://api.avalai.ir/v1' },
  modelName: { type: String, default: 'gpt-6-luna' },
  systemPrompt: {
    type: String,
    default: 'شما دستیار هوشمند پنل مدیریت ارزهای دیجیتال و تلگرام هستید و به زبان فارسی پاسخ‌های دقیق و کاربردی می‌دهید.',
  },
  temperature: { type: Number, default: 0.7 },
  lastTestStatus: { type: String, default: 'untested' },
  lastTestMessage: { type: String, default: '' },
  lastTestLatencyMs: { type: Number },
  lastTestedAt: { type: String },
  updatedAt: { type: String, default: () => new Date().toISOString() },
});

export const AdminUserModel = mongoose.models.AdminUser || mongoose.model<IAdminUser & Document>('AdminUser', AdminUserSchema);
export const CryptoSymbolModel = mongoose.models.CryptoSymbol || mongoose.model<ICryptoSymbol & Document>('CryptoSymbol', CryptoSymbolSchema);
export const TelegramConfigModel = mongoose.models.TelegramConfig || mongoose.model<ITelegramConfig & Document>('TelegramConfig', TelegramConfigSchema);
export const TelegramMessageModel = mongoose.models.TelegramMessage || mongoose.model<ITelegramMessage & Document>('TelegramMessage', TelegramMessageSchema);
export const AvalAIConfigModel = mongoose.models.AvalAIConfig || mongoose.model<IAvalAIConfig & Document>('AvalAIConfig', AvalAIConfigSchema);

const RegisteredSignalSchema = new Schema<IRegisteredSignal & Document>({
  symbol: { type: String, required: true, index: true },
  label: { type: String, required: true },
  interval: { type: String, default: '15m' },
  consensusDirection: { type: String, enum: ['LONG', 'SHORT', 'NO TRADE'], required: true },
  isQualified: { type: Boolean, default: false, index: true },
  buySignalsCount: { type: Number, required: true },
  sellSignalsCount: { type: Number, required: true },
  totalSignalsChecked: { type: Number, required: true },
  matchedSignalsCount: { type: Number, required: true },
  currentPrice: { type: Number, required: true },
  entryPrice: { type: Number, required: true },
  stopLoss: { type: Number, required: true },
  takeProfit1: { type: Number, required: true },
  takeProfit2: { type: Number, required: true },
  riskRewardRatio: { type: String, default: '1 : 2.0' },
  averageScore: { type: Number, default: 0 },
  signalsBreakdown: { type: Schema.Types.Mixed, default: [] },
  chatGptStatus: { type: String, default: '' },
  chatGptDirection: { type: String, default: 'NO TRADE' },
  chatGptSetupName: { type: String, default: '' },
  chatGptReasoning: { type: String, default: '' },
  aiEngineUsed: { type: String, default: '' },
  aiVoteCounted: { type: Boolean, default: false },
  singleMethodDirection: { type: String, default: '' },
  levelsAveragedFrom: { type: Number, default: 0 },
  cycleNumber: { type: Number, default: 1 },
  createdAt: { type: String, default: () => new Date().toISOString() },
  dispatchedToTrade: { type: Boolean, default: false },
  tradeDispatchNote: { type: String, default: '' },
  tradeStatus: { type: String, default: '' },
  tradeDispatchedAt: { type: String, default: '' },
});

export const RegisteredSignalModel =
  mongoose.models.RegisteredSignal ||
  mongoose.model<IRegisteredSignal & Document>('RegisteredSignal', RegisteredSignalSchema);

// ============================================================================
// 2. Persistent Disk Mirror + Live Mongoose Connection Manager
// ============================================================================

export type WipeScope = 'signals' | 'demo' | 'weex' | 'telegram' | 'symbols';

export interface WipeDatabaseOptions {
  scopes?: WipeScope[];
  /** delete every admin account EXCEPT `keepAdminEmail` */
  includeAdmins?: boolean;
  keepAdminEmail?: string;
  /** snapshot the local mirror to data/backups before deleting (default true) */
  backup?: boolean;
}

export interface WipeDatabaseResult {
  ok: boolean;
  backupFile: string;
  scopes: WipeScope[];
  mongoDeleted: Record<string, number>;
  diskCleared: Record<string, number>;
  adminDeleted: number;
  message: string;
}

interface PersistentStoreData {
  mongoUri: string;
  users: IAdminUser[];
  symbols: ICryptoSymbol[];
  telegramConfig: ITelegramConfig | null;
  telegramMessages: ITelegramMessage[];
  avalaiConfig?: IAvalAIConfig | null;
  registeredSignals?: IRegisteredSignal[];
  tradeAccounts?: ITradeAccount[];
  positions?: IPosition[];
  weexSettings?: IWeexSettings[];
  weexPositions?: IWeexPosition[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'mongodb_collections.json');
/**
 * How many registered signals are kept and returned. The old hard-coded 1200
 * silently hid everything older, so the table looked "stuck" at 1200 no matter
 * how many cycles had run.
 */
const SIGNAL_STORE_LIMIT = Math.max(100, Number(process.env.SIGNAL_STORE_LIMIT || 20000));;

const DEFAULT_SYMBOLS: Omit<ICryptoSymbol, '_id' | 'createdAt'>[] = [
  { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', label: 'بیت‌کوین (Bitcoin)' },
  { symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT', label: 'اتریوم (Ethereum)' },
  { symbol: 'BNBUSDT', baseAsset: 'BNB', quoteAsset: 'USDT', label: 'بایننس کوین (BNB)' },
  { symbol: 'SOLUSDT', baseAsset: 'SOL', quoteAsset: 'USDT', label: 'سولانا (Solana)' },
  { symbol: 'XRPUSDT', baseAsset: 'XRP', quoteAsset: 'USDT', label: 'ریپل (Ripple)' },
  { symbol: 'ADAUSDT', baseAsset: 'ADA', quoteAsset: 'USDT', label: 'کاردانو (Cardano)' },
];

function generateObjectId(): string {
  return new mongoose.Types.ObjectId().toString();
}

class DatabaseEngine {
  private store: PersistentStoreData;
  private isMongoConnected = false;
  /** stale-id -> current-id pairs already migrated in this process */
  private rekeyAttempted = new Set<string>();
  private lastConnectionError = '';
  private activeUri = '';
  /** true while THIS process intentionally closes the connection */
  private manualDisconnect = false;
  /** serializes every connect attempt so two callers can never fight over the driver */
  private connectChain: Promise<unknown> = Promise.resolve();
  private lastConnectedAt: string | null = null;
  private lastDisconnectAt: string | null = null;
  private lastDisconnectReason = '';
  private lastPingAt: string | null = null;
  private lastConnectAttemptAt: number = 0;
  private reconnectCount = 0;
  private disconnectCount = 0;
  private listenersBound = false;

  constructor() {
    this.store = this.loadDiskStore();
    this.bindMongoEvents();
  }

  /**
   * Mongoose reports drops/reconnects through connection events. Without these
   * listeners `isMongoConnected` stayed true after a drop (and false after an
   * automatic recovery), so the panel reported a stale state and no Redis-style
   * retry was ever triggered.
   */
  private bindMongoEvents(): void {
    if (this.listenersBound) return;
    this.listenersBound = true;
    const conn = mongoose.connection;

    conn.on('connected', () => {
      this.isMongoConnected = true;
      this.lastConnectionError = '';
      this.lastConnectedAt = new Date().toISOString();
      console.log('[db] MongoDB connected.');
    });

    conn.on('disconnected', () => {
      const wasConnected = this.isMongoConnected;
      this.isMongoConnected = false;
      if (!this.manualDisconnect && wasConnected) {
        this.disconnectCount += 1;
        this.lastDisconnectAt = new Date().toISOString();
        this.lastDisconnectReason = 'ارتباط با سرور MongoDB قطع شد (شبکه یا سرور)';
        console.warn('[db] MongoDB disconnected — waiting for the driver to reconnect.');
      }
    });

    conn.on('reconnected', () => {
      this.isMongoConnected = true;
      this.lastConnectionError = '';
      this.reconnectCount += 1;
      this.lastConnectedAt = new Date().toISOString();
      console.log('[db] MongoDB reconnected.');
    });

    conn.on('error', (err: any) => {
      // Keep the actionable message produced by connectMongo(); the driver's
      // raw error event arrives afterwards and used to overwrite it.
      if (this.manualDisconnect) return;
      this.lastConnectionError = this.explainMongoError(err);
      console.error('[db] MongoDB connection error:', this.lastConnectionError);
    });

    conn.on('close', () => {
      if (!this.manualDisconnect) {
        this.isMongoConnected = false;
        console.warn('[db] MongoDB connection closed.');
      }
    });
  }

  private loadDiskStore(): PersistentStoreData {
    const now = new Date().toISOString();
    const defaultAdminHash = bcrypt.hashSync('232111Eee@', 10);

    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(STORE_PATH)) {
        const raw = fs.readFileSync(STORE_PATH, 'utf-8');
        const parsed = JSON.parse(raw) as PersistentStoreData;
        const usersList = Array.isArray(parsed.users) ? parsed.users : [];

        // Ensure default admin 'ehsan' exists with the requested password
        const ehsanIdx = usersList.findIndex(
          (u) => u.email.toLowerCase() === 'ehsan' || u.name.toLowerCase() === 'ehsan'
        );
        if (ehsanIdx === -1) {
          usersList.unshift({
            _id: generateObjectId(),
            name: 'ehsan',
            email: 'ehsan',
            passwordHash: defaultAdminHash,
            role: 'مدیر ارشد (Super Admin)',
            createdAt: now,
          });
        } else {
          usersList[ehsanIdx].email = 'ehsan';
          usersList[ehsanIdx].name = 'ehsan';
          usersList[ehsanIdx].passwordHash = defaultAdminHash;
        }

        const updatedStore: PersistentStoreData = {
          mongoUri: parsed.mongoUri || process.env.MONGODB_URI || '',
          users: usersList,
          symbols: Array.isArray(parsed.symbols) ? parsed.symbols : [],
          telegramConfig: parsed.telegramConfig || null,
          telegramMessages: Array.isArray(parsed.telegramMessages) ? parsed.telegramMessages : [],
          avalaiConfig: parsed.avalaiConfig || {
            _id: generateObjectId(),
            apiKey: 'aa-u0S6Ls0H00KMvWJrthbwwYMWRUzmtCCL8R1IKXK6W2KepJTw',
            baseUrl: 'https://api.avalai.ir/v1',
            modelName: 'gpt-6-luna',
            systemPrompt: 'شما دستیار هوشمند پنل مدیریت ارزهای دیجیتال و تلگرام هستید و به زبان فارسی پاسخ‌های دقیق و کاربردی می‌دهید.',
            temperature: 0.7,
            lastTestStatus: 'untested',
            lastTestMessage: '',
            updatedAt: now,
          },
          registeredSignals: Array.isArray(parsed.registeredSignals) ? parsed.registeredSignals : [],
          tradeAccounts: Array.isArray(parsed.tradeAccounts) ? parsed.tradeAccounts : [],
          positions: Array.isArray(parsed.positions) ? parsed.positions : [],
          weexSettings: Array.isArray(parsed.weexSettings) ? parsed.weexSettings : [],
          weexPositions: Array.isArray(parsed.weexPositions) ? parsed.weexPositions : [],
        };
        if (updatedStore.avalaiConfig && (!updatedStore.avalaiConfig.apiKey || updatedStore.avalaiConfig.apiKey === '')) {
          updatedStore.avalaiConfig.apiKey = 'aa-u0S6Ls0H00KMvWJrthbwwYMWRUzmtCCL8R1IKXK6W2KepJTw';
        }
        if (updatedStore.avalaiConfig && (!updatedStore.avalaiConfig.modelName || updatedStore.avalaiConfig.modelName === 'gpt-4o-mini')) {
          updatedStore.avalaiConfig.modelName = 'gpt-6-luna';
        }
        this.saveDiskStore(updatedStore);
        return updatedStore;
      }
    } catch (err) {
      console.error('Error loading disk store:', err);
    }

    const initialStore: PersistentStoreData = {
      mongoUri: process.env.MONGODB_URI || '',
      users: [
        {
          _id: generateObjectId(),
          name: 'ehsan',
          email: 'ehsan',
          passwordHash: defaultAdminHash,
          role: 'مدیر ارشد (Super Admin)',
          createdAt: now,
        },
      ],
      symbols: DEFAULT_SYMBOLS.map((s) => ({
        ...s,
        _id: generateObjectId(),
        addedBy: 'system',
        createdAt: now,
      })),
      telegramConfig: {
        _id: generateObjectId(),
        botToken: process.env.TELEGRAM_BOT_TOKEN || '',
        botUsername: '',
        botFirstName: '',
        isPollingActive: Boolean(process.env.TELEGRAM_BOT_TOKEN),
        lastUpdateId: 0,
        updatedAt: now,
      },
      telegramMessages: [],
      avalaiConfig: {
        _id: generateObjectId(),
        apiKey: 'aa-u0S6Ls0H00KMvWJrthbwwYMWRUzmtCCL8R1IKXK6W2KepJTw',
        baseUrl: 'https://api.avalai.ir/v1',
        modelName: 'gpt-6-luna',
        systemPrompt: 'شما دستیار هوشمند پنل مدیریت ارزهای دیجیتال و تلگرام هستید و به زبان فارسی پاسخ‌های دقیق و کاربردی می‌دهید.',
        temperature: 0.7,
        lastTestStatus: 'untested',
        lastTestMessage: '',
        updatedAt: now,
      },
      registeredSignals: [],
      tradeAccounts: [],
      positions: [],
      weexSettings: [],
      weexPositions: [],
    };
    this.saveDiskStore(initialStore);
    return initialStore;
  }

  private saveDiskStore(data: PersistentStoreData = this.store): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Error writing disk store:', err);
    }
  }

  /**
   * Public entry point. Every call is serialized through `connectChain`, so the
   * boot retry, a manual panel save and an auto-recovery can never disconnect
   * each other's working connection (which is what made the panel flap between
   * "connected" and "disconnected").
   */
  public connectMongo(customUri?: string): Promise<{
    connected: boolean;
    mode: 'mongodb_remote' | 'mongodb_local_engine';
    uri: string;
    error?: string;
  }> {
    const run = () => this.connectMongoInternal(customUri);
    const next = this.connectChain.then(run, run);
    // keep the chain alive even when one attempt rejects
    this.connectChain = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  private async connectMongoInternal(customUri?: string): Promise<{
    connected: boolean;
    mode: 'mongodb_remote' | 'mongodb_local_engine';
    uri: string;
    error?: string;
  }> {
    const envUri = (process.env.MONGODB_URI || '').trim();
    const storedUri = (this.store.mongoUri || '').trim();
    let targetUri = (customUri !== undefined ? String(customUri) : storedUri || envUri).trim();

    if (customUri !== undefined) {
      this.store.mongoUri = targetUri;
      this.saveDiskStore();
    }

    if (!targetUri || targetUri === 'MY_MONGODB_URI') {
      // An empty panel value must not wipe a working MONGODB_URI env config.
      if (customUri !== undefined && envUri && envUri !== 'MY_MONGODB_URI') {
        targetUri = envUri;
        this.store.mongoUri = envUri;
        this.saveDiskStore();
      } else {
        this.isMongoConnected = false;
        this.activeUri = 'mongodb://local-persistent-engine:27017/crypto_telegram_admin';
        return {
          connected: true,
          mode: 'mongodb_local_engine',
          uri: this.activeUri,
        };
      }
    }

    this.lastConnectAttemptAt = Date.now();
    const uriChanged = Boolean(this.activeUri) && this.activeUri !== targetUri;

    // A healthy connection to the SAME URI is reused instead of being torn down.
    if (!uriChanged && mongoose.connection.readyState === 1 && this.isMongoConnected) {
      return {
        connected: true,
        mode: 'mongodb_remote',
        uri: this.maskMongoUri(targetUri),
      };
    }

    // If the driver is already opening THIS uri, just wait for it.
    if (!uriChanged && mongoose.connection.readyState === 2) {
      try {
        await mongoose.connection.asPromise();
      } catch {
        /* handled below by the explicit connect */
      }
      if ((mongoose.connection.readyState as number) === 1) {
        this.isMongoConnected = true;
        this.activeUri = targetUri;
        return {
          connected: true,
          mode: 'mongodb_remote',
          uri: this.maskMongoUri(targetUri),
        };
      }
    }

    try {
      if (mongoose.connection.readyState !== 0) {
        this.manualDisconnect = true;
        try {
          await mongoose.disconnect();
        } finally {
          this.manualDisconnect = false;
        }
      }
      this.isMongoConnected = false;

      await mongoose.connect(targetUri, this.mongoConnectOptions(targetUri));
      this.isMongoConnected = true;
      this.activeUri = targetUri;
      this.lastConnectionError = '';
      this.lastConnectedAt = new Date().toISOString();

      // Synchronize initial disk collections to remote MongoDB if remote is
      // empty. Never let a slow sync fail (or block) the connect response.
      try {
        await this.syncToRemoteMongo();
      } catch (syncErr: any) {
        console.warn('[db] initial sync skipped:', syncErr?.message || syncErr);
      }

      return {
        connected: true,
        mode: 'mongodb_remote',
        uri: this.maskMongoUri(targetUri),
      };
    } catch (err: any) {
      const message = this.explainMongoError(err);
      this.isMongoConnected = false;
      this.lastConnectionError = message;
      this.activeUri = 'mongodb://local-persistent-engine:27017/crypto_telegram_admin';
      // A rejected connect() can leave the driver half-open; make sure the next
      // attempt starts from a clean state.
      try {
        this.manualDisconnect = true;
        await mongoose.disconnect();
      } catch {
        /* ignore */
      } finally {
        this.manualDisconnect = false;
      }
      return {
        connected: false,
        mode: 'mongodb_local_engine',
        uri: this.maskMongoUri(targetUri),
        error: message,
      };
    }
  }

  /** Driver options tuned for cloud hosts (Atlas on Render/Heroku style). */
  private mongoConnectOptions(uri: string): Record<string, unknown> {
    const forceIpv4Env = (process.env.MONGODB_IP_FAMILY || '').trim().toLowerCase();
    // Atlas is reachable over IPv4; forcing it avoids the Node happy-eyeballs
    // path that intermittently fails on cloud egress (a classic cause of
    // "connected then dropped" loops). Set MONGODB_IP_FAMILY=auto to disable.
    const forceIpv4 =
      forceIpv4Env === 'auto' || forceIpv4Env === '0'
        ? false
        : forceIpv4Env === '6'
          ? false
          : forceIpv4Env === '4' || uri.startsWith('mongodb+srv://');

    return {
      serverSelectionTimeoutMS: Math.max(
        5000,
        Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 30000)
      ),
      connectTimeoutMS: Math.max(
        5000,
        Number(process.env.MONGODB_CONNECT_TIMEOUT_MS || 30000)
      ),
      socketTimeoutMS: Math.max(
        20000,
        Number(process.env.MONGODB_SOCKET_TIMEOUT_MS || 120000)
      ),
      // keep NAT/firewall mappings warm — idle sockets are the usual reason a
      // cloud MongoDB connection silently dies.
      heartbeatFrequencyMS: 10000,
      maxPoolSize: Math.max(5, Number(process.env.MONGODB_MAX_POOL_SIZE || 20)),
      minPoolSize: 1,
      maxIdleTimeMS: 60000,
      retryWrites: true,
      retryReads: true,
      autoSelectFamily: true,
      ...(forceIpv4 ? { family: 4 } : {}),
    };
  }

  /** Translates driver errors into an actionable Persian message. */
  private explainMongoError(err: any): string {
    const raw = String(err?.message || err || 'خطای نامشخص');
    const lower = raw.toLowerCase();
    if (lower.includes('authentication failed') || lower.includes('bad auth')) {
      return `نام کاربری یا رمز MongoDB اشتباه است. اگر رمز شامل @ یا : یا / است، آن را در URI کدگذاری کنید (@ → %40). جزئیات: ${raw}`;
    }
    if (lower.includes('querysrv') || lower.includes('enotfound') || lower.includes('eai_again')) {
      return `آدرس کلاستر MongoDB پیدا نشد (DNS). رشته اتصال و اتصال اینترنت سرور را بررسی کنید. جزئیات: ${raw}`;
    }
    if (
      lower.includes('could not connect') ||
      lower.includes('serverselection') ||
      lower.includes('etimedout') ||
      lower.includes('econnrefused')
    ) {
      return `سرور MongoDB به اتصال پاسخ نداد. تقریباً همیشه یعنی IP سرور در Access List آتلاس مجاز نشده است؛ 0.0.0.0/0 را موقتاً اضافه کنید. جزئیات: ${raw}`;
    }
    if (lower.includes('cannot call openuri') || lower.includes('active connection')) {
      return `اتصال قبلی هنوز باز است؛ درخواست متوقف شد تا اتصال فعلی قطع نشود. دوباره تلاش کنید. جزئیات: ${raw}`;
    }
    if (lower.includes('tls') || lower.includes('ssl')) {
      return `خطای TLS در اتصال MongoDB. پورت/گزینه‌های ssl رشته اتصال را بررسی کنید. جزئیات: ${raw}`;
    }
    return raw;
  }

  private uriSource(): 'env' | 'panel' | 'none' {
    const envUri = (process.env.MONGODB_URI || '').trim();
    const storedUri = (this.store.mongoUri || '').trim();
    if (storedUri && storedUri !== envUri) return 'panel';
    if (envUri && envUri !== 'MY_MONGODB_URI') return 'env';
    if (storedUri) return 'panel';
    return 'none';
  }

  /**
   * Verifies the live connection (ping) and, when it is really dead, lets one
   * background reconnect attempt run. Called by the status endpoint so the
   * panel's "test connection" button reports reality instead of a stale flag.
   */
  public async checkConnection(): Promise<{ ok: boolean; error?: string }> {
    if (!this.isMongoConnected || mongoose.connection.readyState !== 1) {
      if (mongoose.connection.readyState === 2) {
        return { ok: false, error: 'در حال برقراری اتصال به MongoDB…' };
      }
      this.isMongoConnected = false;
      this.maybeReconnectInBackground();
      return { ok: false, error: this.lastConnectionError || 'اتصال MongoDB برقرار نیست.' };
    }

    try {
      const db = mongoose.connection.db;
      if (!db) throw new Error('اتصال MongoDB هنوز آماده نیست.');
      await Promise.race([
        db.admin().command({ ping: 1 }),
        new Promise((_resolve, reject) =>
          setTimeout(() => reject(new Error('زمان پاسخ سرور MongoDB به پایان رسید')), 5000)
        ),
      ]);
      this.lastPingAt = new Date().toISOString();
      return { ok: true };
    } catch (err: any) {
      this.isMongoConnected = false;
      this.lastConnectionError = this.explainMongoError(err);
      this.disconnectCount += 1;
      this.lastDisconnectAt = new Date().toISOString();
      this.lastDisconnectReason = 'پاسخ ping از سرور MongoDB دریافت نشد (اتصال مرده)';
      this.maybeReconnectInBackground();
      return { ok: false, error: this.lastConnectionError };
    }
  }

  /** Throttled, fire-and-forget reconnect (never blocks a status request). */
  public maybeReconnectInBackground(): void {
    const uri = (this.store.mongoUri || process.env.MONGODB_URI || '').trim();
    if (!uri || uri === 'MY_MONGODB_URI') return;
    if (this.isRemoteReady()) return;
    if (mongoose.connection.readyState === 2) return;
    if (Date.now() - this.lastConnectAttemptAt < 20000) return;
    setTimeout(() => {
      void this.connectMongo().catch(() => undefined);
    }, 50);
  }

  private maskMongoUri(uri: string): string {
    if (!uri) return '';
    return uri.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:****@');
  }

  private async syncToRemoteMongo(): Promise<void> {
    if (!this.isMongoConnected) return;

    const chunk = <T,>(rows: T[], size = 1000): T[][] => {
      const out: T[][] = [];
      for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
      return out;
    };

    const bulkUpsert = async (
      model: any,
      rows: any[],
      filterOf: (row: any) => Record<string, unknown>,
      label: string
    ): Promise<void> => {
      if (rows.length === 0) return;
      for (const part of chunk(rows)) {
        try {
          await model.bulkWrite(
            part.map((row) => ({
              updateOne: {
                filter: filterOf(row),
                update: { $setOnInsert: row },
                upsert: true,
              },
            })),
            { ordered: false }
          );
        } catch (err: any) {
          // duplicate-key races are harmless; log anything else and continue
          if (!/duplicate key/i.test(String(err?.message || ''))) {
            console.warn(`[db] sync ${label} chunk failed:`, err?.message || err);
          }
        }
      }
    };

    try {
      if ((await AdminUserModel.countDocuments()) === 0) {
        await bulkUpsert(AdminUserModel, this.store.users, (u) => ({ email: u.email }), 'users');
      }

      if ((await CryptoSymbolModel.countDocuments()) === 0) {
        await bulkUpsert(CryptoSymbolModel, this.store.symbols, (s) => ({ symbol: s.symbol }), 'symbols');
      }

      if ((await TelegramConfigModel.countDocuments()) === 0 && this.store.telegramConfig) {
        const { _id, ...rest } = this.store.telegramConfig;
        await TelegramConfigModel.create(rest);
      }

      // Demo trading data must be mirrored too. Without this, everything that
      // was written while MongoDB was still connecting stayed only in the disk
      // mirror and disappeared as soon as reads switched over to MongoDB.
      if ((await TradeAccountModel.countDocuments()) === 0) {
        await bulkUpsert(
          TradeAccountModel,
          this.store.tradeAccounts || [],
          (a) => ({ _id: a._id }),
          'trade accounts'
        );
      }

      if ((await PositionModel.countDocuments()) === 0) {
        await bulkUpsert(PositionModel, this.store.positions || [], (p) => ({ _id: p._id }), 'positions');
      }

      if ((await WeexSettingsModel.countDocuments()) === 0) {
        await bulkUpsert(
          WeexSettingsModel,
          this.store.weexSettings || [],
          (s) => ({ _id: s._id }),
          'weex settings'
        );
      }

      if ((await WeexPositionModel.countDocuments()) === 0) {
        await bulkUpsert(
          WeexPositionModel,
          this.store.weexPositions || [],
          (p) => ({ _id: p._id }),
          'weex positions'
        );
      }

      if ((await RegisteredSignalModel.countDocuments()) === 0) {
        await bulkUpsert(
          RegisteredSignalModel,
          this.store.registeredSignals || [],
          (s) => ({ _id: s._id }),
          'signals'
        );
      }
    } catch (err) {
      console.error('Error syncing collections to remote MongoDB:', err);
    }
  }

  /** Splits a Mongo connection string into host + database name. */
  private parseMongoUri(uri: string): { host: string; dbName: string } {
    try {
      const m = /^mongodb(?:\+srv)?:\/\/(?:[^@/]+@)?([^/?]+)(?:\/([^?]*))?/.exec(uri || '');
      const dbName = (m?.[2] || '').trim();
      return { host: m?.[1] || '', dbName: dbName || 'test' };
    } catch {
      return { host: '', dbName: '' };
    }
  }

  /**
   * Collection counts for the status panel.
   *
   * The previous version loaded EVERY registered signal and telegram message
   * just to call `.length`. With tens of thousands of rows — polled every 15
   * seconds by the panel — that saturated the Atlas pool and made the driver
   * look "disconnected". `countDocuments` is one cheap command per collection.
   */
  private async getCollectionCounts() {
    const counts = {
      users: this.store.users.length,
      symbols: this.store.symbols.length,
      telegramMessages: this.store.telegramMessages.length,
      registeredSignals: Array.isArray(this.store.registeredSignals)
        ? this.store.registeredSignals.length
        : 0,
      demoAccounts: Array.isArray(this.store.tradeAccounts) ? this.store.tradeAccounts.length : 0,
      demoPositions: Array.isArray(this.store.positions) ? this.store.positions.length : 0,
      weexPositions: Array.isArray(this.store.weexPositions) ? this.store.weexPositions.length : 0,
    };

    if (mongoose.connection.readyState === 1) {
      try {
        const [users, symbols, messages, signals, demoAccounts, demoPositions, weexPositions] =
          await Promise.all([
            AdminUserModel.countDocuments(),
            CryptoSymbolModel.countDocuments(),
            TelegramMessageModel.countDocuments(),
            RegisteredSignalModel.countDocuments(),
            TradeAccountModel.countDocuments(),
            PositionModel.countDocuments(),
            WeexPositionModel.countDocuments(),
          ]);
        counts.users = Math.max(counts.users, users);
        counts.symbols = Math.max(counts.symbols, symbols);
        counts.telegramMessages = Math.max(counts.telegramMessages, messages);
        counts.registeredSignals = Math.max(counts.registeredSignals, signals);
        counts.demoAccounts = Math.max(counts.demoAccounts, demoAccounts);
        counts.demoPositions = Math.max(counts.demoPositions, demoPositions);
        counts.weexPositions = Math.max(counts.weexPositions, weexPositions);
      } catch (err: any) {
        this.lastConnectionError = this.explainMongoError(err);
      }
    }
    return counts;
  }

  public async getDatabaseStatus() {
    const conn = await this.checkConnection();
    const tgConfig = await this.getTelegramConfig();
    const counts = await this.getCollectionCounts();

    const readyState = mongoose.connection.readyState;
    const remoteReady = conn.ok && readyState === 1;
    const { host, dbName } = this.parseMongoUri(this.activeUri);
    const configuredUri = (this.store.mongoUri || process.env.MONGODB_URI || '').trim();
    const configured = this.parseMongoUri(configuredUri);

    const statusLabel = remoteReady
      ? 'اتصال برقرار است'
      : readyState === 2
        ? 'در حال اتصال به سرور MongoDB…'
        : readyState === 3
          ? 'در حال قطع اتصال…'
          : 'اتصال برقرار نیست';

    return {
      isRemoteConnected: remoteReady,
      readyState,
      statusLabel,
      engineLabel: remoteReady
        ? 'متصل به سرور MongoDB Atlas (Mongoose ODM)'
        : 'موتور دیتابیس داخلی (ذخیره‌سازی دیسک موقت — با هر دیپلوی پاک می‌شود)',
      clusterHost: remoteReady ? host : configured.host || '—',
      databaseName: remoteReady ? dbName : configured.dbName || '—',
      hasConfiguredUri: Boolean(configuredUri),
      uriSource: this.uriSource(),
      envConfigured: Boolean(
        (process.env.MONGODB_URI || '').trim() &&
          (process.env.MONGODB_URI || '').trim() !== 'MY_MONGODB_URI'
      ),
      activeUri: this.isMongoConnected ? this.maskMongoUri(this.activeUri) : '—',
      configuredExternalUri: this.maskMongoUri(this.store.mongoUri),
      lastError: conn.ok ? this.lastConnectionError : conn.error || this.lastConnectionError,
      lastConnectedAt: this.lastConnectedAt,
      lastDisconnectAt: this.lastDisconnectAt,
      lastDisconnectReason: this.lastDisconnectReason,
      lastPingAt: this.lastPingAt,
      lastConnectAttemptAt: this.lastConnectAttemptAt
        ? new Date(this.lastConnectAttemptAt).toISOString()
        : null,
      reconnectCount: this.reconnectCount,
      disconnectCount: this.disconnectCount,
      collections: {
        users: counts.users,
        symbols: counts.symbols,
        telegramMessages: counts.telegramMessages,
        telegramBotConfigured: Boolean(tgConfig?.botToken),
        registeredSignals: counts.registeredSignals,
        demoAccounts: counts.demoAccounts,
        demoPositions: counts.demoPositions,
        weexPositions: counts.weexPositions,
      },
    };
  }

  // ==========================================================================
  // AdminUser Operations
  // ==========================================================================
  public async findUserByEmail(identifier: string): Promise<IAdminUser | null> {
    const normalized = identifier.trim().toLowerCase();
    if (this.isMongoConnected && mongoose.connection.readyState === 1) {
      const doc = await AdminUserModel.findOne({
        $or: [{ email: normalized }, { name: normalized }],
      }).lean();
      if (doc) return { ...doc, _id: String(doc._id) };
    }
    return (
      this.store.users.find(
        (u) => u.email.toLowerCase() === normalized || u.name.toLowerCase() === normalized
      ) || null
    );
  }

  public async findUserById(id: string): Promise<IAdminUser | null> {
    if (this.isMongoConnected && mongoose.connection.readyState === 1 && mongoose.Types.ObjectId.isValid(id)) {
      const doc = await AdminUserModel.findById(id).lean();
      if (doc) return { ...doc, _id: String(doc._id) };
    }
    return this.store.users.find((u) => u._id === id) || null;
  }

  public async getAllUsers(): Promise<Omit<IAdminUser, 'passwordHash'>[]> {
    const byId = new Map<string, Omit<IAdminUser, 'passwordHash'>>();
    for (const u of this.store.users || []) {
      const { passwordHash, ...rest } = u;
      if (rest?._id) byId.set(String(rest._id), rest);
    }
    if (this.isMongoConnected && mongoose.connection.readyState === 1) {
      try {
        const docs = await AdminUserModel.find().sort({ createdAt: -1 }).lean();
        for (const doc of docs) {
          const { passwordHash, ...rest } = doc as any;
          byId.set(String(rest._id), { ...rest, _id: String(rest._id) });
        }
      } catch {
        /* fall back to the disk mirror */
      }
    }
    return [...byId.values()];
  }

  public async createUser(data: { name: string; email: string; passwordHash: string; role?: string }): Promise<IAdminUser> {
    const newUser: IAdminUser = {
      _id: generateObjectId(),
      name: data.name.trim(),
      email: data.email.trim().toLowerCase(),
      passwordHash: data.passwordHash,
      role: data.role || 'مدیر سیستم (Admin)',
      createdAt: new Date().toISOString(),
    };

    if (this.isMongoConnected && mongoose.connection.readyState === 1) {
      const created = await AdminUserModel.create({
        name: newUser.name,
        email: newUser.email,
        passwordHash: newUser.passwordHash,
        role: newUser.role,
        createdAt: newUser.createdAt,
      });
      newUser._id = String(created._id);
    }

    this.store.users.push(newUser);
    this.saveDiskStore();
    return newUser;
  }

  // ==========================================================================
  // CryptoSymbol Watchlist Operations
  // ==========================================================================
  public async getSymbols(): Promise<ICryptoSymbol[]> {
    if (this.isMongoConnected && mongoose.connection.readyState === 1) {
      const docs = await CryptoSymbolModel.find().sort({ createdAt: 1 }).lean();
      return docs.map((d) => ({ ...d, _id: String(d._id) }));
    }
    return [...this.store.symbols];
  }

  public async addSymbol(data: { symbol: string; baseAsset: string; quoteAsset: string; label: string; addedBy?: string }): Promise<ICryptoSymbol> {
    const normalizedSymbol = data.symbol.trim().toUpperCase();
    const existing = this.store.symbols.find((s) => s.symbol === normalizedSymbol);
    if (existing) {
      return existing;
    }

    const newSymbol: ICryptoSymbol = {
      _id: generateObjectId(),
      symbol: normalizedSymbol,
      baseAsset: data.baseAsset.trim().toUpperCase(),
      quoteAsset: data.quoteAsset.trim().toUpperCase(),
      label: data.label.trim(),
      addedBy: data.addedBy || 'admin',
      createdAt: new Date().toISOString(),
    };

    if (this.isMongoConnected && mongoose.connection.readyState === 1) {
      const doc = await CryptoSymbolModel.findOneAndUpdate(
        { symbol: normalizedSymbol },
        { $setOnInsert: newSymbol },
        { upsert: true, new: true }
      ).lean();
      if (doc) newSymbol._id = String(doc._id);
    }

    this.store.symbols.push(newSymbol);
    this.saveDiskStore();
    return newSymbol;
  }

  public async removeSymbol(symbol: string): Promise<boolean> {
    const normalizedSymbol = symbol.trim().toUpperCase();
    if (this.isMongoConnected && mongoose.connection.readyState === 1) {
      await CryptoSymbolModel.deleteOne({ symbol: normalizedSymbol });
    }
    const prevLen = this.store.symbols.length;
    this.store.symbols = this.store.symbols.filter((s) => s.symbol !== normalizedSymbol);
    this.saveDiskStore();
    return this.store.symbols.length < prevLen;
  }

  /**
   * Replaces the AUTO-managed part of the watchlist (top market-cap coins +
   * most-volatile coins) in one shot, without touching rows the admin added by
   * hand. Rows carrying one of `autoTags` in `addedBy` are considered managed
   * by the refresher and are rewritten every run; any manual row that collides
   * with a new auto symbol is upgraded to the auto row (label refreshed).
   */
  public async syncAutoSymbols(
    items: Array<{
      symbol: string;
      baseAsset: string;
      quoteAsset: string;
      label: string;
      addedBy: string;
    }>,
    autoTags: string[]
  ): Promise<{ added: number; removed: number; total: number }> {
    const now = new Date().toISOString();
    const normalized = items.map((it) => ({
      symbol: it.symbol.trim().toUpperCase(),
      baseAsset: it.baseAsset.trim().toUpperCase(),
      quoteAsset: it.quoteAsset.trim().toUpperCase(),
      label: it.label.trim(),
      addedBy: it.addedBy,
    }));
    const wantedSymbols = new Set(normalized.map((s) => s.symbol));

    // ---- disk mirror ----
    const kept: ICryptoSymbol[] = [];
    let removed = 0;
    for (const s of this.store.symbols) {
      const isAuto = autoTags.includes(String(s.addedBy || ''));
      if (isAuto || wantedSymbols.has(s.symbol)) {
        removed += 1;
        continue;
      }
      kept.push(s);
    }
    const newRows: ICryptoSymbol[] = normalized.map((s) => ({
      _id: generateObjectId(),
      ...s,
      createdAt: now,
    }));
    this.store.symbols = [...kept, ...newRows];
    this.saveDiskStore();

    // ---- remote MongoDB ----
    if (this.isMongoConnected && mongoose.connection.readyState === 1) {
      try {
        await CryptoSymbolModel.deleteMany({ addedBy: { $in: autoTags } });
        if (wantedSymbols.size > 0) {
          await CryptoSymbolModel.deleteMany({ symbol: { $in: [...wantedSymbols] } });
        }
        for (const row of newRows) {
          await CryptoSymbolModel.updateOne(
            { symbol: row.symbol },
            { $setOnInsert: { ...row, _id: row._id } },
            { upsert: true }
          );
        }
      } catch (err) {
        console.error('Error syncing auto watchlist symbols to remote MongoDB:', err);
      }
    }

    return { added: newRows.length, removed, total: newRows.length };
  }

  // ==========================================================================
  // Telegram Direct Bot Configuration & Messages Operations
  // ==========================================================================
  public async getTelegramConfig(): Promise<ITelegramConfig> {
    if (this.isMongoConnected && mongoose.connection.readyState === 1) {
      const doc = await TelegramConfigModel.findOne().lean();
      if (doc) {
        return { ...doc, _id: String(doc._id) };
      }
    }
    if (!this.store.telegramConfig) {
      this.store.telegramConfig = {
        _id: generateObjectId(),
        botToken: '',
        botUsername: '',
        botFirstName: '',
        isPollingActive: false,
        lastUpdateId: 0,
        updatedAt: new Date().toISOString(),
      };
      this.saveDiskStore();
    }
    return this.store.telegramConfig;
  }

  public async updateTelegramConfig(patch: Partial<ITelegramConfig>): Promise<ITelegramConfig> {
    const current = await this.getTelegramConfig();
    const updated: ITelegramConfig = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    if (this.isMongoConnected && mongoose.connection.readyState === 1) {
      const { _id, ...updateData } = updated;
      await TelegramConfigModel.updateOne({}, { $set: updateData }, { upsert: true });
    }

    this.store.telegramConfig = updated;
    this.saveDiskStore();
    return updated;
  }

  public async getTelegramMessages(): Promise<ITelegramMessage[]> {
    if (this.isMongoConnected && mongoose.connection.readyState === 1) {
      const docs = await TelegramMessageModel.find().sort({ createdAt: 1 }).lean();
      return docs.map((d) => ({ ...d, _id: String(d._id) }));
    }
    return [...this.store.telegramMessages].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }

  public async addTelegramMessage(msg: Omit<ITelegramMessage, '_id' | 'createdAt'> & { createdAt?: string }): Promise<ITelegramMessage> {
    // Avoid duplicate updateId for incoming messages
    if (msg.updateId !== undefined) {
      const duplicateInStore = this.store.telegramMessages.find((m) => m.updateId === msg.updateId);
      if (duplicateInStore) return duplicateInStore;
    }

    const newMsg: ITelegramMessage = {
      _id: generateObjectId(),
      updateId: msg.updateId,
      chatId: String(msg.chatId),
      chatType: msg.chatType || 'private',
      senderUsername: msg.senderUsername || '',
      senderFirstName: msg.senderFirstName || 'کاربر تلگرام',
      senderLastName: msg.senderLastName || '',
      text: msg.text,
      direction: msg.direction,
      isRead: msg.isRead,
      createdAt: msg.createdAt || new Date().toISOString(),
    };

    if (this.isMongoConnected && mongoose.connection.readyState === 1) {
      const created = await TelegramMessageModel.create({
        updateId: newMsg.updateId,
        chatId: newMsg.chatId,
        chatType: newMsg.chatType,
        senderUsername: newMsg.senderUsername,
        senderFirstName: newMsg.senderFirstName,
        senderLastName: newMsg.senderLastName,
        text: newMsg.text,
        direction: newMsg.direction,
        isRead: newMsg.isRead,
        createdAt: newMsg.createdAt,
      });
      newMsg._id = String(created._id);
    }

    this.store.telegramMessages.push(newMsg);
    // Keep max 500 messages in local mirror
    if (this.store.telegramMessages.length > 500) {
      this.store.telegramMessages = this.store.telegramMessages.slice(-500);
    }
    this.saveDiskStore();
    return newMsg;
  }

  public async markChatMessagesRead(chatId: string): Promise<void> {
    const normalizedChatId = String(chatId);
    if (this.isMongoConnected && mongoose.connection.readyState === 1) {
      await TelegramMessageModel.updateMany({ chatId: normalizedChatId, isRead: false }, { $set: { isRead: true } });
    }
    let changed = false;
    this.store.telegramMessages = this.store.telegramMessages.map((m) => {
      if (m.chatId === normalizedChatId && !m.isRead) {
        changed = true;
        return { ...m, isRead: true };
      }
      return m;
    });
    if (changed) this.saveDiskStore();
  }

  public async deleteChatMessages(chatId: string): Promise<void> {
    const normalizedChatId = String(chatId);
    if (this.isMongoConnected && mongoose.connection.readyState === 1) {
      await TelegramMessageModel.deleteMany({ chatId: normalizedChatId });
    }
    this.store.telegramMessages = this.store.telegramMessages.filter((m) => m.chatId !== normalizedChatId);
    this.saveDiskStore();
  }

  // ==========================================================================
  // AvalAI (ChatGPT) Configuration Operations
  // ==========================================================================
  public async getAvalAIConfig(): Promise<IAvalAIConfig> {
    if (this.isMongoConnected && mongoose.connection.readyState === 1) {
      const doc = await AvalAIConfigModel.findOne().lean();
      if (doc) {
        return { ...doc, _id: String(doc._id) };
      }
    }
    if (!this.store.avalaiConfig) {
      this.store.avalaiConfig = {
        _id: generateObjectId(),
        apiKey: process.env.AVALAI_API_KEY || 'aa-u0S6Ls0H00KMvWJrthbwwYMWRUzmtCCL8R1IKXK6W2KepJTw',
        baseUrl: process.env.AVALAI_BASE_URL || 'https://api.avalai.ir/v1',
        modelName: 'gpt-6-luna',
        systemPrompt:
          'شما دستیار هوشمند پنل مدیریت ارزهای دیجیتال و تلگرام هستید و به زبان فارسی پاسخ‌های دقیق و کاربردی می‌دهید.',
        temperature: 0.7,
        lastTestStatus: 'untested',
        lastTestMessage: '',
        updatedAt: new Date().toISOString(),
      };
      this.saveDiskStore();
    } else {
      if (!this.store.avalaiConfig.apiKey || this.store.avalaiConfig.apiKey === '') {
        this.store.avalaiConfig.apiKey = 'aa-u0S6Ls0H00KMvWJrthbwwYMWRUzmtCCL8R1IKXK6W2KepJTw';
      }
      if (!this.store.avalaiConfig.modelName || this.store.avalaiConfig.modelName === 'gpt-4o-mini') {
        this.store.avalaiConfig.modelName = 'gpt-6-luna';
      }
    }
    return this.store.avalaiConfig;
  }

  public async updateAvalAIConfig(patch: Partial<IAvalAIConfig>): Promise<IAvalAIConfig> {
    const current = await this.getAvalAIConfig();
    const updated: IAvalAIConfig = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    if (this.isMongoConnected && mongoose.connection.readyState === 1) {
      const { _id, ...updateData } = updated;
      await AvalAIConfigModel.updateOne({}, { $set: updateData }, { upsert: true });
    }

    this.store.avalaiConfig = updated;
    this.saveDiskStore();
    return updated;
  }

  // ==========================================================================
  // Registered Multi-Signals (>= 3 Buy or Sell Signals on 15m) Operations
  // ==========================================================================
  public async getRegisteredSignals(): Promise<IRegisteredSignal[]> {
    // union of Mongo + disk mirror, newest first
    const byId = new Map<string, IRegisteredSignal>();
    for (const s of Array.isArray(this.store.registeredSignals) ? this.store.registeredSignals : []) {
      byId.set(s._id, s);
    }
    if (this.isMongoConnected && mongoose.connection.readyState === 1) {
      try {
        const docs = await RegisteredSignalModel.find()
          .sort({ createdAt: -1 })
          .limit(SIGNAL_STORE_LIMIT)
          .lean();
        for (const d of docs) byId.set(String((d as any)._id), { ...(d as any), _id: String((d as any)._id) });
      } catch {
        /* ignore */
      }
    }
    return [...byId.values()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Total number of DISTINCT signals available across both stores — the honest
   * number behind the table, so the UI can tell the user when it is truncated.
   */
  public async countRegisteredSignals(): Promise<number> {
    const ids = new Set<string>();
    for (const s of Array.isArray(this.store.registeredSignals)
      ? this.store.registeredSignals
      : []) {
      ids.add(String(s._id));
    }
    if (this.isMongoConnected && mongoose.connection.readyState === 1) {
      try {
        const docs = await RegisteredSignalModel.find()
          .select('_id')
          .sort({ createdAt: -1 })
          .limit(SIGNAL_STORE_LIMIT)
          .lean();
        for (const d of docs) ids.add(String((d as any)._id));
      } catch {
        /* ignore */
      }
    }
    return ids.size;
  }

  private async getRegisteredSignalsLegacy(): Promise<IRegisteredSignal[]> {
    if (this.isMongoConnected && mongoose.connection.readyState === 1) {
      const docs = await RegisteredSignalModel.find()
        .sort({ createdAt: -1 })
        .limit(SIGNAL_STORE_LIMIT)
        .lean();
      return docs.map((d) => ({ ...d, _id: String(d._id) }));
    }
    const list = Array.isArray(this.store.registeredSignals) ? this.store.registeredSignals : [];
    return [...list].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  public async addRegisteredSignal(
    sig: Omit<IRegisteredSignal, '_id' | 'createdAt'> & { createdAt?: string }
  ): Promise<IRegisteredSignal> {
    const newSig: IRegisteredSignal = {
      ...sig,
      _id: generateObjectId(),
      createdAt: sig.createdAt || new Date().toISOString(),
    };

    if (this.isMongoConnected && mongoose.connection.readyState === 1) {
      const { _id, ...payload } = newSig;
      const created = await RegisteredSignalModel.create(payload);
      newSig._id = String(created._id);
    }

    if (!Array.isArray(this.store.registeredSignals)) {
      this.store.registeredSignals = [];
    }
    this.store.registeredSignals.unshift(newSig);
    if (this.store.registeredSignals.length > SIGNAL_STORE_LIMIT) {
      this.store.registeredSignals = this.store.registeredSignals.slice(0, SIGNAL_STORE_LIMIT);
    }
    this.saveDiskStore();
    return newSig;
  }

  public async deleteRegisteredSignal(id: string): Promise<boolean> {
    if (
      this.isMongoConnected &&
      mongoose.connection.readyState === 1 &&
      mongoose.Types.ObjectId.isValid(id)
    ) {
      await RegisteredSignalModel.findByIdAndDelete(id);
    }
    if (!Array.isArray(this.store.registeredSignals)) {
      this.store.registeredSignals = [];
      return false;
    }
    const prevLen = this.store.registeredSignals.length;
    this.store.registeredSignals = this.store.registeredSignals.filter((s) => s._id !== id);
    this.saveDiskStore();
    return this.store.registeredSignals.length < prevLen;
  }

  /** Records the outcome of the direct hand-off to the trade engine. */
  public async markSignalDispatched(
    id: string,
    dispatched: boolean,
    note: string,
    status = ''
  ): Promise<void> {
    const at = new Date().toISOString();
    if (
      this.isMongoConnected &&
      mongoose.connection.readyState === 1 &&
      mongoose.Types.ObjectId.isValid(id)
    ) {
      await RegisteredSignalModel.findByIdAndUpdate(id, {
        dispatchedToTrade: dispatched,
        tradeDispatchNote: note,
        tradeStatus: status,
        tradeDispatchedAt: at,
      });
    }
    if (!Array.isArray(this.store.registeredSignals)) return;
    const target = this.store.registeredSignals.find((s) => s._id === id);
    if (target) {
      target.dispatchedToTrade = dispatched;
      target.tradeDispatchNote = note;
      target.tradeStatus = status;
      target.tradeDispatchedAt = at;
      this.saveDiskStore();
    }
  }

  public async clearRegisteredSignals(): Promise<void> {
    if (this.isMongoConnected && mongoose.connection.readyState === 1) {
      await RegisteredSignalModel.deleteMany({});
    }
    this.store.registeredSignals = [];
    this.saveDiskStore();
  }

  // ==========================================================================
  // Virtual Demo Trading Account (100 USD) Operations
  // ==========================================================================
  /** True when the remote MongoDB store is actually usable right now. */
  public isRemoteReady(): boolean {
    return this.isMongoConnected && mongoose.connection.readyState === 1;
  }

  public hasConfiguredUri(): boolean {
    const uri = (this.store.mongoUri || process.env.MONGODB_URI || '').trim();
    return Boolean(uri && uri !== 'MY_MONGODB_URI');
  }

  // ==========================================================================
  // One-shot database wipe (danger zone)
  // ==========================================================================
  /**
   * Deletes application data from BOTH stores.
   *
   * Deleting only MongoDB is not enough: reads merge the MongoDB collection with
   * the on-disk mirror, so untouched disk rows would reappear immediately.
   *
   * The current admin account, the MongoDB URI and the AvalAI/Telegram bot
   * configuration are preserved unless the caller explicitly asks otherwise.
   */
  public async wipeDatabase(options: WipeDatabaseOptions = {}): Promise<WipeDatabaseResult> {
    const allowed: WipeScope[] = ['signals', 'demo', 'weex', 'telegram', 'symbols'];
    const scopes = (options.scopes && options.scopes.length > 0
      ? options.scopes.filter((s): s is WipeScope => allowed.includes(s))
      : allowed) as WipeScope[];
    const includeAdmins = Boolean(options.includeAdmins);
    const keepAdminEmail = (options.keepAdminEmail || '').trim().toLowerCase();
    const doBackup = options.backup !== false;

    let backupFile = '';
    if (doBackup) {
      try {
        const dir = path.join(DATA_DIR, 'backups');
        fs.mkdirSync(dir, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        backupFile = path.join(dir, `wipe-${stamp}.json`);
        // The disk mirror is a full copy of what the app has written, so this
        // single file is a restorable snapshot without scanning Atlas.
        fs.copyFileSync(STORE_PATH, backupFile);
      } catch (err: any) {
        console.warn('[db] wipe backup failed:', err?.message || err);
        backupFile = '';
      }
    }

    const mongoDeleted: Record<string, number> = {};
    const diskCleared: Record<string, number> = {};
    let adminDeleted = 0;

    const readDiskCount = (key: WipeScope): number => {
      if (key === 'signals') return this.store.registeredSignals?.length || 0;
      if (key === 'demo') return (this.store.tradeAccounts?.length || 0) + (this.store.positions?.length || 0);
      if (key === 'weex') return this.store.weexPositions?.length || 0;
      if (key === 'telegram') return this.store.telegramMessages?.length || 0;
      if (key === 'symbols') return this.store.symbols?.length || 0;
      return 0;
    };
    for (const scope of scopes) diskCleared[scope] = readDiskCount(scope);

    if (mongoose.connection.readyState === 1) {
      const jobs: Array<[string, any]> = [];
      if (scopes.includes('signals')) jobs.push(['registeredSignals', RegisteredSignalModel]);
      if (scopes.includes('demo')) {
        jobs.push(['tradeAccounts', TradeAccountModel]);
        jobs.push(['positions', PositionModel]);
      }
      if (scopes.includes('weex')) jobs.push(['weexPositions', WeexPositionModel]);
      if (scopes.includes('telegram')) jobs.push(['telegramMessages', TelegramMessageModel]);
      if (scopes.includes('symbols')) jobs.push(['symbols', CryptoSymbolModel]);

      for (const [name, model] of jobs) {
        try {
          const res = await model.deleteMany({});
          mongoDeleted[name] = Number(res?.deletedCount || 0);
        } catch (err: any) {
          console.warn(`[db] wipe ${name} failed:`, err?.message || err);
          mongoDeleted[name] = -1;
        }
      }

      if (includeAdmins) {
        try {
          const filter = keepAdminEmail ? { email: { $ne: keepAdminEmail } } : {};
          const res = await AdminUserModel.deleteMany(filter);
          adminDeleted = Number(res?.deletedCount || 0);
        } catch (err: any) {
          console.warn('[db] wipe admins failed:', err?.message || err);
        }
      }
    } else if (includeAdmins) {
      const before = this.store.users.length;
      this.store.users = keepAdminEmail
        ? this.store.users.filter((u) => String(u.email || '').toLowerCase() === keepAdminEmail)
        : [];
      adminDeleted = Math.max(0, before - this.store.users.length);
    }

    // ---- clear the disk mirror so deleted rows cannot come back ----
    if (scopes.includes('signals')) this.store.registeredSignals = [];
    if (scopes.includes('demo')) {
      this.store.tradeAccounts = [];
      this.store.positions = [];
    }
    if (scopes.includes('weex')) this.store.weexPositions = [];
    if (scopes.includes('telegram')) this.store.telegramMessages = [];
    if (scopes.includes('symbols')) this.store.symbols = [];
    if (includeAdmins && keepAdminEmail) {
      this.store.users = this.store.users.filter(
        (u) => String(u.email || '').toLowerCase() === keepAdminEmail
      );
    }
    this.saveDiskStore();

    const totalMongo = Object.values(mongoDeleted).reduce((a, b) => a + Math.max(0, b), 0);
    const message = `پاکسازی انجام شد — ${totalMongo} رکورد از MongoDB` +
      (adminDeleted > 0 ? ` و ${adminDeleted} حساب ادمین` : '') +
      (backupFile ? ` | نسخه پشتیبان: ${path.relative(process.cwd(), backupFile)}` : ' | بدون نسخه پشتیبان');

    return {
      ok: true,
      backupFile: backupFile ? path.relative(process.cwd(), backupFile) : '',
      scopes,
      mongoDeleted,
      diskCleared,
      adminDeleted,
      message,
    };
  }

  /**
   * One-time self-heal: moves trading data from a stale user key (an old token
   * id whose user row was re-created with a new `_id`) onto the current key.
   * Returns how many positions were re-keyed.
   */
  public async reassignUserKey(fromKey: string, toKey: string): Promise<number> {
    if (!fromKey || !toKey || fromKey === toKey) return 0;
    // a stale token keeps sending its old id forever; only heal once per pair
    const pair = `${fromKey}->${toKey}`;
    if (this.rekeyAttempted.has(pair)) return 0;
    this.rekeyAttempted.add(pair);
    let moved = 0;

    if (this.isRemoteReady()) {
      try {
        const r = await PositionModel.updateMany(
          { userId: fromKey },
          { $set: { userId: toKey } }
        );
        moved += (r as any)?.modifiedCount || 0;
      } catch {
        /* ignore */
      }
    }

    if (Array.isArray(this.store.positions)) {
      for (const p of this.store.positions) {
        if (p.userId === fromKey) {
          p.userId = toKey;
          moved += 1;
        }
      }
    }

    // move the trading account over only when the target has none yet
    const targetAccount = await this.getTradeAccount(toKey);
    if (!targetAccount) {
      const staleAccount = await this.getTradeAccount(fromKey);
      if (staleAccount) {
        if (this.isRemoteReady()) {
          try {
            await TradeAccountModel.updateOne(
              { _id: staleAccount._id },
              { $set: { userId: toKey } }
            );
          } catch {
            /* ignore */
          }
        }
        const diskAccount = (this.store.tradeAccounts || []).find((a) => a.userId === fromKey);
        if (diskAccount) diskAccount.userId = toKey;
      }
    }

    this.saveDiskStore();
    return moved;
  }

  /**
   * Shows, for a given user key, what each storage layer holds. Used by the
   * trade page so a "the order exists but my list is empty" situation can be
   * diagnosed without guessing.
   */
  public async getPositionsDiagnostics(userId: string): Promise<{
    remoteReady: boolean;
    diskTotal: number;
    diskMine: number;
    remoteTotal: number;
    remoteMine: number;
    ownerKeys: string[];
    activeUri: string;
  }> {
    const diskAll = Array.isArray(this.store.positions) ? this.store.positions : [];
    const diskMine = diskAll.filter((p) => p.userId === userId);

    let remoteTotal = 0;
    let remoteMine = 0;
    const remoteOwners: string[] = [];
    if (this.isRemoteReady()) {
      try {
        remoteTotal = await PositionModel.countDocuments();
        remoteMine = await PositionModel.countDocuments({ userId });
        const owners = await PositionModel.distinct('userId');
        for (const o of owners) remoteOwners.push(String(o));
      } catch {
        /* ignore */
      }
    }

    return {
      remoteReady: this.isRemoteReady(),
      diskTotal: diskAll.length,
      diskMine: diskMine.length,
      remoteTotal,
      remoteMine,
      ownerKeys: [...new Set([...diskAll.map((p) => String(p.userId)), ...remoteOwners])],
      activeUri: this.maskMongoUri(this.activeUri),
    };
  }

  public async getTradeAccount(userId: string): Promise<ITradeAccount | null> {
    // Read BOTH sources and keep the freshest record. MongoDB can connect after
    // data was written to the disk mirror (or drop later), and reading only one
    // of them made existing accounts / positions look like they vanished.
    const fromDisk =
      (Array.isArray(this.store.tradeAccounts) ? this.store.tradeAccounts : []).find(
        (a) => a.userId === userId
      ) || null;

    let fromMongo: ITradeAccount | null = null;
    if (this.isMongoConnected && mongoose.connection.readyState === 1) {
      try {
        const doc = await TradeAccountModel.findOne({ userId }).lean();
        if (doc) fromMongo = { ...(doc as any), _id: String(doc._id) };
      } catch {
        fromMongo = null;
      }
    }

    if (fromDisk && fromMongo) {
      const d = new Date(fromDisk.updatedAt || fromDisk.createdAt || 0).getTime();
      const m = new Date(fromMongo.updatedAt || fromMongo.createdAt || 0).getTime();
      return m >= d ? fromMongo : fromDisk;
    }
    return fromDisk || fromMongo;
  }

  /** Every trade-account key the engine knows about (Mongo + disk). */
  public async getAllTradeAccountUserIds(): Promise<string[]> {
    const ids = new Set<string>();
    for (const a of Array.isArray(this.store.tradeAccounts) ? this.store.tradeAccounts : []) {
      if (a?.userId) ids.add(String(a.userId));
    }
    if (this.isMongoConnected && mongoose.connection.readyState === 1) {
      try {
        const docs = await TradeAccountModel.find().lean();
        for (const d of docs) if ((d as any)?.userId) ids.add(String((d as any).userId));
      } catch {
        /* ignore */
      }
    }
    return [...ids];
  }

  public async getOrCreateTradeAccount(userId: string): Promise<ITradeAccount> {
    const existing = await this.getTradeAccount(userId);
    if (existing) return existing;

    const now = new Date().toISOString();
    const account: ITradeAccount = {
      _id: generateObjectId(),
      userId,
      initialBalance: 100,
      balance: 100,
      leverage: 5,
      marginPerTradePct: 20,
      createdAt: now,
      updatedAt: now,
    };

    if (this.isMongoConnected && mongoose.connection.readyState === 1) {
      const { _id, ...payload } = account;
      const created = await TradeAccountModel.create(payload);
      account._id = String(created._id);
    }

    if (!Array.isArray(this.store.tradeAccounts)) this.store.tradeAccounts = [];
    this.store.tradeAccounts.push(account);
    this.saveDiskStore();
    return account;
  }

  public async updateTradeAccount(
    userId: string,
    patch: Partial<ITradeAccount>
  ): Promise<ITradeAccount | null> {
    const account = await this.getOrCreateTradeAccount(userId);
    const updated: ITradeAccount = {
      ...account,
      ...patch,
      _id: account._id,
      userId: account.userId,
      updatedAt: new Date().toISOString(),
    };

    if (this.isMongoConnected && mongoose.connection.readyState === 1) {
      await TradeAccountModel.updateOne(
        { userId },
        {
          balance: updated.balance,
          leverage: updated.leverage,
          marginPerTradePct: updated.marginPerTradePct,
          updatedAt: updated.updatedAt,
        }
      );
    }

    if (!Array.isArray(this.store.tradeAccounts)) this.store.tradeAccounts = [];
    const idx = this.store.tradeAccounts.findIndex((a) => a.userId === userId);
    if (idx === -1) this.store.tradeAccounts.push(updated);
    else this.store.tradeAccounts[idx] = updated;
    this.saveDiskStore();
    return updated;
  }

  /** Recharges the virtual account back to its initial balance and wipes positions. */
  public async resetTradeAccount(userId: string): Promise<ITradeAccount> {
    const account = await this.getOrCreateTradeAccount(userId);
    await this.clearPositions(userId);
    return (await this.updateTradeAccount(userId, {
      balance: account.initialBalance,
    })) as ITradeAccount;
  }

  // ==========================================================================
  // Positions Operations
  // ==========================================================================
  public async getPositions(userId?: string): Promise<IPosition[]> {
    // Union of the MongoDB collection and the disk mirror, newest wins on
    // conflict. This keeps positions visible no matter which store a write
    // happened to land in.
    const byId = new Map<string, IPosition>();

    const disk = (Array.isArray(this.store.positions) ? this.store.positions : []).filter(
      (p) => !userId || p.userId === userId
    );
    for (const p of disk) byId.set(p._id, p);

    if (this.isMongoConnected && mongoose.connection.readyState === 1) {
      try {
        const filter = userId ? { userId } : {};
        const docs = await PositionModel.find(filter).sort({ createdAt: -1 }).limit(1000).lean();
        for (const d of docs) {
          const remote = { ...(d as any), _id: String(d._id) } as IPosition;
          const local = byId.get(remote._id);
          if (!local) {
            byId.set(remote._id, remote);
            continue;
          }
          const r = new Date(remote.updatedAt || remote.createdAt || 0).getTime();
          const l = new Date(local.updatedAt || local.createdAt || 0).getTime();
          if (r >= l) byId.set(remote._id, remote);
        }
      } catch {
        /* fall back to the disk mirror only */
      }
    }

    return [...byId.values()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  public async getActivePositions(userId?: string): Promise<IPosition[]> {
    const all = await this.getPositions(userId);
    return all.filter((p) => p.status === 'PENDING' || p.status === 'OPEN');
  }

  public async createPosition(
    pos: Omit<IPosition, '_id' | 'createdAt' | 'updatedAt'> & {
      createdAt?: string;
      updatedAt?: string;
    }
  ): Promise<IPosition> {
    const now = new Date().toISOString();
    const newPos: IPosition = {
      ...pos,
      _id: generateObjectId(),
      createdAt: pos.createdAt || now,
      updatedAt: pos.updatedAt || now,
    };

    if (this.isMongoConnected && mongoose.connection.readyState === 1) {
      const { _id, ...payload } = newPos;
      const created = await PositionModel.create(payload);
      newPos._id = String(created._id);
    }

    if (!Array.isArray(this.store.positions)) this.store.positions = [];
    this.store.positions.unshift(newPos);
    if (this.store.positions.length > 1000) {
      // never drop active positions
      const active = this.store.positions.filter(
        (p) => p.status === 'PENDING' || p.status === 'OPEN'
      );
      const closed = this.store.positions
        .filter((p) => p.status === 'CLOSED')
        .slice(0, Math.max(0, 1000 - active.length));
      this.store.positions = [...active, ...closed];
    }
    this.saveDiskStore();
    return newPos;
  }

  public async updatePosition(
    id: string,
    patch: Partial<IPosition>
  ): Promise<IPosition | null> {
    if (this.isMongoConnected && mongoose.connection.readyState === 1) {
      await PositionModel.updateOne({ _id: id }, { ...patch, updatedAt: new Date().toISOString() });
    }
    if (!Array.isArray(this.store.positions)) this.store.positions = [];
    const idx = this.store.positions.findIndex((p) => p._id === id);
    if (idx === -1) return null;
    this.store.positions[idx] = {
      ...this.store.positions[idx],
      ...patch,
      _id: this.store.positions[idx]._id,
      updatedAt: new Date().toISOString(),
    };
    this.saveDiskStore();
    return this.store.positions[idx];
  }

  public async deletePosition(id: string): Promise<boolean> {
    if (this.isMongoConnected && mongoose.connection.readyState === 1) {
      await PositionModel.deleteOne({ _id: id });
    }
    if (!Array.isArray(this.store.positions)) return false;
    const prev = this.store.positions.length;
    this.store.positions = this.store.positions.filter((p) => p._id !== id);
    this.saveDiskStore();
    return this.store.positions.length < prev;
  }

  public async clearPositions(userId?: string): Promise<void> {
    if (this.isMongoConnected && mongoose.connection.readyState === 1) {
      await PositionModel.deleteMany(userId ? { userId } : {});
    }
    if (!Array.isArray(this.store.positions)) {
      this.store.positions = [];
      return;
    }
    this.store.positions = userId
      ? this.store.positions.filter((p) => p.userId !== userId)
      : [];
    this.saveDiskStore();
  }

  // ==========================================================================
  // WEEX trading settings (per admin user)
  // ==========================================================================
  public async getWeexSettings(userId: string): Promise<IWeexSettings> {
    const fromDisk =
      (Array.isArray(this.store.weexSettings) ? this.store.weexSettings : []).find(
        (s) => s.userId === userId
      ) || null;
    let fromMongo: IWeexSettings | null = null;
    if (this.isMongoConnected && mongoose.connection.readyState === 1) {
      try {
        const doc = await WeexSettingsModel.findOne({ userId }).lean();
        if (doc) fromMongo = { ...(doc as any), _id: String(doc._id) };
      } catch {
        fromMongo = null;
      }
    }

    const existing = fromMongo || fromDisk;
    if (existing) return existing;

    const now = new Date().toISOString();
    const created: IWeexSettings = {
      _id: generateObjectId(),
      userId,
      mode: 'paper',
      environment: 'production',
      apiKey: process.env.WEEX_API_KEY || '',
      apiSecret: process.env.WEEX_API_SECRET || '',
      passphrase: process.env.WEEX_API_PASSPHRASE || '',
      leverage: 5,
      marginPerTradePct: 10,
      tp1ClosePct: 50,
      autoTrade: false,
      pullbackOnly: true,
      feeRatePct: 0.05,
      paperInitialBalance: 1000,
      paperBalance: 1000,
      lastTestStatus: 'untested',
      lastTestMessage: '',
      updatedAt: now,
    };
    if (!Array.isArray(this.store.weexSettings)) this.store.weexSettings = [];
    this.store.weexSettings.push(created);
    this.saveDiskStore();
    return created;
  }

  public async updateWeexSettings(
    userId: string,
    patch: Partial<IWeexSettings>
  ): Promise<IWeexSettings> {
    const current = await this.getWeexSettings(userId);
    const updated: IWeexSettings = {
      ...current,
      ...patch,
      _id: current._id,
      userId,
      updatedAt: new Date().toISOString(),
    };

    if (this.isMongoConnected && mongoose.connection.readyState === 1) {
      const { _id, ...rest } = updated;
      await WeexSettingsModel.updateOne(
        { userId },
        { $set: rest, $setOnInsert: { _id } },
        { upsert: true }
      );
    }

    if (!Array.isArray(this.store.weexSettings)) this.store.weexSettings = [];
    const idx = this.store.weexSettings.findIndex((s) => s.userId === userId);
    if (idx === -1) this.store.weexSettings.push(updated);
    else this.store.weexSettings[idx] = updated;
    this.saveDiskStore();
    return updated;
  }

  /** Every user that has WEEX settings or WEEX positions (auto-trade scope). */
  public async getAllWeexUserIds(): Promise<string[]> {
    const ids = new Set<string>();
    for (const s of Array.isArray(this.store.weexSettings) ? this.store.weexSettings : []) {
      if (s?.userId) ids.add(String(s.userId));
    }
    for (const p of Array.isArray(this.store.weexPositions) ? this.store.weexPositions : []) {
      if (p?.userId) ids.add(String(p.userId));
    }
    if (this.isMongoConnected && mongoose.connection.readyState === 1) {
      try {
        for (const s of await WeexSettingsModel.find().lean()) {
          if ((s as any)?.userId) ids.add(String((s as any).userId));
        }
        for (const p of await WeexPositionModel.find().lean()) {
          if ((p as any)?.userId) ids.add(String((p as any).userId));
        }
      } catch {
        /* disk mirror is enough */
      }
    }
    return [...ids];
  }

  // ==========================================================================
  // WEEX Positions (paper + live order records)
  // ==========================================================================
  public async getWeexPositions(userId?: string): Promise<IWeexPosition[]> {
    const byId = new Map<string, IWeexPosition>();
    const disk = (Array.isArray(this.store.weexPositions) ? this.store.weexPositions : []).filter(
      (p) => !userId || p.userId === userId
    );
    for (const p of disk) byId.set(p._id, p);

    if (this.isMongoConnected && mongoose.connection.readyState === 1) {
      try {
        const filter = userId ? { userId } : {};
        const docs = await WeexPositionModel.find(filter).sort({ createdAt: -1 }).limit(1000).lean();
        for (const d of docs) {
          const remote = { ...(d as any), _id: String(d._id) } as IWeexPosition;
          const local = byId.get(remote._id);
          if (!local) {
            byId.set(remote._id, remote);
            continue;
          }
          const r = new Date(remote.updatedAt || remote.createdAt || 0).getTime();
          const l = new Date(local.updatedAt || local.createdAt || 0).getTime();
          if (r >= l) byId.set(remote._id, remote);
        }
      } catch {
        /* fall back to the disk mirror */
      }
    }

    return [...byId.values()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  public async getActiveWeexPositions(userId?: string): Promise<IWeexPosition[]> {
    const all = await this.getWeexPositions(userId);
    return all.filter((p) => p.status === 'PENDING' || p.status === 'OPEN');
  }

  public async createWeexPosition(
    pos: Omit<IWeexPosition, '_id' | 'createdAt' | 'updatedAt'> & {
      createdAt?: string;
      updatedAt?: string;
    }
  ): Promise<IWeexPosition> {
    const now = new Date().toISOString();
    const created: IWeexPosition = {
      ...pos,
      _id: generateObjectId(),
      createdAt: pos.createdAt || now,
      updatedAt: pos.updatedAt || now,
    };

    if (this.isMongoConnected && mongoose.connection.readyState === 1) {
      const { _id, ...payload } = created;
      const doc = await WeexPositionModel.create({ ...payload, _id });
      created._id = String(doc._id);
    }

    if (!Array.isArray(this.store.weexPositions)) this.store.weexPositions = [];
    this.store.weexPositions.unshift(created);
    if (this.store.weexPositions.length > 2000) {
      const active = this.store.weexPositions.filter(
        (p) => p.status === 'PENDING' || p.status === 'OPEN'
      );
      const closed = this.store.weexPositions
        .filter((p) => p.status === 'CLOSED')
        .slice(0, Math.max(0, 2000 - active.length));
      this.store.weexPositions = [...active, ...closed];
    }
    this.saveDiskStore();
    return created;
  }

  public async updateWeexPosition(
    id: string,
    patch: Partial<IWeexPosition>
  ): Promise<IWeexPosition | null> {
    const updatedAt = new Date().toISOString();
    if (this.isMongoConnected && mongoose.connection.readyState === 1) {
      try {
        await WeexPositionModel.updateOne({ _id: id }, { ...patch, updatedAt });
      } catch {
        /* keep the disk mirror in sync anyway */
      }
    }
    if (!Array.isArray(this.store.weexPositions)) this.store.weexPositions = [];
    const idx = this.store.weexPositions.findIndex((p) => p._id === id);
    if (idx === -1) return null;
    this.store.weexPositions[idx] = {
      ...this.store.weexPositions[idx],
      ...patch,
      _id: this.store.weexPositions[idx]._id,
      updatedAt,
    };
    this.saveDiskStore();
    return this.store.weexPositions[idx];
  }

  public async deleteWeexPosition(id: string): Promise<boolean> {
    if (this.isMongoConnected && mongoose.connection.readyState === 1) {
      try {
        await WeexPositionModel.deleteOne({ _id: id });
      } catch {
        /* ignore */
      }
    }
    if (!Array.isArray(this.store.weexPositions)) return false;
    const before = this.store.weexPositions.length;
    this.store.weexPositions = this.store.weexPositions.filter((p) => p._id !== id);
    this.saveDiskStore();
    return this.store.weexPositions.length < before;
  }

  public async clearWeexPositions(userId?: string): Promise<void> {
    if (this.isMongoConnected && mongoose.connection.readyState === 1) {
      try {
        await WeexPositionModel.deleteMany(userId ? { userId } : {});
      } catch {
        /* ignore */
      }
    }
    if (!Array.isArray(this.store.weexPositions)) {
      this.store.weexPositions = [];
      return;
    }
    this.store.weexPositions = userId
      ? this.store.weexPositions.filter((p) => p.userId !== userId)
      : [];
    this.saveDiskStore();
  }
}

export const dbRepo = new DatabaseEngine();
