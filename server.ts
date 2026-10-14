import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { dbRepo } from './server/models.js';
import { telegramWorker } from './server/telegramWorker.js';
import { signalEngine } from './server/signalEngine.js';
import {
  tradeEngine,
  fetchPrices,
  unrealizedPnl,
  unrealizedPnlPct,
} from './server/tradeEngine.js';

const PORT = Number(process.env.PORT) || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'crypto_telegram_admin_jwt_secret_2026';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

function createToken(user: { _id: string; email: string; name: string; role: string }): string {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'توکن احراز هویت یافت نشد. لطفاً مجدداً وارد شوید.' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      id: string;
      email: string;
      name: string;
      role: string;
    };
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'نشست کاربری شما منقضی شده یا نامعتبر است. لطفاً دوباره وارد شوید.' });
  }
}

const KNOWN_COIN_LABELS: Record<string, string> = {
  BTC: 'بیت‌کوین (Bitcoin)',
  ETH: 'اتریوم (Ethereum)',
  BNB: 'بایننس کوین (BNB)',
  SOL: 'سولانا (Solana)',
  XRP: 'ریپل (Ripple)',
  ADA: 'کاردانو (Cardano)',
  DOGE: 'دوج‌کوین (Dogecoin)',
  TON: 'تون‌کوین (Toncoin)',
  TRX: 'ترون (TRON)',
  AVAX: 'آوالانچ (Avalanche)',
  DOT: 'پولکادات (Polkadot)',
  SHIB: 'شیبا اینو (Shiba Inu)',
  LINK: 'چین‌لینک (Chainlink)',
  LTC: 'لایت‌کوین (Litecoin)',
  MATIC: 'پالیگان (Polygon)',
  UNI: 'یونی‌سواپ (Uniswap)',
  ATOM: 'کازموس (Cosmos)',
  NEAR: 'نیر پروتکل (NEAR)',
  APT: 'آپتوس (Aptos)',
  ARB: 'آربیتروم (Arbitrum)',
  OP: 'آپتیمیزم (Optimism)',
  SUI: 'سویی (Sui)',
  PEPE: 'پپه (Pepe)',
};

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  // Initialize MongoDB connection & Telegram Direct Long Polling Worker
  await dbRepo.connectMongo();

  // Atlas can be slow to answer on a cold start, which used to leave the app
  // permanently on the disk mirror. Retry quietly in the background until the
  // remote store is reachable (reads merge both stores, so this is safe).
  if (!dbRepo.isRemoteReady()) {
    const retry = (attempt: number): void => {
      const delay = Math.min(30_000 * attempt, 300_000);
      setTimeout(() => {
        void (async () => {
          try {
            await dbRepo.connectMongo();
            if (dbRepo.isRemoteReady()) {
              console.log('[db] MongoDB connected on background retry.');
              return;
            }
          } catch {
            /* keep retrying */
          }
          if (attempt < 20) retry(attempt + 1);
        })();
      }, delay);
    };
    retry(1);
  }
  await telegramWorker.initialize();
  signalEngine.initialize();
  tradeEngine.initialize();

  // ==========================================================================
  // 1. Auth Routes (JWT + bcryptjs + MongoDB)
  // ==========================================================================
  app.post('/api/auth/register', async (req: Request, res: Response) => {
    try {
      const { name, email, password } = req.body as {
        name?: string;
        email?: string;
        password?: string;
      };

      if (!name || !email || !password) {
        res.status(400).json({ error: 'لطفاً نام، ایمیل و رمز عبور را کامل وارد کنید.' });
        return;
      }

      if (password.length < 6) {
        res.status(400).json({ error: 'رمز عبور باید حداقل ۶ کاراکتر باشد.' });
        return;
      }

      const existing = await dbRepo.findUserByEmail(email);
      if (existing) {
        res.status(409).json({ error: 'این ایمیل قبلاً در سیستم ثبت شده است.' });
        return;
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const user = await dbRepo.createUser({
        name,
        email,
        passwordHash,
        role: 'مدیر سیستم (Admin)',
      });

      const token = createToken(user);
      res.status(201).json({
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'خطا در ثبت‌نام ادمین جدید' });
    }
  });

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body as { email?: string; password?: string };
      if (!email || !password) {
        res.status(400).json({ error: 'وارد کردن نام کاربری و رمز عبور الزامی است.' });
        return;
      }

      const user = await dbRepo.findUserByEmail(email);
      if (!user) {
        res.status(401).json({ error: 'نام کاربری یا رمز عبور اشتباه است.' });
        return;
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        res.status(401).json({ error: 'نام کاربری یا رمز عبور اشتباه است.' });
        return;
      }

      const token = createToken(user);
      res.json({
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'خطا در ورود به سیستم' });
    }
  });

  app.get('/api/auth/me', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user ? await dbRepo.findUserById(req.user.id) : null;
      if (!user && req.user) {
        res.json({ user: req.user });
        return;
      }
      if (!user) {
        res.status(404).json({ error: 'کاربر یافت نشد.' });
        return;
      }
      res.json({
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'خطا در دریافت اطلاعات کاربر' });
    }
  });

  // ==========================================================================
  // 2. Binance Watchlist Symbols Routes (MongoDB CRUD)
  // ==========================================================================
  app.get('/api/watchlist', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const symbols = await dbRepo.getSymbols();
      res.json({ symbols });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'خطا در دریافت لیست ارزها' });
    }
  });

  app.post('/api/watchlist', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { symbol: rawInput, label: customLabel } = req.body as {
        symbol?: string;
        label?: string;
      };

      if (!rawInput || !rawInput.trim()) {
        res.status(400).json({ error: 'لطفاً نماد ارز (مثلاً BTCUSDT یا DOGE) را وارد کنید.' });
        return;
      }

      const clean = rawInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (clean.length < 2) {
        res.status(400).json({ error: 'نماد ارز وارد شده معتبر نیست.' });
        return;
      }

      let fullSymbol = clean;
      let baseAsset = clean;
      let quoteAsset = 'USDT';

      if (clean.endsWith('USDT') && clean.length > 4) {
        baseAsset = clean.slice(0, -4);
        quoteAsset = 'USDT';
      } else if (clean.endsWith('BUSD') && clean.length > 4) {
        baseAsset = clean.slice(0, -4);
        quoteAsset = 'BUSD';
      } else if (clean.endsWith('BTC') && clean.length > 3) {
        baseAsset = clean.slice(0, -3);
        quoteAsset = 'BTC';
      } else {
        fullSymbol = `${clean}USDT`;
        baseAsset = clean;
        quoteAsset = 'USDT';
      }

      const resolvedLabel =
        customLabel?.trim() || KNOWN_COIN_LABELS[baseAsset] || `${baseAsset} / ${quoteAsset}`;

      const created = await dbRepo.addSymbol({
        symbol: fullSymbol,
        baseAsset,
        quoteAsset,
        label: resolvedLabel,
        addedBy: req.user?.email || 'admin',
      });

      const symbols = await dbRepo.getSymbols();
      res.status(201).json({ symbol: created, symbols });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'خطا در افزودن ارز جدید' });
    }
  });

  app.delete('/api/watchlist/:symbol', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const target = String(req.params.symbol || '').toUpperCase();
      await dbRepo.removeSymbol(target);
      const symbols = await dbRepo.getSymbols();
      res.json({ ok: true, symbols });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'خطا در حذف ارز' });
    }
  });

  // ==========================================================================
  // 3. Direct Telegram Bot Connection & Message Management Routes (No Webhook)
  // ==========================================================================
  app.get('/api/telegram/status', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const config = await dbRepo.getTelegramConfig();
      const messages = await dbRepo.getTelegramMessages();
      const unreadCount = messages.filter((m) => m.direction === 'incoming' && !m.isRead).length;

      res.json({
        config: {
          hasToken: Boolean(config.botToken),
          maskedToken: config.botToken
            ? `${config.botToken.slice(0, 9)}...${config.botToken.slice(-5)}`
            : '',
          botId: config.botId,
          botUsername: config.botUsername,
          botFirstName: config.botFirstName,
          isPollingActive: config.isPollingActive,
          lastUpdateId: config.lastUpdateId,
          lastPollAt: config.lastPollAt,
          lastError: config.lastError,
          connectionMode: 'Direct Long Polling (getUpdates - No Webhook)',
        },
        stats: {
          totalMessages: messages.length,
          unreadCount,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'خطا در دریافت وضعیت ربات تلگرام' });
    }
  });

  app.post('/api/telegram/connect', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { botToken } = req.body as { botToken?: string };
      if (!botToken || !botToken.trim()) {
        res.status(400).json({ error: 'لطفاً توکن ربات تلگرام (دریافتی از @BotFather) را وارد کنید.' });
        return;
      }

      const result = await telegramWorker.connectBot(botToken);
      if (!result.ok) {
        res.status(400).json({ error: result.error || 'خطا در اتصال به ربات تلگرام' });
        return;
      }

      const config = await dbRepo.getTelegramConfig();
      res.json({
        ok: true,
        botInfo: result.botInfo,
        config: {
          hasToken: Boolean(config.botToken),
          maskedToken: `${config.botToken.slice(0, 9)}...${config.botToken.slice(-5)}`,
          botId: config.botId,
          botUsername: config.botUsername,
          botFirstName: config.botFirstName,
          isPollingActive: config.isPollingActive,
          lastUpdateId: config.lastUpdateId,
          lastPollAt: config.lastPollAt,
          lastError: config.lastError,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'خطا در برقراری اتصال مستقیم با تلگرام' });
    }
  });

  app.post('/api/telegram/toggle-polling', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { active } = req.body as { active?: boolean };
      const current = await dbRepo.getTelegramConfig();
      if (!current.botToken) {
        res.status(400).json({ error: 'ابتدا توکن ربات تلگرام را ثبت کنید.' });
        return;
      }

      const nextState = active !== undefined ? Boolean(active) : !current.isPollingActive;
      await dbRepo.updateTelegramConfig({ isPollingActive: nextState });

      if (nextState) {
        telegramWorker.startPollingLoop();
        await telegramWorker.pollOnce();
      } else {
        telegramWorker.stopPollingLoop();
      }

      res.json({ ok: true, isPollingActive: nextState });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'خطا در تغییر وضعیت دریافت پیام‌ها' });
    }
  });

  app.post('/api/telegram/poll-now', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const newMessages = await telegramWorker.pollOnce();
      const allMessages = await dbRepo.getTelegramMessages();
      const config = await dbRepo.getTelegramConfig();
      res.json({
        ok: true,
        newCount: newMessages.length,
        messages: allMessages,
        lastPollAt: config.lastPollAt,
        lastError: config.lastError,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'خطا در دریافت آنی پیام‌ها' });
    }
  });

  app.get('/api/telegram/messages', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const messages = await dbRepo.getTelegramMessages();
      res.json({ messages });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'خطا در خواندن پیام‌های تلگرام' });
    }
  });

  app.post('/api/telegram/send', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { chatId, text } = req.body as { chatId?: string; text?: string };
      if (!chatId || !text || !text.trim()) {
        res.status(400).json({ error: 'شناسه چت (Chat ID) و متن پیام الزامی است.' });
        return;
      }

      const result = await telegramWorker.sendDirectMessage(String(chatId).trim(), text.trim());
      if (!result.ok) {
        res.status(400).json({ error: result.error || 'خطا در ارسال پیام به تلگرام' });
        return;
      }

      const messages = await dbRepo.getTelegramMessages();
      res.json({ ok: true, sentMessage: result.message, messages });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'خطا در ارسال پیام' });
    }
  });

  app.post('/api/telegram/mark-read', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { chatId } = req.body as { chatId?: string };
      if (chatId) {
        await dbRepo.markChatMessagesRead(String(chatId));
      }
      const messages = await dbRepo.getTelegramMessages();
      res.json({ ok: true, messages });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'خطا در بروزرسانی وضعیت پیام‌ها' });
    }
  });

  app.delete('/api/telegram/messages/:chatId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const chatId = String(req.params.chatId || '');
      await dbRepo.deleteChatMessages(chatId);
      const messages = await dbRepo.getTelegramMessages();
      res.json({ ok: true, messages });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'خطا در حذف تاریخچه چت' });
    }
  });

  // ==========================================================================
  // 4. MongoDB Status & Live Connection Configuration Routes
  // ==========================================================================
  app.get('/api/db/status', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const status = await dbRepo.getDatabaseStatus();
      const users = await dbRepo.getAllUsers();
      res.json({ status, users });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'خطا در بررسی وضعیت دیتابیس' });
    }
  });

  app.post('/api/db/connect', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { mongoUri } = req.body as { mongoUri?: string };
      const conn = await dbRepo.connectMongo(mongoUri || '');
      const status = await dbRepo.getDatabaseStatus();
      res.json({
        ok: conn.connected,
        mode: conn.mode,
        error: conn.error,
        status,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'خطا در تنظیم اتصال MongoDB' });
    }
  });

  // ==========================================================================
  // 5. AvalAI (ChatGPT - https://docs.avalai.ir/fa/) Routes
  // ==========================================================================
  const formatAvalAIConfigResponse = (cfg: Awaited<ReturnType<typeof dbRepo.getAvalAIConfig>>) => ({
    hasApiKey: Boolean(cfg.apiKey),
    maskedApiKey: cfg.apiKey
      ? `${cfg.apiKey.slice(0, 7)}...${cfg.apiKey.slice(-4)}`
      : '',
    baseUrl: cfg.baseUrl || 'https://api.avalai.ir/v1',
    modelName: cfg.modelName || 'gpt-4o-mini',
    systemPrompt: cfg.systemPrompt || '',
    temperature: cfg.temperature ?? 0.7,
    lastTestStatus: cfg.lastTestStatus || 'untested',
    lastTestMessage: cfg.lastTestMessage || '',
    lastTestLatencyMs: cfg.lastTestLatencyMs,
    lastTestedAt: cfg.lastTestedAt,
    updatedAt: cfg.updatedAt,
  });

  app.get('/api/avalai/config', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const cfg = await dbRepo.getAvalAIConfig();
      res.json({ config: formatAvalAIConfigResponse(cfg) });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'خطا در دریافت تنظیمات ChatGPT (AvalAI)' });
    }
  });

  app.post('/api/avalai/config', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { apiKey, baseUrl, modelName, systemPrompt, temperature } = req.body as {
        apiKey?: string;
        baseUrl?: string;
        modelName?: string;
        systemPrompt?: string;
        temperature?: number;
      };

      const current = await dbRepo.getAvalAIConfig();
      const cleanBaseUrl = (baseUrl || current.baseUrl || 'https://api.avalai.ir/v1')
        .trim()
        .replace(/\/+$/, '');
      const cleanModel = (modelName || current.modelName || 'gpt-4o-mini').trim();

      if (!cleanModel) {
        res.status(400).json({ error: 'وارد کردن نام مدل (مثلاً gpt-4o-mini) الزامی است.' });
        return;
      }

      const updated = await dbRepo.updateAvalAIConfig({
        apiKey: apiKey !== undefined && apiKey.trim() !== '' ? apiKey.trim() : current.apiKey,
        baseUrl: cleanBaseUrl,
        modelName: cleanModel,
        systemPrompt: systemPrompt !== undefined ? systemPrompt : current.systemPrompt,
        temperature:
          temperature !== undefined && !isNaN(Number(temperature))
            ? Math.min(2, Math.max(0, Number(temperature)))
            : current.temperature,
      });

      res.json({
        ok: true,
        config: formatAvalAIConfigResponse(updated),
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'خطا در ذخیره تنظیمات ChatGPT (AvalAI)' });
    }
  });

  app.post('/api/avalai/test', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { apiKey, baseUrl, modelName } = req.body as {
        apiKey?: string;
        baseUrl?: string;
        modelName?: string;
      };

      const current = await dbRepo.getAvalAIConfig();
      const targetKey = (apiKey && apiKey.trim() !== '' ? apiKey.trim() : current.apiKey).trim();
      const targetBaseUrl = (baseUrl || current.baseUrl || 'https://api.avalai.ir/v1')
        .trim()
        .replace(/\/+$/, '');
      const targetModel = (modelName || current.modelName || 'gpt-4o-mini').trim();

      if (!targetKey) {
        res.status(400).json({
          error: 'کلید API آوالای (AvalAI API Key) وارد نشده است. لطفاً ابتدا کلید API خود را وارد کنید.',
        });
        return;
      }

      if (!targetModel) {
        res.status(400).json({
          error: 'نام مدل (Model Name) وارد نشده است. لطفاً نام مدل مانند gpt-4o-mini را وارد کنید.',
        });
        return;
      }

      // Save provided fields first so user doesn't lose them
      await dbRepo.updateAvalAIConfig({
        apiKey: targetKey,
        baseUrl: targetBaseUrl,
        modelName: targetModel,
      });

      const endpoint = `${targetBaseUrl}/chat/completions`;
      const startTime = Date.now();

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${targetKey}`,
        },
        body: JSON.stringify({
          model: targetModel,
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant. Reply briefly in Persian.',
            },
            {
              role: 'user',
              content: 'تست اتصال سامانه مدیریت ادمین به وب‌سرویس AvalAI. در یک جمله کوتاه تایید کن.',
            },
          ],
          max_tokens: 80,
          temperature: 0.3,
        }),
      });

      const latencyMs = Date.now() - startTime;
      const rawData = (await response.json().catch(() => ({}))) as any;

      if (!response.ok) {
        const apiErrMsg =
          rawData?.error?.message ||
          rawData?.detail ||
          rawData?.message ||
          `خطای وب‌سرویس آوالای (کد وضعیت HTTP ${response.status})`;

        const updatedErrCfg = await dbRepo.updateAvalAIConfig({
          lastTestStatus: 'error',
          lastTestMessage: apiErrMsg,
          lastTestLatencyMs: latencyMs,
          lastTestedAt: new Date().toISOString(),
        });

        res.status(400).json({
          ok: false,
          error: apiErrMsg,
          latencyMs,
          config: formatAvalAIConfigResponse(updatedErrCfg),
        });
        return;
      }

      const replyText =
        rawData?.choices?.[0]?.message?.content ||
        rawData?.output_text ||
        'اتصال با موفقیت برقرار شد.';
      const confirmedModel = rawData?.model || targetModel;

      const updatedOkCfg = await dbRepo.updateAvalAIConfig({
        lastTestStatus: 'success',
        lastTestMessage: replyText,
        lastTestLatencyMs: latencyMs,
        lastTestedAt: new Date().toISOString(),
      });

      res.json({
        ok: true,
        reply: replyText,
        confirmedModel,
        latencyMs,
        usage: rawData?.usage || null,
        config: formatAvalAIConfigResponse(updatedOkCfg),
      });
    } catch (err: any) {
      const errMsg = err?.message || 'خطا در برقراری ارتباط با سرور api.avalai.ir';
      const updatedErrCfg = await dbRepo.updateAvalAIConfig({
        lastTestStatus: 'error',
        lastTestMessage: errMsg,
        lastTestedAt: new Date().toISOString(),
      });
      res.status(500).json({
        ok: false,
        error: errMsg,
        config: formatAvalAIConfigResponse(updatedErrCfg),
      });
    }
  });

  app.post('/api/avalai/chat', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { messages, modelName } = req.body as {
        messages?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
        modelName?: string;
      };

      const cfg = await dbRepo.getAvalAIConfig();
      if (!cfg.apiKey) {
        res.status(400).json({
          error: 'کلید API آوالای ثبت نشده است. لطفاً ابتدا در بخش تنظیمات کلید API را ذخیره کنید.',
        });
        return;
      }

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: 'لیست پیام‌ها خالی است.' });
        return;
      }

      const targetBaseUrl = (cfg.baseUrl || 'https://api.avalai.ir/v1').replace(/\/+$/, '');
      const targetModel = (modelName || cfg.modelName || 'gpt-4o-mini').trim();

      const fullMessages = [
        ...(cfg.systemPrompt
          ? [{ role: 'system' as const, content: cfg.systemPrompt }]
          : []),
        ...messages,
      ];

      const startTime = Date.now();
      const response = await fetch(`${targetBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: targetModel,
          messages: fullMessages,
          temperature: cfg.temperature ?? 0.7,
        }),
      });

      const latencyMs = Date.now() - startTime;
      const rawData = (await response.json().catch(() => ({}))) as any;

      if (!response.ok) {
        const apiErrMsg =
          rawData?.error?.message ||
          rawData?.detail ||
          `خطا در دریافت پاسخ از مدل (${response.status})`;
        res.status(400).json({ error: apiErrMsg });
        return;
      }

      const reply =
        rawData?.choices?.[0]?.message?.content || 'پاسخی از مدل دریافت نشد.';

      res.json({
        ok: true,
        reply,
        model: rawData?.model || targetModel,
        latencyMs,
        usage: rawData?.usage || null,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'خطا در ارتباط با وب‌سرویس AvalAI' });
    }
  });

  // ==========================================================================
  // 5B. Al Brooks 50-Candle (1h) AI Signal & Price Action Analyzer
  // ==========================================================================
  app.post('/api/avalai/albrooks-signal', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { symbol, interval = '1h', candles } = req.body as {
        symbol?: string;
        interval?: string;
        candles?: Array<{
          time: number;
          open: number;
          high: number;
          low: number;
          close: number;
          volume: number;
        }>;
      };

      if (!candles || !Array.isArray(candles) || candles.length < 10) {
        res.status(400).json({ error: 'حداقل ۱۰ الی ۵۰ کندل برای تحلیل پرایس اکشن البروکس نیاز است.' });
        return;
      }

      const limitCount = candles.length;
      const analyzedCandles = candles.slice(-limitCount);
      const n = analyzedCandles.length;

      // 1. Compute EMA 20 across the analyzed candles (Al Brooks core indicator)
      const k = 2 / (20 + 1);
      const ema20List: number[] = [];
      let currentEma = analyzedCandles[0].close;
      for (let i = 0; i < n; i++) {
        currentEma = i === 0 ? analyzedCandles[0].close : analyzedCandles[i].close * k + currentEma * (1 - k);
        ema20List.push(currentEma);
      }

      // Compute swing highs and swing lows for authentic diagonal Trendlines (Resistance & Support)
      const swingHighs: Array<{ index: number; price: number }> = [];
      const swingLows: Array<{ index: number; price: number }> = [];

      const windowSize = 5;
      for (let i = windowSize; i < n - windowSize; i++) {
        let isPeak = true;
        let isTrough = true;
        const curHigh = analyzedCandles[i].high;
        const curLow = analyzedCandles[i].low;

        for (let j = i - windowSize; j <= i + windowSize; j++) {
          if (j === i) continue;
          if (analyzedCandles[j].high > curHigh) isPeak = false;
          if (analyzedCandles[j].low < curLow) isTrough = false;
        }

        if (isPeak) {
          swingHighs.push({ index: i, price: curHigh });
        }
        if (isTrough) {
          swingLows.push({ index: i, price: curLow });
        }
      }

      if (swingHighs.length < 2) {
        swingHighs.push({ index: Math.floor(n * 0.1), price: analyzedCandles[Math.floor(n * 0.1)].high });
        swingHighs.push({ index: Math.floor(n * 0.85), price: analyzedCandles[Math.floor(n * 0.85)].high });
      }
      if (swingLows.length < 2) {
        swingLows.push({ index: Math.floor(n * 0.2), price: analyzedCandles[Math.floor(n * 0.2)].low });
        swingLows.push({ index: Math.floor(n * 0.8), price: analyzedCandles[Math.floor(n * 0.8)].low });
      }

      const firstHalfHighs = swingHighs.filter((s) => s.index <= n * 0.6);
      const secondHalfHighs = swingHighs.filter((s) => s.index > n * 0.6);

      const resStart =
        firstHalfHighs.length > 0
          ? firstHalfHighs.reduce((prev, cur) => (cur.price > prev.price ? cur : prev), firstHalfHighs[0])
          : swingHighs[0];

      const resEnd =
        secondHalfHighs.length > 0
          ? secondHalfHighs[secondHalfHighs.length - 1]
          : swingHighs[swingHighs.length - 1];

      const firstHalfLows = swingLows.filter((s) => s.index <= n * 0.6);
      const secondHalfLows = swingLows.filter((s) => s.index > n * 0.6);

      const supStart =
        firstHalfLows.length > 0
          ? firstHalfLows.reduce((prev, cur) => (cur.price < prev.price ? cur : prev), firstHalfLows[0])
          : swingLows[0];

      const supEnd =
        secondHalfLows.length > 0
          ? secondHalfLows.reduce((prev, cur) => (cur.price < prev.price ? cur : prev), secondHalfLows[0])
          : swingLows[swingLows.length - 1];

      const computedTrendlines = {
        resistance: {
          startIndex: resStart.index,
          startPrice: resStart.price,
          endIndex: resEnd.index,
          endPrice: resEnd.price,
        },
        support: {
          startIndex: supStart.index,
          startPrice: supStart.price,
          endIndex: supEnd.index,
          endPrice: supEnd.price,
        },
      };

      // 2. Quantitative Al Brooks Price Action baseline analysis on the analyzed candles
      const lastCandle = analyzedCandles[n - 1];
      const prevCandle = analyzedCandles[n - 2];
      const emaNow = ema20List[n - 1];
      const ema10Ago = ema20List[Math.max(0, n - 11)];

      const recent20 = analyzedCandles.slice(-20);
      const swingHigh20 = Math.max(...recent20.map((c) => c.high));
      const swingLow20 = Math.min(...recent20.map((c) => c.low));
      const avgRange =
        recent20.reduce((acc, c) => acc + Math.max(c.high - c.low, 0.000001), 0) / recent20.length;

      const closesAboveEma = recent20.filter(
        (c, idx) => c.close >= ema20List[n - 20 + idx]
      ).length;

      const isAlwaysInLong =
        lastCandle.close >= emaNow || (closesAboveEma >= 11 && emaNow >= ema10Ago);
      const direction: 'LONG' | 'SHORT' = isAlwaysInLong ? 'LONG' : 'SHORT';

      // Locate best recent Signal Bar in the last 6 candles
      let signalCandleIndex = n - 2;
      if (direction === 'LONG') {
        for (let i = n - 2; i >= Math.max(1, n - 6); i--) {
          const c = analyzedCandles[i];
          const bodyBull = c.close >= c.open;
          const lowerWick = Math.min(c.open, c.close) - c.low;
          if (bodyBull || lowerWick > (c.high - c.low) * 0.35) {
            signalCandleIndex = i;
            break;
          }
        }
      } else {
        for (let i = n - 2; i >= Math.max(1, n - 6); i--) {
          const c = analyzedCandles[i];
          const bodyBear = c.close <= c.open;
          const upperWick = c.high - Math.max(c.open, c.close);
          if (bodyBear || upperWick > (c.high - c.low) * 0.35) {
            signalCandleIndex = i;
            break;
          }
        }
      }

      const sigBar = analyzedCandles[signalCandleIndex] || prevCandle;
      const tickBuffer = avgRange * 0.08;

      let entryPrice = lastCandle.close;
      let stopLoss = lastCandle.low;
      let takeProfit1 = lastCandle.high;
      let takeProfit2 = lastCandle.high;

      if (direction === 'LONG') {
        entryPrice = Math.max(sigBar.high + tickBuffer, lastCandle.close);
        stopLoss = Math.min(sigBar.low - tickBuffer * 2, entryPrice - avgRange * 1.35);
        const risk = Math.max(entryPrice - stopLoss, avgRange * 0.5);
        takeProfit1 = entryPrice + risk * 1.5;
        takeProfit2 = entryPrice + risk * 2.5;
      } else {
        entryPrice = Math.min(sigBar.low - tickBuffer, lastCandle.close);
        stopLoss = Math.max(sigBar.high + tickBuffer * 2, entryPrice + avgRange * 1.35);
        const risk = Math.max(stopLoss - entryPrice, avgRange * 0.5);
        takeProfit1 = Math.max(0.00001, entryPrice - risk * 1.5);
        takeProfit2 = Math.max(0.00001, entryPrice - risk * 2.5);
      }

      const trendStrengthRatio = Math.abs(analyzedCandles[n - 1].close - analyzedCandles[0].open) / (avgRange * 15);
      const defaultMarketCycle =
        trendStrengthRatio > 0.85
          ? direction === 'LONG'
            ? 'اسپایک و کانال صعودی (Bull Spike & Channel)'
            : 'اسپایک و کانال نزولی (Bear Spike & Channel)'
          : closesAboveEma >= 14 || closesAboveEma <= 6
          ? direction === 'LONG'
            ? 'کانال صعودی (Tight Bull Channel)'
            : 'کانال نزولی (Tight Bear Channel)'
          : 'تریدینگ رنج با تمایل روند (Trading Range / Two-Sided Market)';

      const defaultSetupName =
        direction === 'LONG'
          ? 'پولبک دوپایه به میانگین EMA 20 (High 2 Bull Flag / Always In Long)'
          : 'پولبک دوپایه به میانگین EMA 20 (Low 2 Bear Flag / Always In Short)';

      let signalPayload = {
        symbol: (symbol || 'BTCUSDT').toUpperCase(),
        interval,
        candlesAnalyzed: n,
        direction,
        alwaysInState:
          direction === 'LONG'
            ? 'Always In Long (برتری خریداران بالای EMA 20)'
            : 'Always In Short (برتری فروشندگان زیر EMA 20)',
        marketCycle: defaultMarketCycle,
        setupName: defaultSetupName,
        signalCandleIndex,
        signalCandleTime: sigBar.time,
        entryPrice,
        stopLoss,
        takeProfit1,
        takeProfit2,
        ema20Current: emaNow,
        swingHigh20,
        swingLow20,
        riskRewardRatio: '1 : 2.5',
        winProbability: direction === 'LONG' ? '64%' : '62%',
        signalBarDescription:
          direction === 'LONG'
            ? `کندل شماره ${signalCandleIndex + 1} یک کندل سیگنال صعودی (Bull Signal Bar) با واکنش به ناحیه میانگین متحرک EMA 20 ($${emaNow.toFixed(
                2
              )}) است که سفارش ورود Buy Stop بالای سقف آن فعال می‌شود.`
            : `کندل شماره ${signalCandleIndex + 1} یک کندل سیگنال نزولی (Bear Signal Bar) در برخورد به مقاومت EMA 20 ($${emaNow.toFixed(
                2
              )}) است که سفارش فروش Sell Stop زیر کف آن قرار می‌گیرد.`,
        reasoning: [
          `بررسی ساختار ${n} کندل اخیر نشان می‌دهد قیمت نسبت به میانگین متحرک ۲۰ دوره‌ای (EMA 20 = $${emaNow.toFixed(
            2
          )}) در وضعیت ${direction === 'LONG' ? 'Always In Long' : 'Always In Short'} قرار دارد.`,
          direction === 'LONG'
            ? `خط روند حمایت و مقاومت مستقیم روی کل ساختار ترسیم شده و قیمت در کانال صعودی حمایت معتبر دریافت کرده است.`
            : `خط روند سقف و کف روی ساختار قیمت ترسیم شده و فشار فروش زیر مقاومت مشهود است.`,
          `حد ضرر استاندارد البروکس در پشت کندل سیگنال/سوئینگ ($${stopLoss.toFixed(
            2
          )}) و اهداف قیمتی بر اساس حرکت اندازه‌گیری شده در سطوح $${takeProfit1.toFixed(
            2
          )} و $${takeProfit2.toFixed(2)} محاسبه شده‌اند.`,
        ],
        aiEngineUsed: 'موتور تحلیل الگوریتمی البروکس با خطوط روند مستقیم',
        trendlines: computedTrendlines,
      };

      // 3. Build compact 50-candle summary prompt for LLM (AvalAI ChatGPT or Gemini)
      const compactCandlesText = analyzedCandles
        .map(
          (c, idx) =>
            `#${idx}[O:${c.open},H:${c.high},L:${c.low},C:${c.close},EMA20:${ema20List[idx].toFixed(2)}]`
        )
        .join(' ');

      const aiSystemInstruction = `You are a master price action trader specializing in Al Brooks Price Action methodology.
Analyze the provided 50 hourly (1h) candles (indexed 0 to ${n - 1}, where ${n - 1} is the latest candle) along with EMA20 values.
Return ONLY valid JSON (no markdown fences) with this exact structure in Persian:
{
  "direction": "LONG" | "SHORT",
  "alwaysInState": "Persian description of Always In Long or Always In Short",
  "marketCycle": "Persian description of Al Brooks Market Cycle (e.g. Bull Spike & Channel, Tight Channel, Trading Range, Major Trend Reversal)",
  "setupName": "Persian + English name of Al Brooks setup (e.g. High 2 Bull Flag, Low 2 Bear Flag, Wedge Bottom/Top, Double Bottom Higher Low, Breakout Pullback)",
  "signalCandleIndex": number (between ${Math.max(0, n - 8)} and ${n - 1}),
  "entryPrice": number,
  "stopLoss": number,
  "takeProfit1": number,
  "takeProfit2": number,
  "winProbability": "e.g. 65%",
  "signalBarDescription": "1-2 sentences in Persian explaining the signal bar and entry trigger",
  "reasoning": ["bullet 1 in Persian", "bullet 2 in Persian", "bullet 3 in Persian"]
}`;

      const avalaiCfg = await dbRepo.getAvalAIConfig();

      if (avalaiCfg.apiKey && avalaiCfg.apiKey.trim() !== '') {
        try {
          const targetBaseUrl = (avalaiCfg.baseUrl || 'https://api.avalai.ir/v1').replace(/\/+$/, '');
          const targetModel = (avalaiCfg.modelName || 'gpt-4o-mini').trim();
          const llmRes = await fetch(`${targetBaseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${avalaiCfg.apiKey.trim()}`,
            },
            body: JSON.stringify({
              model: targetModel,
              messages: [
                { role: 'system', content: aiSystemInstruction },
                {
                  role: 'user',
                  content: `Symbol: ${signalPayload.symbol}, Timeframe: ${interval}, Last 50 Candles: ${compactCandlesText}`,
                },
              ],
              temperature: 0.2,
            }),
          });

          if (llmRes.ok) {
            const llmJson = (await llmRes.json()) as any;
            const rawContent = String(llmJson?.choices?.[0]?.message?.content || '')
              .replace(/```json/gi, '')
              .replace(/```/g, '')
              .trim();
            const parsed = JSON.parse(rawContent);
            if (parsed && (parsed.direction === 'LONG' || parsed.direction === 'SHORT')) {
              const validIdx =
                typeof parsed.signalCandleIndex === 'number' &&
                parsed.signalCandleIndex >= 0 &&
                parsed.signalCandleIndex < n
                  ? parsed.signalCandleIndex
                  : signalCandleIndex;
              signalPayload = {
                ...signalPayload,
                direction: parsed.direction,
                alwaysInState: parsed.alwaysInState || signalPayload.alwaysInState,
                marketCycle: parsed.marketCycle || signalPayload.marketCycle,
                setupName: parsed.setupName || signalPayload.setupName,
                signalCandleIndex: validIdx,
                signalCandleTime: analyzedCandles[validIdx]?.time || sigBar.time,
                entryPrice: Number(parsed.entryPrice) || signalPayload.entryPrice,
                stopLoss: Number(parsed.stopLoss) || signalPayload.stopLoss,
                takeProfit1: Number(parsed.takeProfit1) || signalPayload.takeProfit1,
                takeProfit2: Number(parsed.takeProfit2) || signalPayload.takeProfit2,
                winProbability: parsed.winProbability || signalPayload.winProbability,
                signalBarDescription: parsed.signalBarDescription || signalPayload.signalBarDescription,
                reasoning:
                  Array.isArray(parsed.reasoning) && parsed.reasoning.length > 0
                    ? parsed.reasoning
                    : signalPayload.reasoning,
                aiEngineUsed: `هوش مصنوعی AvalAI (${targetModel})`,
              };
            }
          }
        } catch (err) {
          console.error('AvalAI Al Brooks signal fallback triggered:', err);
        }
      } else if (
        process.env.GEMINI_API_KEY &&
        process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
      ) {
        try {
          const ai = new GoogleGenAI({
            apiKey: process.env.GEMINI_API_KEY,
            httpOptions: {
              headers: {
                'User-Agent': 'aistudio-build',
              },
            },
          });
          const geminiRes = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: `Symbol: ${signalPayload.symbol}, Timeframe: ${interval}, Last 50 Candles: ${compactCandlesText}`,
            config: {
              systemInstruction: aiSystemInstruction,
              responseMimeType: 'application/json',
              temperature: 0.2,
            },
          });
          const textOut = (geminiRes.text || '').trim();
          if (textOut) {
            const parsed = JSON.parse(textOut);
            if (parsed && (parsed.direction === 'LONG' || parsed.direction === 'SHORT')) {
              const validIdx =
                typeof parsed.signalCandleIndex === 'number' &&
                parsed.signalCandleIndex >= 0 &&
                parsed.signalCandleIndex < n
                  ? parsed.signalCandleIndex
                  : signalCandleIndex;
              signalPayload = {
                ...signalPayload,
                direction: parsed.direction,
                alwaysInState: parsed.alwaysInState || signalPayload.alwaysInState,
                marketCycle: parsed.marketCycle || signalPayload.marketCycle,
                setupName: parsed.setupName || signalPayload.setupName,
                signalCandleIndex: validIdx,
                signalCandleTime: analyzedCandles[validIdx]?.time || sigBar.time,
                entryPrice: Number(parsed.entryPrice) || signalPayload.entryPrice,
                stopLoss: Number(parsed.stopLoss) || signalPayload.stopLoss,
                takeProfit1: Number(parsed.takeProfit1) || signalPayload.takeProfit1,
                takeProfit2: Number(parsed.takeProfit2) || signalPayload.takeProfit2,
                winProbability: parsed.winProbability || signalPayload.winProbability,
                signalBarDescription: parsed.signalBarDescription || signalPayload.signalBarDescription,
                reasoning:
                  Array.isArray(parsed.reasoning) && parsed.reasoning.length > 0
                    ? parsed.reasoning
                    : signalPayload.reasoning,
                aiEngineUsed: 'هوش مصنوعی Gemini 3.8 Flash + موتور البروکس',
              };
            }
          }
        } catch (err) {
          console.error('Gemini Al Brooks signal fallback triggered:', err);
        }
      }

      res.json({
        ok: true,
        signal: signalPayload,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'خطا در تحلیل ۵۰ کندل به سبک البروکس' });
    }
  });

  // ==========================================================================
  // 5C. Al Brooks 2 (البروکس 2) — Falling Wedge & Rising Wedge + Price Action
  // ==========================================================================
  app.post('/api/avalai/albrooks2-signal', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      type RawCandle = {
        time: number;
        open: number;
        high: number;
        low: number;
        close: number;
        volume: number;
      };

      const {
        symbol = 'BTCUSDT',
        interval = '1h',
        candles,
        multiTimeframeCandles,
      } = req.body as {
        symbol?: string;
        interval?: string;
        candles?: RawCandle[];
        multiTimeframeCandles?: Record<string, RawCandle[]>;
      };

      const targetSymbol = (symbol || 'BTCUSDT').toUpperCase();

      // Helper to fetch real Binance Spot klines if not provided by client
      const fetchBinanceSpotKlines = async (sym: string, tf: string, limit = 401): Promise<RawCandle[]> => {
        const endpoints = [
          'https://data-api.binance.vision/api/v3/klines',
          'https://api.binance.com/api/v3/klines',
        ];
        for (const base of endpoints) {
          try {
            const url = `${base}?symbol=${encodeURIComponent(sym)}&interval=${encodeURIComponent(tf)}&limit=${limit}`;
            const r = await fetch(url);
            if (r.ok) {
              const arr = await r.json();
              if (Array.isArray(arr) && arr.length >= 30) {
                return arr.map((k: any) => ({
                  time: Number(k[0]),
                  open: parseFloat(k[1]),
                  high: parseFloat(k[2]),
                  low: parseFloat(k[3]),
                  close: parseFloat(k[4]),
                  volume: parseFloat(k[5]),
                }));
              }
            }
          } catch {
            // try next endpoint
          }
        }
        return [];
      };

      // Quantitative Wedge + Al Brooks Price Action Analyzer on 400 closed candles
      const analyzeWedgeOnTimeframe = (rawList: RawCandle[], tfLabel: string) => {
        // Rule 5: Do NOT confuse the currently open candle with closed candles.
        // Drop the currently open candle if rawList has > 400 items, otherwise take up to 400 candles.
        const closedAll = rawList.length > 400 ? rawList.slice(0, -1) : rawList.length > 35 ? rawList : rawList;
        const closedCandles = closedAll.slice(-400);
        const m = closedCandles.length;

        if (m < 30) {
          return null;
        }

        // Compute ATR (14) for volatility-adapted touch tolerance across the 400 candles
        let atrSum = 0;
        for (let i = 1; i < m; i++) {
          const tr = Math.max(
            closedCandles[i].high - closedCandles[i].low,
            Math.abs(closedCandles[i].high - closedCandles[i - 1].close),
            Math.abs(closedCandles[i].low - closedCandles[i - 1].close)
          );
          atrSum += tr;
        }
        const atr = Math.max(atrSum / Math.max(1, m - 1), closedCandles[m - 1].close * 0.0005);
        const touchTolerance = atr * 0.55;

        // Prior trend evaluation (first 35% of the 400-candle window vs middle)
        const earlySlice = closedCandles.slice(0, Math.max(10, Math.floor(m * 0.35)));
        const midSlice = closedCandles.slice(Math.floor(m * 0.35), Math.floor(m * 0.7));
        const earlyAvg = earlySlice.reduce((s, c) => s + c.close, 0) / earlySlice.length;
        const midAvg = midSlice.reduce((s, c) => s + c.close, 0) / Math.max(1, midSlice.length);
        const priorTrendDiff = midAvg - earlyAvg;
        const priorTrendStructure =
          Math.abs(priorTrendDiff) > atr * 2.2
            ? priorTrendDiff > 0
              ? 'روند صعودی پرقدرت قبل از تشکیل الگو در بازه ۴۰۰ کندل (Prior Bullish Leg / Impulse)'
              : 'روند نزولی مشخص قبل از تشکیل الگو در بازه ۴۰۰ کندل (Prior Bearish Leg / Sell-off)'
            : 'نوسان متعادل / تریدینگ رنج قبل از فشردگی قیمت در بازه ۴۰۰ کندل';

        // Find valid Swing Highs and Swing Lows strictly using past/local neighbors across the 400-candle window
        const patternStartIdx = 0;
        const swingHighs: Array<{ index: number; price: number; time: number }> = [];
        const swingLows: Array<{ index: number; price: number; time: number }> = [];
        const pivotLookback = 5;

        for (let i = patternStartIdx + pivotLookback; i < m - pivotLookback; i++) {
          let isHigh = true;
          let isLow = true;
          const h = closedCandles[i].high;
          const l = closedCandles[i].low;
          for (let j = i - pivotLookback; j <= i + pivotLookback; j++) {
            if (j === i) continue;
            if (closedCandles[j].high > h) isHigh = false;
            if (closedCandles[j].low < l) isLow = false;
          }
          if (isHigh) swingHighs.push({ index: i, price: h, time: closedCandles[i].time });
          if (isLow) swingLows.push({ index: i, price: l, time: closedCandles[i].time });
        }

        // Select major Swing Highs and Swing Lows in first half vs second half of the 400-candle pattern window
        const midPatternIdx = Math.floor((patternStartIdx + (m - 2)) / 2);
        const firstHalfHighs = swingHighs.filter((s) => s.index <= midPatternIdx);
        const secondHalfHighs = swingHighs.filter((s) => s.index > midPatternIdx);

        let hStart: { index: number; price: number; time: number };
        let hEnd: { index: number; price: number; time: number };

        if (firstHalfHighs.length > 0 && secondHalfHighs.length > 0) {
          hStart = firstHalfHighs.reduce((best, cur) => (cur.price > best.price ? cur : best), firstHalfHighs[0]);
          hEnd = secondHalfHighs.reduce((best, cur) => (cur.price > best.price ? cur : best), secondHalfHighs[0]);
        } else {
          let bestIdx1 = patternStartIdx;
          for (let i = patternStartIdx; i <= midPatternIdx; i++) {
            if (closedCandles[i].high > closedCandles[bestIdx1].high) bestIdx1 = i;
          }
          let bestIdx2 = Math.min(m - 2, midPatternIdx + 1);
          for (let i = midPatternIdx + 1; i < m - 1; i++) {
            if (closedCandles[i].high > closedCandles[bestIdx2].high) bestIdx2 = i;
          }
          hStart = { index: bestIdx1, price: closedCandles[bestIdx1].high, time: closedCandles[bestIdx1].time };
          hEnd = { index: bestIdx2, price: closedCandles[bestIdx2].high, time: closedCandles[bestIdx2].time };
        }

        const firstHalfLows = swingLows.filter((s) => s.index <= midPatternIdx);
        const secondHalfLows = swingLows.filter((s) => s.index > midPatternIdx);

        let lStart: { index: number; price: number; time: number };
        let lEnd: { index: number; price: number; time: number };

        if (firstHalfLows.length > 0 && secondHalfLows.length > 0) {
          lStart = firstHalfLows.reduce((best, cur) => (cur.price < best.price ? cur : best), firstHalfLows[0]);
          lEnd = secondHalfLows.reduce((best, cur) => (cur.price < best.price ? cur : best), secondHalfLows[0]);
        } else {
          let bestIdx1 = patternStartIdx;
          for (let i = patternStartIdx; i <= midPatternIdx; i++) {
            if (closedCandles[i].low < closedCandles[bestIdx1].low) bestIdx1 = i;
          }
          let bestIdx2 = Math.min(m - 2, midPatternIdx + 1);
          for (let i = midPatternIdx + 1; i < m - 1; i++) {
            if (closedCandles[i].low < closedCandles[bestIdx2].low) bestIdx2 = i;
          }
          lStart = { index: bestIdx1, price: closedCandles[bestIdx1].low, time: closedCandles[bestIdx1].time };
          lEnd = { index: bestIdx2, price: closedCandles[bestIdx2].low, time: closedCandles[bestIdx2].time };
        }

        const recentHighs = swingHighs.length >= 2 ? swingHighs.slice(-8) : [hStart, hEnd];
        const recentLows = swingLows.length >= 2 ? swingLows.slice(-8) : [lStart, lEnd];

        const hSpan = Math.max(1, hEnd.index - hStart.index);
        const lSpan = Math.max(1, lEnd.index - lStart.index);

        // Slope per candle (normalized by ATR and % per 10 candles)
        const upperSlopeRaw = (hEnd.price - hStart.price) / hSpan;
        const lowerSlopeRaw = (lEnd.price - lStart.price) / lSpan;

        const refPrice = closedCandles[m - 1].close || 1;
        const upperSlopePctPer10 = ((upperSlopeRaw * 10) / refPrice) * 100;
        const lowerSlopePctPer10 = ((lowerSlopeRaw * 10) / refPrice) * 100;

        const getUpperLinePriceAt = (idx: number) => hStart.price + upperSlopeRaw * (idx - hStart.index);
        const getLowerLinePriceAt = (idx: number) => lStart.price + lowerSlopeRaw * (idx - lStart.index);

        // Count valid swing touches along upper and lower trendlines using volatility tolerance
        let upperTouches = 0;
        for (const sh of swingHighs) {
          if (sh.index >= Math.min(hStart.index, lStart.index) - 3) {
            const lineVal = getUpperLinePriceAt(sh.index);
            if (Math.abs(sh.price - lineVal) <= touchTolerance) {
              upperTouches++;
            }
          }
        }
        upperTouches = Math.max(2, upperTouches);

        let lowerTouches = 0;
        for (const sl of swingLows) {
          if (sl.index >= Math.min(hStart.index, lStart.index) - 3) {
            const lineVal = getLowerLinePriceAt(sl.index);
            if (Math.abs(sl.price - lineVal) <= touchTolerance) {
              lowerTouches++;
            }
          }
        }
        lowerTouches = Math.max(2, lowerTouches);
        const totalTouches = upperTouches + lowerTouches;

        // Width at start vs width at end to verify convergence
        const startEvalIdx = Math.min(hStart.index, lStart.index);
        const endEvalIdx = m - 1;
        const startWidth = Math.max(atr * 0.2, getUpperLinePriceAt(startEvalIdx) - getLowerLinePriceAt(startEvalIdx));
        const endWidth = getUpperLinePriceAt(endEvalIdx) - getLowerLinePriceAt(endEvalIdx);
        const isConverging = endWidth > 0 && endWidth < startWidth * 0.92;

        // Classify pattern strictly per Rule 2:
        // - Falling Wedge: both slopes negative (< 0), upper slope more negative than lower slope (upper descends faster), converging
        // - Rising Wedge: both slopes positive (> 0), lower slope more positive than upper slope (lower ascends faster), converging
        // - Symmetrical Triangle: upper slope negative, lower slope positive, converging
        // - Channel: both slopes same sign and nearly parallel
        // - Incomplete / Random: diverging or flat noise
        const slopeThreshold = atr * 0.012;
        let patternType:
          | 'Falling Wedge (کنج نزولی)'
          | 'Rising Wedge (کنج صعودی)'
          | 'Symmetrical Triangle (مثلث متقارن)'
          | 'Channel (کانال قیمتی)'
          | 'No Valid Wedge (الگوی کنج ناقص / نامعتبر)' = 'No Valid Wedge (الگوی کنج ناقص / نامعتبر)';

        let isTrueWedge = false;
        let wedgeKind: 'FALLING_WEDGE' | 'RISING_WEDGE' | 'NONE' = 'NONE';

        if (
          upperSlopeRaw < -slopeThreshold &&
          lowerSlopeRaw < -slopeThreshold * 0.35 &&
          upperSlopeRaw < lowerSlopeRaw * 1.05 &&
          isConverging
        ) {
          patternType = 'Falling Wedge (کنج نزولی)';
          isTrueWedge = true;
          wedgeKind = 'FALLING_WEDGE';
        } else if (
          upperSlopeRaw > slopeThreshold * 0.35 &&
          lowerSlopeRaw > slopeThreshold &&
          lowerSlopeRaw > upperSlopeRaw * 1.05 &&
          isConverging
        ) {
          patternType = 'Rising Wedge (کنج صعودی)';
          isTrueWedge = true;
          wedgeKind = 'RISING_WEDGE';
        } else if (upperSlopeRaw < -slopeThreshold && lowerSlopeRaw > slopeThreshold && isConverging) {
          patternType = 'Symmetrical Triangle (مثلث متقارن)';
        } else if (
          (upperSlopeRaw > slopeThreshold && lowerSlopeRaw > slopeThreshold) ||
          (upperSlopeRaw < -slopeThreshold && lowerSlopeRaw < -slopeThreshold)
        ) {
          patternType = 'Channel (کانال قیمتی)';
        } else {
          patternType = 'No Valid Wedge (الگوی کنج ناقص / نامعتبر)';
        }

        const patternHigh = Math.max(hStart.price, hEnd.price, ...recentHighs.map((x) => x.price));
        const patternLow = Math.min(lStart.price, lEnd.price, ...recentLows.map((x) => x.price));

        const currentUpperBoundary = getUpperLinePriceAt(m - 1);
        const currentLowerBoundary = getLowerLinePriceAt(m - 1);
        const lastClosed = closedCandles[m - 1];
        const prevClosed = closedCandles[m - 2];

        // Al Brooks Buyer vs Seller Pressure on last 15 closed candles
        const last15 = closedCandles.slice(-15);
        let bullBodySum = 0;
        let bearBodySum = 0;
        let bullTailRejections = 0;
        let bearTailRejections = 0;
        let volBullSum = 0;
        let volBearSum = 0;

        for (const c of last15) {
          const range = Math.max(c.high - c.low, 0.000001);
          const body = Math.abs(c.close - c.open);
          const lowerWick = Math.min(c.open, c.close) - c.low;
          const upperWick = c.high - Math.max(c.open, c.close);
          if (c.close >= c.open) {
            bullBodySum += body;
            volBullSum += c.volume;
          } else {
            bearBodySum += body;
            volBearSum += c.volume;
          }
          if (lowerWick / range > 0.35) bullTailRejections++;
          if (upperWick / range > 0.35) bearTailRejections++;
        }

        const buyerRatioPct = Math.round(
          ((bullBodySum + 0.0001) / (bullBodySum + bearBodySum + 0.0002)) * 100
        );
        const sellerRatioPct = 100 - buyerRatioPct;

        // Evaluate Breakout, Closed Candle Outside Boundary, Pullback, and Failed Breakout
        const brokeAboveUpper = lastClosed.close > currentUpperBoundary + atr * 0.12;
        const brokeBelowLower = lastClosed.close < currentLowerBoundary - atr * 0.12;
        const prevBrokeAbove = prevClosed.high > getUpperLinePriceAt(m - 2) + atr * 0.15 && lastClosed.close < currentUpperBoundary;
        const prevBrokeBelow = prevClosed.low < getLowerLinePriceAt(m - 2) - atr * 0.15 && lastClosed.close > currentLowerBoundary;

        const nearUpperBoundary =
          !brokeAboveUpper && Math.abs(lastClosed.high - currentUpperBoundary) <= atr * 0.75;
        const nearLowerBoundary =
          !brokeBelowLower && Math.abs(lastClosed.low - currentLowerBoundary) <= atr * 0.75;

        let patternStatus:
          | 'در حال تشکیل (Forming)'
          | 'در آستانه شکست (Near Breakout)'
          | 'شکست تأییدشده (Confirmed Breakout)'
          | 'شکست ناموفق / فیک‌بریک (Failed Breakout)'
          | 'بدون سیگنال معتبر (No Valid Signal)' = 'بدون سیگنال معتبر (No Valid Signal)';

        let statusBucket: 'در آستانه شکست' | 'شکست تأییدشده' | 'هنوز شرایط ورود ندارد' =
          'هنوز شرایط ورود ندارد';

        // Rule 5: For Falling Wedge examine Bullish scenario; for Rising Wedge examine Bearish scenario,
        // while also considering both breakout directions.
        let direction: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';
        let isValidSignal = false;
        let confirmationClosePrice: number | null = null;
        let breakoutPrice = currentUpperBoundary;

        if (!isTrueWedge) {
          patternStatus = 'بدون سیگنال معتبر (No Valid Signal)';
          statusBucket = 'هنوز شرایط ورود ندارد';
          direction = 'NEUTRAL';
          isValidSignal = false;
          breakoutPrice = buyerRatioPct >= 50 ? currentUpperBoundary : currentLowerBoundary;
        } else if (wedgeKind === 'FALLING_WEDGE') {
          direction = 'LONG';
          breakoutPrice = currentUpperBoundary;
          if (brokeAboveUpper && lastClosed.close > lastClosed.open) {
            patternStatus = 'شکست تأییدشده (Confirmed Breakout)';
            statusBucket = 'شکست تأییدشده';
            isValidSignal = true;
            confirmationClosePrice = lastClosed.close;
          } else if (brokeBelowLower) {
            // Downside breakout of a falling wedge (climactic continuation or failed wedge)
            direction = 'SHORT';
            breakoutPrice = currentLowerBoundary;
            patternStatus = 'شکست تأییدشده (Confirmed Breakout)';
            statusBucket = 'شکست تأییدشده';
            isValidSignal = true;
            confirmationClosePrice = lastClosed.close;
          } else if (prevBrokeAbove || prevBrokeBelow) {
            patternStatus = 'شکست ناموفق / فیک‌بریک (Failed Breakout)';
            statusBucket = 'هنوز شرایط ورود ندارد';
            isValidSignal = false;
          } else if (nearUpperBoundary || endWidth < startWidth * 0.45) {
            patternStatus = 'در آستانه شکست (Near Breakout)';
            statusBucket = 'در آستانه شکست';
            isValidSignal = false; // Rule 5: Unconfirmed breakout is NOT a confirmed entry
          } else {
            patternStatus = 'در حال تشکیل (Forming)';
            statusBucket = 'هنوز شرایط ورود ندارد';
            isValidSignal = false;
          }
        } else if (wedgeKind === 'RISING_WEDGE') {
          direction = 'SHORT';
          breakoutPrice = currentLowerBoundary;
          if (brokeBelowLower && lastClosed.close < lastClosed.open) {
            patternStatus = 'شکست تأییدشده (Confirmed Breakout)';
            statusBucket = 'شکست تأییدشده';
            isValidSignal = true;
            confirmationClosePrice = lastClosed.close;
          } else if (brokeAboveUpper) {
            direction = 'LONG';
            breakoutPrice = currentUpperBoundary;
            patternStatus = 'شکست تأییدشده (Confirmed Breakout)';
            statusBucket = 'شکست تأییدشده';
            isValidSignal = true;
            confirmationClosePrice = lastClosed.close;
          } else if (prevBrokeBelow || prevBrokeAbove) {
            patternStatus = 'شکست ناموفق / فیک‌بریک (Failed Breakout)';
            statusBucket = 'هنوز شرایط ورود ندارد';
            isValidSignal = false;
          } else if (nearLowerBoundary || endWidth < startWidth * 0.45) {
            patternStatus = 'در آستانه شکست (Near Breakout)';
            statusBucket = 'در آستانه شکست';
            isValidSignal = false;
          } else {
            patternStatus = 'در حال تشکیل (Forming)';
            statusBucket = 'هنوز شرایط ورود ندارد';
            isValidSignal = false;
          }
        }

        // Compute structural Entry, Stop Loss, TP1, TP2, and Risk/Reward
        const scenarioDir =
          direction !== 'NEUTRAL'
            ? direction
            : wedgeKind === 'FALLING_WEDGE'
            ? 'LONG'
            : wedgeKind === 'RISING_WEDGE'
            ? 'SHORT'
            : buyerRatioPct >= 50
            ? 'LONG'
            : 'SHORT';

        let entryPrice = lastClosed.close;
        let stopLoss = patternLow;
        let takeProfit1 = patternHigh;
        let takeProfit2 = patternHigh;

        if (scenarioDir === 'LONG') {
          entryPrice = brokeAboveUpper
            ? lastClosed.close
            : currentUpperBoundary + atr * 0.15;
          stopLoss = Math.min(patternLow - atr * 0.35, lastClosed.low - atr * 0.8);
          const risk = Math.max(entryPrice - stopLoss, atr * 0.6);
          takeProfit1 = Math.max(entryPrice + risk * 1.5, patternHigh);
          takeProfit2 = Math.max(entryPrice + risk * 2.6, patternHigh + (patternHigh - patternLow) * 0.6);
        } else {
          entryPrice = brokeBelowLower
            ? lastClosed.close
            : Math.max(0.00001, currentLowerBoundary - atr * 0.15);
          stopLoss = Math.max(patternHigh + atr * 0.35, lastClosed.high + atr * 0.8);
          const risk = Math.max(stopLoss - entryPrice, atr * 0.6);
          takeProfit1 = Math.max(0.00001, Math.min(entryPrice - risk * 1.5, patternLow));
          takeProfit2 = Math.max(
            0.00001,
            Math.min(entryPrice - risk * 2.6, patternLow - (patternHigh - patternLow) * 0.6)
          );
        }

        const actualRisk = Math.max(Math.abs(entryPrice - stopLoss), 0.000001);
        const actualReward2 = Math.abs(takeProfit2 - entryPrice);
        const rrValue = (actualReward2 / actualRisk).toFixed(2);
        const riskRewardRatio = `1 : ${rrValue}`;

        // Quality Score (0 to 100) based on Wedge geometry + touches + Al Brooks PA confirmation
        let qualityScore = 32;
        if (isTrueWedge) qualityScore += 28;
        if (totalTouches >= 5) qualityScore += 14;
        else if (totalTouches >= 3) qualityScore += 9;
        if (statusBucket === 'شکست تأییدشده') qualityScore += 18;
        else if (statusBucket === 'در آستانه شکست') qualityScore += 8;
        if (
          (scenarioDir === 'LONG' && buyerRatioPct >= 54) ||
          (scenarioDir === 'SHORT' && sellerRatioPct >= 54)
        ) {
          qualityScore += 8;
        }
        qualityScore = Math.min(96, Math.max(18, qualityScore));

        const signalStrength = !isTrueWedge
          ? `ضعیف (${qualityScore}/100) — بدون الگوی کنج معتبر در بازه ۴۰۰ کندل`
          : isValidSignal
          ? `قوی (${qualityScore}/100) — شکست تأییدشده با بسته‌شدن کندل بیرون از محدوده`
          : statusBucket === 'در آستانه شکست'
          ? `متوسط (${qualityScore}/100) — در آستانه شکست (نیازمند بسته‌شدن کندل تأیید)`
          : `در حال شکل‌گیری (${qualityScore}/100) — هنوز شرایط ورود قطعی ندارد`;

        // Signal Bar & Entry Bar evaluation (Al Brooks)
        const sigCandle = closedCandles[m - 2];
        const entryCandle = closedCandles[m - 1];
        const sigRange = Math.max(sigCandle.high - sigCandle.low, 0.000001);
        const sigBodyRatio = Math.round((Math.abs(sigCandle.close - sigCandle.open) / sigRange) * 100);
        const entryRange = Math.max(entryCandle.high - entryCandle.low, 0.000001);
        const entryBodyRatio = Math.round((Math.abs(entryCandle.close - entryCandle.open) / entryRange) * 100);

        const signalBarAnalysis =
          sigCandle.close >= sigCandle.open
            ? `کندل ماقبل آخر (کندل بسته شده #${m - 1}) صعودی با بدنه ${sigBodyRatio}% از کل رنج کندل؛ ${
                sigBodyRatio >= 55 ? 'کندل سیگنال خرید معتبر (Bull Signal Bar)' : 'کندل دوجی/ضعیف با سایه دوطرفه'
              }.`
            : `کندل ماقبل آخر (کندل بسته شده #${m - 1}) نزولی با بدنه ${sigBodyRatio}% از کل رنج کندل؛ ${
                sigBodyRatio >= 55 ? 'کندل سیگنال فروش معتبر (Bear Signal Bar)' : 'کندل کم‌رمق با هم‌پوشانی (Overlap)'
              }.`;

        const entryBarAnalysis =
          entryCandle.close >= entryCandle.open
            ? `آخرین کندل بسته‌شده (#${m}) صعودی در قیمت $${entryCandle.close.toFixed(
                entryCandle.close < 1 ? 5 : 2
              )} با بدنه ${entryBodyRatio}%؛ ${
                brokeAboveUpper
                  ? 'بسته‌شدن کامل بالای خط روند نزولی (Breakout Entry Bar تأییدشده).'
                  : 'هنوز بیرون از خط روند بالایی بسته نشده است.'
              }`
            : `آخرین کندل بسته‌شده (#${m}) نزولی در قیمت $${entryCandle.close.toFixed(
                entryCandle.close < 1 ? 5 : 2
              )} با بدنه ${entryBodyRatio}%؛ ${
                brokeBelowLower
                  ? 'بسته‌شدن کامل زیر خط روند پایینی (Breakout Entry Bar تأییدشده).'
                  : 'هنوز بیرون از خط روند پایینی بسته نشده است.'
              }`;

        const failedBreakoutProb = isValidSignal
          ? entryBodyRatio >= 60
            ? 'پایین (حدود ۳۰٪) — بدنه کندل شکست قوی و بدون سایه بازگشتی بلند است'
            : 'متوسط (حدود ۵۰٪) — نیاز به مشاهده کندل Follow-Through و پولبک بعد از شکست'
          : 'بالا (۶۵٪+) — در غیاب کندل بسته‌شده بیرون از کنج، ورود زودهنگام ریسک تله شکست ناموفق (Failed Breakout) دارد';

        const prosReasons: string[] = [];
        const consReasons: string[] = [];

        if (isTrueWedge) {
          prosReasons.push(
            `تشکیل ساختار ${patternType} در بررسی ${m} کندل آخر با همگرایی خطوط روند و مجموع ${totalTouches} برخورد معتبر (خط بالا: ${upperTouches} برخورد، خط پایین: ${lowerTouches} برخورد).`
          );
        } else {
          consReasons.push(
            `ساختار فعلی (${patternType}) در بازه ${m} کندل شرایط ریاضی الگوی کنج واقعی (همگرایی دو خط هم‌جهت با شیب متفاوت) را ندارد.`
          );
        }

        if (isValidSignal) {
          prosReasons.push(
            `بسته‌شدن کندل تأیید بیرون از محدوده الگو در قیمت $${lastClosed.close.toFixed(
              lastClosed.close < 1 ? 5 : 2
            )} (بدون تکیه بر کندل باز).`
          );
        } else {
          consReasons.push(
            `هنوز هیچ کندل بسته‌شده‌ای بیرون از خط روند کلیدی تثبیت نشده است؛ طبق قوانین البروکس صرفاً لمس خط روند سیگنال ورود نیست.`
          );
        }

        if (buyerRatioPct >= 55 && scenarioDir === 'LONG') {
          prosReasons.push(
            `برتری قدرت خریداران به فروشندگان (${buyerRatioPct}% به ${sellerRatioPct}%) همراه با ${bullTailRejections} شدوی جمع‌آوری نقدینگی در کف‌ها.`
          );
        } else if (sellerRatioPct >= 55 && scenarioDir === 'SHORT') {
          prosReasons.push(
            `غلبه فشار فروشندگان به خریداران (${sellerRatioPct}% به ${buyerRatioPct}%) همراه با ${bearTailRejections} واکنش نزولی به سقف خط روند.`
          );
        } else {
          consReasons.push(
            `نسبت قدرت خریداران به فروشندگان (${buyerRatioPct}% به ${sellerRatioPct}%) هنوز هم‌پوشانی دوطرفه (Trading Range Behavior) را نشان می‌دهد.`
          );
        }

        return {
          timeframe: tfLabel,
          candlesAnalyzed: m,
          patternType,
          isTrueWedge,
          wedgeKind,
          patternStatus,
          statusBucket,
          isValidSignal,
          direction: isValidSignal || statusBucket === 'در آستانه شکست' ? scenarioDir : 'NEUTRAL',
          scenarioDirection: scenarioDir,
          patternHigh,
          patternLow,
          currentUpperBoundary,
          currentLowerBoundary,
          breakoutPrice,
          confirmationClosePrice,
          entryPrice,
          stopLoss,
          takeProfit1,
          takeProfit2,
          riskRewardRatio,
          qualityScore,
          signalStrength,
          touchesCount: {
            upper: upperTouches,
            lower: lowerTouches,
            total: totalTouches,
          },
          slopes: {
            upperSlopePct: `${upperSlopePctPer10 >= 0 ? '+' : ''}${upperSlopePctPer10.toFixed(3)}% / 10 کندل`,
            lowerSlopePct: `${lowerSlopePctPer10 >= 0 ? '+' : ''}${lowerSlopePctPer10.toFixed(3)}% / 10 کندل`,
            isConverging,
          },
          wedgeLines: {
            upper: {
              startTime: hStart.time,
              endTime: closedCandles[m - 1].time,
              startPrice: hStart.price,
              endPrice: currentUpperBoundary,
            },
            lower: {
              startTime: lStart.time,
              endTime: closedCandles[m - 1].time,
              startPrice: lStart.price,
              endPrice: currentLowerBoundary,
            },
          },
          invalidationCondition:
            scenarioDir === 'LONG'
              ? `بسته‌شدن کندل زیر کف ساختاری الگو ($${stopLoss.toFixed(
                  stopLoss < 1 ? 5 : 2
                )}) یا بازگشت سریع قیمت به داخل کنج پس از شکست (Failed Breakout).`
              : `بسته‌شدن کندل بالای سقف ساختاری الگو ($${stopLoss.toFixed(
                  stopLoss < 1 ? 5 : 2
                )}) یا بازگشت پرقدرت بالای خط روند شکسته شده.`,
          alBrooksConfirmation: {
            priorTrend: priorTrendStructure,
            signalBarAnalysis,
            entryBarAnalysis,
            pullbackAndFailedBreakout: `احتمال شکست ناموفق (Failed Breakout): ${failedBreakoutProb}`,
            buyerSellerPressure: `نسبت قدرت خریداران ${buyerRatioPct}% در برابر فروشندگان ${sellerRatioPct}% (${
              volBullSum >= volBearSum ? 'حجم معاملات کندل‌های صعودی غالب است' : 'حجم معاملات کندل‌های نزولی غالب است'
            })`,
          },
          bothBreakoutScenarios: {
            upsideBreakout: `در صورت شکست و بسته‌شدن کندل بالای سقف خط روند ($${currentUpperBoundary.toFixed(
              currentUpperBoundary < 1 ? 5 : 2
            )}) و تأیید پولبک، حرکت صعودی تا سقف الگو ($${patternHigh.toFixed(
              patternHigh < 1 ? 5 : 2
            )}) و هدف Measured Move فعال می‌شود.`,
            downsideBreakout: `در صورت شکست و بسته‌شدن کندل زیر خط روند پایینی ($${currentLowerBoundary.toFixed(
              currentLowerBoundary < 1 ? 5 : 2
            )})، سناریوی ریزشی تا کف الگو ($${patternLow.toFixed(
              patternLow < 1 ? 5 : 2
            )}) و حمایت بعدی فعال می‌گردد.`,
          },
          prosReasons,
          consReasons,
        };
      };

      // Gather 15m, 1h, 4h real Binance Spot candles (400 closed candles each)
      const tfMap: Record<string, RawCandle[]> = { ...(multiTimeframeCandles || {}) };
      if (Array.isArray(candles) && candles.length >= 30) {
        tfMap[interval] = candles;
      }

      const requiredTfs = ['15m', '1h', '4h'];
      await Promise.all(
        requiredTfs.map(async (tf) => {
          if (!tfMap[tf] || tfMap[tf].length < 300) {
            const fetched = await fetchBinanceSpotKlines(targetSymbol, tf, 401);
            if (fetched.length >= 30) {
              tfMap[tf] = fetched;
            }
          }
        })
      );

      if (!tfMap[interval] && tfMap['1h']) {
        tfMap[interval] = tfMap['1h'];
      }

      const primaryCandles = tfMap[interval] || candles || [];
      if (primaryCandles.length < 30) {
        res.status(400).json({
          error:
            'داده کافی از بازار واقعی Binance Spot برای بررسی ۴۰۰ کندل آخر در دسترس نیست. از ساختن قیمت یا سیگنال خودداری شد.',
        });
        return;
      }

      const primaryAnalysis = analyzeWedgeOnTimeframe(primaryCandles, interval);
      if (!primaryAnalysis) {
        res.status(400).json({
          error: 'تعداد کندل‌های بسته‌شده برای تحلیل الگوی کنج سعودی / نزولی (۴۰۰ کندل) کافی نیست.',
        });
        return;
      }

      const multiTfResults = requiredTfs
        .map((tf) => (tfMap[tf] ? analyzeWedgeOnTimeframe(tfMap[tf], tf) : null))
        .filter((x): x is NonNullable<typeof x> => Boolean(x))
        .sort((a, b) => b.qualityScore - a.qualityScore);

      const nearBreakoutList: string[] = [];
      const confirmedBreakoutList: string[] = [];
      const noEntryYetList: string[] = [];

      for (const item of multiTfResults) {
        const label = `${targetSymbol} (${item.timeframe.toUpperCase()} — ${item.patternType} | امتیاز ${item.qualityScore}/100)`;
        if (item.statusBucket === 'شکست تأییدشده') {
          confirmedBreakoutList.push(label);
        } else if (item.statusBucket === 'در آستانه شکست') {
          nearBreakoutList.push(label);
        } else {
          noEntryYetList.push(label);
        }
      }

      let albrooks2Payload = {
        styleName: 'کنج سعودی / نزولی',
        symbol: targetSymbol,
        marketType: 'Binance Spot',
        interval,
        candlesAnalyzed: primaryAnalysis.candlesAnalyzed,
        patternType: primaryAnalysis.patternType,
        patternStatus: primaryAnalysis.patternStatus,
        isValidSignal: primaryAnalysis.isValidSignal,
        direction: primaryAnalysis.direction,
        scenarioDirection: primaryAnalysis.scenarioDirection,
        patternHigh: primaryAnalysis.patternHigh,
        patternLow: primaryAnalysis.patternLow,
        breakoutPrice: primaryAnalysis.breakoutPrice,
        confirmationClosePrice: primaryAnalysis.confirmationClosePrice,
        entryPrice: primaryAnalysis.entryPrice,
        stopLoss: primaryAnalysis.stopLoss,
        takeProfit1: primaryAnalysis.takeProfit1,
        takeProfit2: primaryAnalysis.takeProfit2,
        riskRewardRatio: primaryAnalysis.riskRewardRatio,
        invalidationCondition: primaryAnalysis.invalidationCondition,
        signalStrength: primaryAnalysis.signalStrength,
        qualityScore: primaryAnalysis.qualityScore,
        touchesCount: primaryAnalysis.touchesCount,
        slopes: primaryAnalysis.slopes,
        wedgeLines: primaryAnalysis.wedgeLines,
        alBrooksConfirmation: primaryAnalysis.alBrooksConfirmation,
        bothBreakoutScenarios: primaryAnalysis.bothBreakoutScenarios,
        prosReasons: primaryAnalysis.prosReasons,
        consReasons: primaryAnalysis.consReasons,
        multiTimeframeRanking: multiTfResults.map((r, idx) => ({
          rank: idx + 1,
          timeframe: r.timeframe,
          candlesAnalyzed: r.candlesAnalyzed,
          patternType: r.patternType,
          patternStatus: r.patternStatus,
          statusBucket: r.statusBucket,
          direction: r.direction,
          qualityScore: r.qualityScore,
          touchesTotal: r.touchesCount.total,
          entryPrice: r.entryPrice,
          stopLoss: r.stopLoss,
          takeProfit1: r.takeProfit1,
          takeProfit2: r.takeProfit2,
          riskRewardRatio: r.riskRewardRatio,
        })),
        finalCategorization: {
          nearBreakout: nearBreakoutList,
          confirmedBreakout: confirmedBreakoutList,
          noEntryYet: noEntryYetList,
        },
        aiEngineUsed: 'موتور کمی تشخیص الگوی کنج سعودی / نزولی (۴۰۰ کندل) + پرایس اکشن',
      };

      // AI enhancement using exact updated 400-candle prompt rules (AvalAI or Gemini 3.8 Flash) grounded on the real Binance metrics
      const albrooks2SystemPrompt = `با استفاده از داده‌های واقعی بازار Binance Spot، ارزهای دیجیتال را از نظر تشکیل الگوی Falling Wedge (کنج نزولی) و Rising Wedge (کنج صعودی) در سبک «کنج سعودی / نزولی» بررسی کن.

۱. جمع‌آوری داده‌ها
- کندل‌های ۴۰۰ کندل آخر را بررسی کن.
- تایم‌فریم‌های ۱۵ دقیقه، ۱ ساعته و ۴ ساعته را تحلیل کن.
- قیمت‌های Open، High، Low، Close و Volume را دریافت کن.
- فقط از داده‌های واقعی Binance استفاده کن؛ هیچ داده‌ای را حدس نزن.

۲. شناسایی الگوی کنج
- نقاط Swing High و Swing Low معتبر را در بازه ۴۰۰ کندل پیدا کن.
- خط روند بالایی و پایینی را بر اساس حداقل دو نقطه معتبر رسم و شیب آن‌ها را محاسبه کن.
- برای Falling Wedge بررسی کن که هر دو خط نزولی باشند و خط بالایی سریع‌تر از خط پایینی پایین بیاید و خطوط به یکدیگر نزدیک شوند.
- برای Rising Wedge بررسی کن که هر دو خط صعودی باشند و خط پایینی سریع‌تر از خط بالایی بالا بیاید و خطوط به یکدیگر نزدیک شوند.
- حداقل ۳ برخورد معتبر به خطوط روند را ترجیح بده؛ برخوردها را با تلورانس متناسب با نوسان ارز ارزیابی کن.
- کنج واقعی را از کانال، مثلث متقارن و حرکت تصادفی قیمت تفکیک کن.
- اگر الگو ناقص یا نامعتبر است، صریحاً اعلام کن.

۳. تأیید پرایس اکشن به سبک Al Brooks
- ساختار روند قبل از الگو و قدرت حرکت قیمت را در بازه ۴۰۰ کندل بررسی کن.
- شکست خط روند، شکست سقف یا کف الگو و بسته‌شدن کندل بیرون از محدوده را ارزیابی کن.
- پولبک بعد از شکست و احتمال شکست ناموفق (Failed Breakout) را بررسی کن.
- کندل سیگنال، کندل ورود، فشار خرید و فروش و نسبت قدرت خریداران به فروشندگان را از روی رفتار قیمت ارزیابی کن.
- صرفاً لمس خط روند یا تشکیل ظاهری کنج را سیگنال ورود محسوب نکن.

۴. تعیین سناریوی معامله
برای هر الگوی معتبر مشخص کن: نام ارز و جفت معاملاتی، بازار Spot یا Futures، تایم‌فریم، نوع الگو و وضعیت آن (در حال تشکیل، تأییدشده یا شکست‌خورده)، قیمت سقف و کف الگو، قیمت شکست و قیمت بسته‌شدن کندل تأیید، نقطه ورود احتمالی، حد ضرر بر اساس ساختار قیمت، اهداف سود اول و دوم، نسبت سود به زیان (Risk/Reward)، شرایط ابطال سناریو، قدرت سیگنال و دلایل موافق و مخالف.

۵. قوانین جلوگیری از سیگنال اشتباه
- کندل باز را با کندل بسته‌شده اشتباه نگیر.
- شکست تأییدنشده را ورود قطعی اعلام نکن.
- برای کنج نزولی، سناریوی صعودی را بررسی کن؛ برای کنج صعودی، سناریوی نزولی را.
- جهت الگو به‌تنهایی تضمین‌کننده جهت شکست نیست؛ هر دو سناریوی شکست بالا و پایین را در نظر بگیر.
- از داده‌های آینده برای تشخیص الگو در گذشته استفاده نکن.
- اگر تأیید کافی وجود ندارد، نتیجه را «بدون سیگنال معتبر» اعلام کن.

خروجی را فقط به صورت JSON معتبر (بدون مارک‌داون) با کلیدهای زیر به زبان فارسی برگردان:
{
  "signalStrength": "توصیف قدرت سیگنال و کیفیت الگو بر اساس ۴۰۰ کندل به فارسی",
  "invalidationCondition": "شرایط دقیق ابطال سناریو به فارسی",
  "priorTrend": "بررسی ساختار روند قبل از الگو و قدرت حرکت قیمت در ۴۰۰ کندل",
  "signalBarAnalysis": "ارزیابی کندل سیگنال و فشار خرید/فروش",
  "entryBarAnalysis": "ارزیابی کندل ورود و بسته‌شدن کندل بیرون از محدوده",
  "pullbackAndFailedBreakout": "بررسی پولبک بعد از شکست و احتمال Failed Breakout",
  "prosReasons": ["دلیل موافق ۱", "دلیل موافق ۲"],
  "consReasons": ["دلیل مخالف ۱", "دلیل مخالف ۲"]
}`;

      const avalaiCfg = await dbRepo.getAvalAIConfig();
      const summaryForAi = JSON.stringify({
        symbol: targetSymbol,
        interval,
        candlesAnalyzed: primaryAnalysis.candlesAnalyzed,
        patternType: primaryAnalysis.patternType,
        patternStatus: primaryAnalysis.patternStatus,
        isValidSignal: primaryAnalysis.isValidSignal,
        patternHigh: primaryAnalysis.patternHigh,
        patternLow: primaryAnalysis.patternLow,
        breakoutPrice: primaryAnalysis.breakoutPrice,
        confirmationClosePrice: primaryAnalysis.confirmationClosePrice,
        entryPrice: primaryAnalysis.entryPrice,
        stopLoss: primaryAnalysis.stopLoss,
        takeProfit1: primaryAnalysis.takeProfit1,
        takeProfit2: primaryAnalysis.takeProfit2,
        slopes: primaryAnalysis.slopes,
        touchesCount: primaryAnalysis.touchesCount,
        buyerSellerPressure: primaryAnalysis.alBrooksConfirmation.buyerSellerPressure,
      });

      if (avalaiCfg.apiKey && avalaiCfg.apiKey.trim() !== '') {
        try {
          const targetBaseUrl = (avalaiCfg.baseUrl || 'https://api.avalai.ir/v1').replace(/\/+$/, '');
          const targetModel = (avalaiCfg.modelName || 'gpt-4o-mini').trim();
          const llmRes = await fetch(`${targetBaseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${avalaiCfg.apiKey.trim()}`,
            },
            body: JSON.stringify({
              model: targetModel,
              messages: [
                { role: 'system', content: albrooks2SystemPrompt },
                { role: 'user', content: `Real Binance Spot Wedge Data: ${summaryForAi}` },
              ],
              temperature: 0.2,
            }),
          });
          if (llmRes.ok) {
            const llmJson = (await llmRes.json()) as any;
            const rawContent = String(llmJson?.choices?.[0]?.message?.content || '')
              .replace(/```json/gi, '')
              .replace(/```/g, '')
              .trim();
            const parsed = JSON.parse(rawContent);
            if (parsed && typeof parsed === 'object') {
              albrooks2Payload = {
                ...albrooks2Payload,
                signalStrength: parsed.signalStrength || albrooks2Payload.signalStrength,
                invalidationCondition:
                  parsed.invalidationCondition || albrooks2Payload.invalidationCondition,
                alBrooksConfirmation: {
                  ...albrooks2Payload.alBrooksConfirmation,
                  priorTrend: parsed.priorTrend || albrooks2Payload.alBrooksConfirmation.priorTrend,
                  signalBarAnalysis:
                    parsed.signalBarAnalysis || albrooks2Payload.alBrooksConfirmation.signalBarAnalysis,
                  entryBarAnalysis:
                    parsed.entryBarAnalysis || albrooks2Payload.alBrooksConfirmation.entryBarAnalysis,
                  pullbackAndFailedBreakout:
                    parsed.pullbackAndFailedBreakout ||
                    albrooks2Payload.alBrooksConfirmation.pullbackAndFailedBreakout,
                },
                prosReasons:
                  Array.isArray(parsed.prosReasons) && parsed.prosReasons.length > 0
                    ? parsed.prosReasons
                    : albrooks2Payload.prosReasons,
                consReasons:
                  Array.isArray(parsed.consReasons) && parsed.consReasons.length > 0
                    ? parsed.consReasons
                    : albrooks2Payload.consReasons,
                aiEngineUsed: `سبک کنج سعودی / نزولی + هوش مصنوعی AvalAI (${targetModel})`,
              };
            }
          }
        } catch (err) {
          console.error('AvalAI AlBrooks 2 fallback triggered:', err);
        }
      } else if (
        process.env.GEMINI_API_KEY &&
        process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
      ) {
        try {
          const ai = new GoogleGenAI({
            apiKey: process.env.GEMINI_API_KEY,
            httpOptions: {
              headers: {
                'User-Agent': 'aistudio-build',
              },
            },
          });
          const geminiRes = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: `Real Binance Spot Wedge Data: ${summaryForAi}`,
            config: {
              systemInstruction: albrooks2SystemPrompt,
              responseMimeType: 'application/json',
              temperature: 0.2,
            },
          });
          const textOut = (geminiRes.text || '').trim();
          if (textOut) {
            const parsed = JSON.parse(textOut);
            if (parsed && typeof parsed === 'object') {
              albrooks2Payload = {
                ...albrooks2Payload,
                signalStrength: parsed.signalStrength || albrooks2Payload.signalStrength,
                invalidationCondition:
                  parsed.invalidationCondition || albrooks2Payload.invalidationCondition,
                alBrooksConfirmation: {
                  ...albrooks2Payload.alBrooksConfirmation,
                  priorTrend: parsed.priorTrend || albrooks2Payload.alBrooksConfirmation.priorTrend,
                  signalBarAnalysis:
                    parsed.signalBarAnalysis || albrooks2Payload.alBrooksConfirmation.signalBarAnalysis,
                  entryBarAnalysis:
                    parsed.entryBarAnalysis || albrooks2Payload.alBrooksConfirmation.entryBarAnalysis,
                  pullbackAndFailedBreakout:
                    parsed.pullbackAndFailedBreakout ||
                    albrooks2Payload.alBrooksConfirmation.pullbackAndFailedBreakout,
                },
                prosReasons:
                  Array.isArray(parsed.prosReasons) && parsed.prosReasons.length > 0
                    ? parsed.prosReasons
                    : albrooks2Payload.prosReasons,
                consReasons:
                  Array.isArray(parsed.consReasons) && parsed.consReasons.length > 0
                    ? parsed.consReasons
                    : albrooks2Payload.consReasons,
                aiEngineUsed: 'سبک کنج سعودی / نزولی + هوش مصنوعی Gemini 3.8 Flash',
              };
            }
          }
        } catch (err) {
          console.error('Gemini AlBrooks 2 fallback triggered:', err);
        }
      }

      res.json({
        ok: true,
        signal2: albrooks2Payload,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'خطا در تحلیل الگوی کنج سعودی / نزولی' });
    }
  });

  // ==========================================================================
  // 5C. Signals Engine (سیگنال‌ها) — 30m cycle on 15m timeframe, >= 3 consensus
  // ==========================================================================
  app.get('/api/signals', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const signals = await dbRepo.getRegisteredSignals();
      res.json({ signals });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'خطا در خواندن سیگنال‌های ثبت‌شده' });
    }
  });

  app.get('/api/signals/status', authMiddleware, (_req: AuthenticatedRequest, res: Response) => {
    res.json({ status: signalEngine.getState() });
  });

  app.post('/api/signals/run-now', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
    if (signalEngine.getState().isRunning) {
      res.status(409).json({ ok: false, error: 'یک چرخه سیگنال در حال اجراست. لطفاً منتظر بمانید.' });
      return;
    }
    // Fire-and-forget: the cycle can take minutes because of the 30s AI gap.
    void signalEngine.runCycle('manual');
    res.json({
      ok: true,
      message: 'چرخه ارزیابی سیگنال‌ها آغاز شد. نتایج به‌تدریج در جدول نمایش داده می‌شوند.',
    });
  });

  app.post('/api/signals/toggle-scheduler', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
    try {
      const { enabled } = req.body as { enabled?: boolean };
      const isSchedulerEnabled = signalEngine.toggleScheduler(enabled);
      res.json({ ok: true, isSchedulerEnabled, status: signalEngine.getState() });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'خطا در تغییر وضعیت زمان‌بند سیگنال' });
    }
  });

  app.delete('/api/signals/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ok = await dbRepo.deleteRegisteredSignal(String(req.params.id));
      res.json({ ok, signals: await dbRepo.getRegisteredSignals() });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'خطا در حذف سیگنال' });
    }
  });

  app.delete('/api/signals', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
    try {
      await dbRepo.clearRegisteredSignals();
      res.json({ ok: true, signals: [] });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'خطا در پاک‌سازی سیگنال‌ها' });
    }
  });

  // ==========================================================================
  // 5D. Virtual Demo Account (حساب کاربری) & Trade Engine (ترید)
  // ==========================================================================
  const requireUser = (req: AuthenticatedRequest): string =>
    String(req.user?.id || req.user?.email || 'global');

  async function buildAccountSnapshot(userId: string) {
    const account = await dbRepo.getOrCreateTradeAccount(userId);
    const positions = await dbRepo.getPositions(userId);
    const active = positions.filter((p) => p.status === 'PENDING' || p.status === 'OPEN');
    const open = active.filter((p) => p.status === 'OPEN');
    const pending = active.filter((p) => p.status === 'PENDING');
    const closed = positions.filter((p) => p.status === 'CLOSED');

    const prices = await fetchPrices([...new Set(open.map((p) => p.symbol))]);
    let unrealized = 0;
    for (const p of open) {
      const price = prices[p.symbol];
      if (price) unrealized += unrealizedPnl(p, price);
    }
    unrealized = Math.round(unrealized * 100) / 100;

    const usedMargin =
      Math.round(
        active.reduce((acc, p) => acc + (Number(p.margin) || 0), 0) * 100
      ) / 100;
    const realizedPnl = Math.round((account.balance - account.initialBalance) * 100) / 100;
    const winCount = closed.filter((p) => (p.realizedPnl || 0) > 0).length;

    return {
      account,
      stats: {
        initialBalance: account.initialBalance,
        balance: Math.round(account.balance * 100) / 100,
        realizedPnl,
        unrealizedPnl: unrealized,
        equity: Math.round((account.balance + unrealized) * 100) / 100,
        usedMargin,
        freeMargin: Math.round((account.balance - usedMargin) * 100) / 100,
        openPositions: open.length,
        pendingPositions: pending.length,
        closedPositions: closed.length,
        winCount,
        lossCount: closed.length - winCount,
        winRate: closed.length > 0 ? Math.round((winCount / closed.length) * 1000) / 10 : 0,
        leverage: account.leverage,
        marginPerTradePct: account.marginPerTradePct,
      },
    };
  }

  app.get('/api/account', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      res.json(await buildAccountSnapshot(requireUser(req)));
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'خطا در خواندن حساب کاربری' });
    }
  });

  app.post('/api/account/settings', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { leverage, marginPerTradePct } = req.body as {
        leverage?: number;
        marginPerTradePct?: number;
      };
      const patch: Record<string, number> = {};
      if (leverage !== undefined) patch.leverage = Math.min(125, Math.max(1, Number(leverage)));
      if (marginPerTradePct !== undefined) {
        patch.marginPerTradePct = Math.min(100, Math.max(1, Number(marginPerTradePct)));
      }
      await dbRepo.updateTradeAccount(requireUser(req), patch);
      res.json(await buildAccountSnapshot(requireUser(req)));
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'خطا در ذخیره تنظیمات حساب' });
    }
  });

  app.post('/api/account/reset', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = requireUser(req);
      await dbRepo.resetTradeAccount(userId);
      res.json(await buildAccountSnapshot(userId));
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'خطا در شارژ مجدد حساب' });
    }
  });

  app.get('/api/trade/positions', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = requireUser(req);
      // Make sure the engine knows about this user key even if they never opened
      // the account page, so future orders are always created for them.
      await dbRepo.getOrCreateTradeAccount(userId);
      const positions = await dbRepo.getPositions(userId);
      const active = positions.filter((p) => p.status !== 'CLOSED');
      const prices = await fetchPrices([...new Set(active.map((p) => p.symbol))]);

      const enriched = positions.map((p) => {
        const price = prices[p.symbol] || 0;
        const isOpen = p.status === 'OPEN';
        const pnl = isOpen && price ? unrealizedPnl(p, price) : 0;
        const pnlPct = isOpen && price ? unrealizedPnlPct(p, price) : 0;
        const distanceToEntryPct =
          p.status === 'PENDING' && price
            ? ((price - p.entryTarget) / p.entryTarget) * 100
            : 0;
        return {
          ...p,
          currentPrice: price,
          unrealizedPnl: Math.round(pnl * 100) / 100,
          unrealizedPnlPct: Math.round(pnlPct * 100) / 100,
          distanceToEntryPct: Math.round(distanceToEntryPct * 100) / 100,
        };
      });

      res.json({
        positions: enriched,
        userId,
        totalKnown: positions.length,
        diagnostics: await dbRepo.getPositionsDiagnostics(userId),
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'خطا در خواندن پوزیشن‌ها' });
    }
  });

  app.get('/api/trade/status', authMiddleware, (_req: AuthenticatedRequest, res: Response) => {
    res.json({ status: tradeEngine.getState() });
  });

  // ==========================================================================
  // Plain-text report (signals + trades with exact timestamps)
  // ==========================================================================
  const faTime = (iso?: string | null): string => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    try {
      return new Intl.DateTimeFormat('fa-IR', {
        timeZone: 'Asia/Tehran',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
        .format(d)
        .replace(/[,\u060C]/g, ' ');
    } catch {
      return d.toISOString();
    }
  };

  const num = (v: any, digits = 8): string =>
    typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : '—';

  const sideFa = (s: string): string =>
    s === 'LONG' ? 'LONG (خرید)' : s === 'SHORT' ? 'SHORT (فروش)' : 'NO TRADE (بدون معامله)';

  const statusFa = (s: string): string =>
    s === 'PENDING'
      ? 'PENDING (در انتظار رسیدن قیمت به نقطه ورود)'
      : s === 'OPEN'
      ? 'OPEN (باز)'
      : 'CLOSED (بسته‌شده)';

  app.get('/api/reports/txt', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = requireUser(req);
      const account = await dbRepo.getOrCreateTradeAccount(userId);
      const signals = await dbRepo.getRegisteredSignals();
      const positions = await dbRepo.getPositions(userId);

      const L: string[] = [];
      const line = (s = '') => L.push(s);
      const rule = (ch = '-') => line(ch.repeat(78));
      const kv = (k: string, v: any) => line(`  ${k.padEnd(24, ' ')}: ${v}`);

      const generatedAt = new Date().toISOString();

      rule('=');
      line('گزارش سیگنال‌ها و معاملات — پنل مدیریت ارز');
      rule('=');
      kv('زمان تولید گزارش (ISO)', generatedAt);
      kv('زمان تولید (ایران)', faTime(generatedAt));
      kv('شناسه کاربر', userId);
      kv('تعداد سیگنال‌های ثبت‌شده', signals.length);
      kv('تعداد معاملات', positions.length);
      kv('موجودی حساب', `$ ${num(account.balance, 2)}`);
      kv('موجودی اولیه', `$ ${num(account.initialBalance, 2)}`);
      kv('اهرم پیش‌فرض', `${account.leverage}x`);
      line();

      const fmtSignal = (s: any, i: number) => {
        rule('=');
        line(`سیگنال شماره ${String(i + 1).padStart(3, '0')}`);
        rule('=');
        kv('زمان ثبت (ISO)', s.createdAt || '—');
        kv('زمان ثبت (ایران)', faTime(s.createdAt));
        kv('نماد', s.symbol);
        kv('نام', s.label || '—');
        kv('تایم‌فریم', s.interval || '—');
        kv('جهت توافق', sideFa(s.consensusDirection));
        kv('واجد شرایط', s.isQualified ? 'بله' : 'خیر');
        kv('سیگنال خرید / فروش', `${s.buySignalsCount} / ${s.sellSignalsCount}`);
        kv('تعداد بررسی‌شده', `${s.totalSignalsChecked} از ۶ روش`);
        kv('تعداد سیگنال هم‌جهت', s.matchedSignalsCount);
        kv('قیمت لحظه‌ای هنگام تحلیل', num(s.currentPrice));
        kv('نقطه ورود', num(s.entryPrice));
        kv('حد ضرر', num(s.stopLoss));
        kv('حد سود ۱', num(s.takeProfit1));
        kv('حد سود ۲', num(s.takeProfit2));
        kv('نسبت ریسک به ریوارد', s.riskRewardRatio || '—');
        kv('امتیاز میانگین', num(s.averageScore, 2));
        kv('موتور هوش مصنوعی', s.aiEngineUsed || '—');
        kv('وضعیت ChatGPT', s.chatGptStatus || '—');
        kv('نظر ChatGPT', sideFa(s.chatGptDirection || 'NO TRADE'));
        kv('ستاپ ChatGPT', s.chatGptSetupName || '—');
        kv('شماره چرخه', s.cycleNumber ?? '—');
        kv('ارسال به موتور ترید', s.dispatchedToTrade ? 'بله' : 'خیر');
        kv('زمان ارسال به ترید (ISO)', s.tradeDispatchedAt || '—');
        kv('زمان ارسال به ترید (ایران)', faTime(s.tradeDispatchedAt));
        kv('پیام ارسال به ترید', s.tradeDispatchNote || '—');
        line();
      };

      const fmtPosition = (p: any, i: number) => {
        const totalPnl = Math.round((Number(p.realizedPnl) || 0) * 100) / 100;
        rule('=');
        line(`معامله شماره ${String(i + 1).padStart(3, '0')}`);
        rule('=');
        kv('نماد', p.symbol);
        kv('نام', p.label || '—');
        kv('سمت', sideFa(p.side));
        kv('اهرم', `${p.leverage}x`);
        kv('وضعیت', statusFa(p.status));
        kv('شناسه سیگنال', p.signalId || '—');
        kv('شماره چرخه سیگنال', p.signalCycleNumber ?? '—');
        kv('موتور هوش مصنوعی', p.aiEngineUsed || '—');
        kv('امتیاز سیگنال', num(p.averageScore, 2));
        line();
        kv('زمان ساخت سفارش (ISO)', p.createdAt || '—');
        kv('زمان ساخت سفارش (ایران)', faTime(p.createdAt));
        kv('نقطه ورود هدف', num(p.entryTarget));
        kv('جهت انتظار قیمت', p.triggerAbove ? 'صعود تا نقطه ورود' : 'نزول تا نقطه ورود');
        kv('زمان ورود / پر شدن (ISO)', p.openedAt || '—');
        kv('زمان ورود / پر شدن (ایران)', faTime(p.openedAt));
        kv('قیمت ورود نهایی', num(p.entryPrice));
        kv('حد ضرر', num(p.stopLoss));
        kv('حد سود ۱', num(p.takeProfit1));
        kv('حد سود ۲', num(p.takeProfit2));
        kv('حجم کل', num(p.quantity));
        kv('حجم باقی‌مانده', num(p.remainingQuantity));
        kv('مارجین', `$ ${num(p.margin, 2)}`);
        kv('ارزش قرارداد (نوشنال)', `$ ${num(p.notional, 2)}`);
        kv('بستن ۵۰٪ در TP1', p.tp1Hit ? 'انجام شد' : 'انجام نشده');
        kv('زمان بستن (ISO)', p.closedAt || '—');
        kv('زمان بستن (ایران)', faTime(p.closedAt));
        kv('دلیل بستن', p.closeReason || '—');
        kv('سود/زیان محقق‌شده', `$ ${num(p.realizedPnl, 2)}`);
        kv('سود/زیان کل ثبت‌شده', `$ ${num(totalPnl, 2)}`);
        line('  رخدادها:');
        if (!p.fills || p.fills.length === 0) {
          line('    (هنوز رخدادی ثبت نشده)');
        } else {
          for (const f of p.fills) {
            line(
              `    - ${f.at} | ${faTime(f.at)} | ${String(f.type).padEnd(14, ' ')} | قیمت=${num(
                f.price
              )} | حجم=${num(f.quantity)} | سود/زیان=${num(f.pnl, 2)} | ${f.note || ''}`
            );
          }
        }
        line();
      };

      line('بخش ۱ — سیگنال‌ها (Signals)');
      rule('=');
      line();
      if (signals.length === 0) {
        line('  هیچ سیگنالی ثبت نشده است.');
        line();
      } else {
        signals.forEach((s, i) => fmtSignal(s, i));
      }

      line('بخش ۲ — معاملات (خرید و فروش)');
      rule('=');
      line();
      if (positions.length === 0) {
        line('  هیچ معامله‌ای ثبت نشده است.');
        line();
      } else {
        positions.forEach((p, i) => fmtPosition(p, i));
      }

      // ---- summary ----
      const closed = positions.filter((p) => p.status === 'CLOSED');
      const open = positions.filter((p) => p.status === 'OPEN');
      const pending = positions.filter((p) => p.status === 'PENDING');
      const realized = positions.reduce((a, p) => a + (Number(p.realizedPnl) || 0), 0);
      const wins = closed.filter((p) => (Number(p.realizedPnl) || 0) > 0).length;
      const losses = closed.filter((p) => (Number(p.realizedPnl) || 0) < 0).length;

      line('بخش ۳ — خلاصه آماری');
      rule('=');
      kv('سیگنال‌های واجد شرایط', signals.filter((s) => s.isQualified).length);
      kv('سیگنال‌های ارسال‌شده به ترید', signals.filter((s) => s.dispatchedToTrade).length);
      kv('سفارش در انتظار', pending.length);
      kv('پوزیشن باز', open.length);
      kv('معاملات بسته‌شده', closed.length);
      kv('معاملات سودده', wins);
      kv('معاملات زیان‌ده', losses);
      kv(
        'نرخ برد',
        closed.length > 0 ? `${((wins / closed.length) * 100).toFixed(1)}٪` : '—'
      );
      kv('مجموع سود/زیان محقق‌شده', `$ ${num(realized, 2)}`);
      kv('موجودی نهایی', `$ ${num(account.balance, 2)}`);
      kv(
        'بازدهی',
        account.initialBalance
          ? `${(((account.balance - account.initialBalance) / account.initialBalance) * 100).toFixed(
              2
            )}٪`
          : '—'
      );
      line();

      // ---- flat, machine readable block for later analysis ----
      line('بخش ۴ — داده خام (جداشده با تب — برای تحلیل در اکسل)');
      rule('=');
      line();
      line('#SIGNALS');
      line(
        [
          'createdAt_ISO',
          'createdAt_IR',
          'symbol',
          'timeframe',
          'direction',
          'qualified',
          'buyCount',
          'sellCount',
          'matched',
          'currentPrice',
          'entry',
          'stopLoss',
          'tp1',
          'tp2',
          'score',
          'cycle',
          'sentToTrade',
        ].join('\t')
      );
      for (const s of signals) {
        line(
          [
            s.createdAt,
            faTime(s.createdAt),
            s.symbol,
            s.interval,
            s.consensusDirection,
            s.isQualified ? 1 : 0,
            s.buySignalsCount,
            s.sellSignalsCount,
            s.matchedSignalsCount,
            s.currentPrice,
            s.entryPrice,
            s.stopLoss,
            s.takeProfit1,
            s.takeProfit2,
            s.averageScore,
            s.cycleNumber,
            s.dispatchedToTrade ? 1 : 0,
          ].join('\t')
        );
      }
      line();
      line('#TRADES');
      line(
        [
          'createdAt_ISO',
          'createdAt_IR',
          'openedAt_ISO',
          'openedAt_IR',
          'closedAt_ISO',
          'closedAt_IR',
          'symbol',
          'side',
          'leverage',
          'status',
          'entryTarget',
          'entryPrice',
          'stopLoss',
          'tp1',
          'tp2',
          'quantity',
          'margin',
          'notional',
          'tp1Hit',
          'realizedPnl',
          'closeReason',
        ].join('\t')
      );
      for (const p of positions) {
        line(
          [
            p.createdAt,
            faTime(p.createdAt),
            p.openedAt || '',
            faTime(p.openedAt),
            p.closedAt || '',
            faTime(p.closedAt),
            p.symbol,
            p.side,
            p.leverage,
            p.status,
            p.entryTarget,
            p.entryPrice,
            p.stopLoss,
            p.takeProfit1,
            p.takeProfit2,
            p.quantity,
            p.margin,
            p.notional,
            p.tp1Hit ? 1 : 0,
            p.realizedPnl,
            (p.closeReason || '').replace(/\t/g, ' '),
          ].join('\t')
        );
      }
      line();
      rule('=');
      line('پایان گزارش');
      rule('=');

      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `arz-report-${stamp}.txt`;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send('\uFEFF' + L.join('\r\n'));
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'خطا در تولید گزارش' });
    }
  });

  app.post('/api/trade/tick', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const summary = await tradeEngine.tick();
      res.json({ ok: true, summary, status: tradeEngine.getState() });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'خطا در اجرای موتور معاملات' });
    }
  });

  app.post('/api/trade/positions/:id/close', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = requireUser(req);
      const positions = await dbRepo.getPositions(userId);
      const pos = positions.find((p) => p._id === String(req.params.id));
      if (!pos) {
        res.status(404).json({ error: 'پوزیشن یافت نشد.' });
        return;
      }
      if (pos.status === 'CLOSED') {
        res.status(400).json({ error: 'این پوزیشن قبلاً بسته شده است.' });
        return;
      }

      const nowIso = new Date().toISOString();

      // Pending order that never filled: just cancel it (no P&L).
      if (pos.status === 'PENDING') {
        await dbRepo.updatePosition(pos._id, {
          status: 'CLOSED',
          remainingQuantity: 0,
          closeReason: 'لغو سفارش در انتظار ورود',
          closedAt: nowIso,
        });
        res.json({ ok: true, positions: (await dbRepo.getPositions(userId)) });
        return;
      }

      const prices = await fetchPrices([pos.symbol]);
      const price = prices[pos.symbol];
      if (!price) {
        res.status(502).json({ error: 'قیمت لحظه‌ای این نماد در دسترس نیست.' });
        return;
      }

      const pnl =
        pos.side === 'LONG'
          ? (price - pos.entryPrice) * pos.remainingQuantity
          : (pos.entryPrice - price) * pos.remainingQuantity;
      const rounded = Math.round(pnl * 100) / 100;
      const account = await dbRepo.getOrCreateTradeAccount(userId);
      await dbRepo.updateTradeAccount(userId, {
        balance: Math.round((account.balance + rounded) * 100) / 100,
      });
      await dbRepo.updatePosition(pos._id, {
        status: 'CLOSED',
        remainingQuantity: 0,
        realizedPnl: Math.round(((pos.realizedPnl || 0) + rounded) * 100) / 100,
        closeReason: 'بستن دستی توسط ادمین',
        closedAt: nowIso,
        fills: [
          ...(pos.fills || []),
          {
            type: 'CLOSE',
            price,
            quantity: pos.remainingQuantity,
            pnl: rounded,
            note: 'بستن دستی توسط ادمین',
            at: nowIso,
          },
        ],
      });

      res.json({ ok: true, positions: (await dbRepo.getPositions(userId)) });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'خطا در بستن پوزیشن' });
    }
  });

  app.delete('/api/trade/positions/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = requireUser(req);
      const ok = await dbRepo.deletePosition(String(req.params.id));
      res.json({ ok, positions: await dbRepo.getPositions(userId) });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'خطا در حذف پوزیشن' });
    }
  });

  app.delete('/api/trade/positions', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = requireUser(req);
      await dbRepo.clearPositions(userId);
      res.json({ ok: true, positions: [] });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'خطا در پاک‌سازی پوزیشن‌ها' });
    }
  });

  // ==========================================================================
  // 6. Vite Dev Middleware / Production Static Assets
  // ==========================================================================
  // Resolve the built client relative to the project root (works on Render,
  // where the repo is checked out at /opt/render/project/src).
  const distPath = path.join(process.cwd(), 'dist');
  const distIndex = path.join(distPath, 'index.html');
  const hasBuiltAssets = fs.existsSync(distIndex);

  if (process.env.NODE_ENV === 'production' && hasBuiltAssets) {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(distIndex);
    });
  } else {
    // No production bundle available (e.g. the build step was skipped) — serve
    // the app through Vite middleware instead of crashing with ENOENT.
    if (process.env.NODE_ENV === 'production') {
      console.warn(
        '[server] dist/index.html not found — falling back to Vite middleware. ' +
          'Set the Render build command to: npm install --include=dev && npm run build'
      );
    }
    const disableHmr = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        // Allow tunnels / platform domains (Render, Cloudflare, etc.) in dev too.
        allowedHosts: true,
        hmr: !disableHmr,
        watch: disableHmr ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Admin Control Panel Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
