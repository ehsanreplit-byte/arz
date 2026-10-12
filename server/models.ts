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
  cycleNumber: number;
  createdAt: string;
}

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
        serverSelectionTimeoutMS: 4000,
        connectTimeoutMS: 4000,
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
    } catch (err) {
      console.error('Error syncing collections to remote MongoDB:', err);
    }
  }

  public async getDatabaseStatus() {
    const users = await this.getAllUsers();
    const symbols = await this.getSymbols();
    const messages = await this.getTelegramMessages();
    const tgConfig = await this.getTelegramConfig();

    return {
      isRemoteConnected: this.isMongoConnected && mongoose.connection.readyState === 1,
      readyState: mongoose.connection.readyState,
      engineLabel:
        this.isMongoConnected && mongoose.connection.readyState === 1
          ? 'متصل به سرور MongoDB (Mongoose ODM)'
          : 'موتور دیتابیس دائمی MongoDB (ذخیره‌سازی دیسک + Mongoose Schema)',
      activeUri: this.isMongoConnected ? this.maskMongoUri(this.activeUri) : 'mongodb://127.0.0.1:27017/crypto_telegram_admin (Persistent Store)',
      configuredExternalUri: this.maskMongoUri(this.store.mongoUri),
      lastError: this.lastConnectionError,
      collections: {
        users: users.length,
        symbols: symbols.length,
        telegramMessages: messages.length,
        telegramBotConfigured: Boolean(tgConfig?.botToken),
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
    if (this.isMongoConnected && mongoose.connection.readyState === 1) {
      const docs = await AdminUserModel.find().sort({ createdAt: -1 }).lean();
      return docs.map(({ passwordHash, ...rest }) => ({ ...rest, _id: String(rest._id) }));
    }
    return this.store.users.map(({ passwordHash, ...rest }) => rest);
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

  public async clearRegisteredSignals(): Promise<void> {
    if (this.isMongoConnected && mongoose.connection.readyState === 1) {
      await RegisteredSignalModel.deleteMany({});
    }
    this.store.registeredSignals = [];
    this.saveDiskStore();
  }
}

export const dbRepo = new DatabaseEngine();
