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
  isQualified: boolean; // true when matchedSignalsCount >= 2
  buySignalsCount: number;
  sellSignalsCount: number;
  totalSignalsChecked: number;
  matchedSignalsCount: number; // >= 2 => qualified
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
  cycleNumber: number;
  createdAt: string;
  /** true when this qualified signal was pushed straight to the trade engine */
  dispatchedToTrade?: boolean;
  /** outcome of the trade hand-off (Persian message) */
  tradeDispatchNote?: string;
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
  cycleNumber: { type: Number, default: 1 },
  createdAt: { type: String, default: () => new Date().toISOString() },
  dispatchedToTrade: { type: Boolean, default: false },
  tradeDispatchNote: { type: String, default: '' },
  tradeDispatchedAt: { type: String, default: '' },
});

export const RegisteredSignalModel =
  mongoose.models.RegisteredSignal ||
  mongoose.model<IRegisteredSignal & Document>('RegisteredSignal', RegisteredSignalSchema);

// ============================================================================
// 2. Persistent Disk Mirror + Live Mongoose Connection Manager
// ============================================================================

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
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'mongodb_collections.json');

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

  constructor() {
    this.store = this.loadDiskStore();
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

  public async connectMongo(customUri?: string): Promise<{
    connected: boolean;
    mode: 'mongodb_remote' | 'mongodb_local_engine';
    uri: string;
    error?: string;
  }> {
    const targetUri = (customUri !== undefined ? customUri : this.store.mongoUri || process.env.MONGODB_URI || '').trim();
    if (customUri !== undefined) {
      this.store.mongoUri = targetUri;
      this.saveDiskStore();
    }

    if (!targetUri || targetUri === 'MY_MONGODB_URI') {
      this.isMongoConnected = false;
      this.activeUri = 'mongodb://local-persistent-engine:27017/crypto_telegram_admin';
      return {
        connected: true,
        mode: 'mongodb_local_engine',
        uri: this.activeUri,
      };
    }

    try {
      if (mongoose.connection.readyState === 1) {
        await mongoose.disconnect();
      }
      await mongoose.connect(targetUri, {
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
      });
      this.isMongoConnected = true;
      this.activeUri = targetUri;
      this.lastConnectionError = '';

      // Synchronize initial disk collections to remote MongoDB if remote is empty
      await this.syncToRemoteMongo();

      return {
        connected: true,
        mode: 'mongodb_remote',
        uri: this.maskMongoUri(targetUri),
      };
    } catch (err: any) {
      this.isMongoConnected = false;
      this.lastConnectionError = err?.message || 'خطا در برقراری ارتباط با سرور خارجی MongoDB';
      this.activeUri = 'mongodb://local-persistent-engine:27017/crypto_telegram_admin';
      return {
        connected: false,
        mode: 'mongodb_local_engine',
        uri: this.maskMongoUri(targetUri),
        error: this.lastConnectionError,
      };
    }
  }

  private maskMongoUri(uri: string): string {
    if (!uri) return '';
    return uri.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:****@');
  }

  private async syncToRemoteMongo(): Promise<void> {
    if (!this.isMongoConnected) return;
    try {
      const userCount = await AdminUserModel.countDocuments();
      if (userCount === 0 && this.store.users.length > 0) {
        for (const u of this.store.users) {
          await AdminUserModel.updateOne({ email: u.email }, { $setOnInsert: u }, { upsert: true });
        }
      }

      const symbolCount = await CryptoSymbolModel.countDocuments();
      if (symbolCount === 0 && this.store.symbols.length > 0) {
        for (const s of this.store.symbols) {
          await CryptoSymbolModel.updateOne({ symbol: s.symbol }, { $setOnInsert: s }, { upsert: true });
        }
      }

      const configCount = await TelegramConfigModel.countDocuments();
      if (configCount === 0 && this.store.telegramConfig) {
        const { _id, ...rest } = this.store.telegramConfig;
        await TelegramConfigModel.create(rest);
      }

      // Demo trading data must be mirrored too. Without this, everything that
      // was written while MongoDB was still connecting stayed only in the disk
      // mirror and disappeared as soon as reads switched over to MongoDB.
      const acctCount = await TradeAccountModel.countDocuments();
      if (acctCount === 0 && Array.isArray(this.store.tradeAccounts)) {
        for (const a of this.store.tradeAccounts) {
          // keep the SAME _id as the disk mirror, otherwise the very same row
          // would come back twice (once per store) from the merged reader
          await TradeAccountModel.updateOne(
            { _id: a._id },
            { $setOnInsert: { ...a, _id: a._id } },
            { upsert: true }
          );
        }
      }

      const posCount = await PositionModel.countDocuments();
      if (posCount === 0 && Array.isArray(this.store.positions)) {
        for (const p of this.store.positions) {
          await PositionModel.updateOne(
            { _id: p._id },
            { $setOnInsert: { ...p, _id: p._id } },
            { upsert: true }
          );
        }
      }

      const sigCount = await RegisteredSignalModel.countDocuments();
      if (sigCount === 0 && Array.isArray(this.store.registeredSignals)) {
        for (const s of this.store.registeredSignals) {
          const { _id, ...rest } = s;
          await RegisteredSignalModel.updateOne(
            { _id: s._id },
            { $setOnInsert: { ...rest, _id: s._id } },
            { upsert: true }
          );
        }
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

  public async getDatabaseStatus() {
    const users = await this.getAllUsers();
    const symbols = await this.getSymbols();
    const messages = await this.getTelegramMessages();
    const tgConfig = await this.getTelegramConfig();
    const signals = await this.getRegisteredSignals();

    const remoteReady = this.isMongoConnected && mongoose.connection.readyState === 1;
    const { host, dbName } = this.parseMongoUri(this.activeUri);
    const configured = this.parseMongoUri(this.store.mongoUri || process.env.MONGODB_URI || '');

    return {
      isRemoteConnected: remoteReady,
      readyState: mongoose.connection.readyState,
      statusLabel: remoteReady ? 'اتصال برقرار است' : 'اتصال برقرار نیست',
      engineLabel: remoteReady
        ? 'متصل به سرور MongoDB Atlas (Mongoose ODM)'
        : 'موتور دیتابیس داخلی (ذخیره‌سازی دیسک موقت — با هر دیپلوی پاک می‌شود)',
      clusterHost: remoteReady ? host : configured.host || '—',
      databaseName: remoteReady ? dbName : configured.dbName || '—',
      hasConfiguredUri: Boolean((this.store.mongoUri || process.env.MONGODB_URI || '').trim()),
      activeUri: this.isMongoConnected ? this.maskMongoUri(this.activeUri) : '—',
      configuredExternalUri: this.maskMongoUri(this.store.mongoUri),
      lastError: this.lastConnectionError,
      collections: {
        users: users.length,
        symbols: symbols.length,
        telegramMessages: messages.length,
        telegramBotConfigured: Boolean(tgConfig?.botToken),
        registeredSignals: signals.length,
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
        const docs = await RegisteredSignalModel.find().sort({ createdAt: -1 }).limit(1200).lean();
        for (const d of docs) byId.set(String((d as any)._id), { ...(d as any), _id: String((d as any)._id) });
      } catch {
        /* ignore */
      }
    }
    return [...byId.values()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  private async getRegisteredSignalsLegacy(): Promise<IRegisteredSignal[]> {
    if (this.isMongoConnected && mongoose.connection.readyState === 1) {
      const docs = await RegisteredSignalModel.find().sort({ createdAt: -1 }).limit(1200).lean();
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
    if (this.store.registeredSignals.length > 1200) {
      this.store.registeredSignals = this.store.registeredSignals.slice(0, 1200);
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
    note: string
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
        tradeDispatchedAt: at,
      });
    }
    if (!Array.isArray(this.store.registeredSignals)) return;
    const target = this.store.registeredSignals.find((s) => s._id === id);
    if (target) {
      target.dispatchedToTrade = dispatched;
      target.tradeDispatchNote = note;
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
}

export const dbRepo = new DatabaseEngine();
