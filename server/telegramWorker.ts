import { dbRepo, ITelegramMessage } from './models.js';

interface TelegramApiUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

interface TelegramApiChat {
  id: number;
  type: string;
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

interface TelegramApiMessage {
  message_id: number;
  from?: TelegramApiUser;
  chat: TelegramApiChat;
  date: number;
  text?: string;
  caption?: string;
}

interface TelegramApiUpdate {
  update_id: number;
  message?: TelegramApiMessage;
  edited_message?: TelegramApiMessage;
}

class TelegramDirectPollingWorker {
  private pollTimer: NodeJS.Timeout | null = null;
  private isPollingInFlight = false;

  public async initialize(): Promise<void> {
    const config = await dbRepo.getTelegramConfig();
    if (config.botToken && config.isPollingActive) {
      this.startPollingLoop();
    }
  }

  /**
   * Connects directly to Telegram Bot API (NOT webhook):
   * 1. Removes any active webhook via deleteWebhook so getUpdates is permitted.
   * 2. Validates token via getMe.
   * 3. Starts the Long Polling getUpdates worker.
   */
  public async connectBot(botToken: string): Promise<{
    ok: boolean;
    botInfo?: TelegramApiUser;
    error?: string;
  }> {
    const cleanToken = botToken.trim();
    if (!cleanToken || !cleanToken.includes(':')) {
      return { ok: false, error: 'فرمت توکن ربات تلگرام نامعتبر است. توکن باید شامل شناسه عددی و کلید (مثلاً 123456:ABC-DEF...) باشد.' };
    }

    try {
      // Step 1: Ensure webhook is disabled for direct connection
      await fetch(`https://api.telegram.org/bot${cleanToken}/deleteWebhook`, {
        method: 'POST',
      });

      // Step 2: Verify bot identity via getMe
      const meRes = await fetch(`https://api.telegram.org/bot${cleanToken}/getMe`);
      const meData = (await meRes.json()) as { ok: boolean; result?: TelegramApiUser; description?: string };

      if (!meData.ok || !meData.result) {
        return {
          ok: false,
          error: meData.description || 'توکن وارد شده توسط سرور تلگرام تایید نشد.',
        };
      }

      const botUser = meData.result;
      await dbRepo.updateTelegramConfig({
        botToken: cleanToken,
        botId: botUser.id,
        botUsername: botUser.username || '',
        botFirstName: botUser.first_name || 'Telegram Bot',
        isPollingActive: true,
        lastError: '',
        lastPollAt: new Date().toISOString(),
      });

      this.startPollingLoop();
      // Immediately fetch any pending updates
      await this.pollOnce();

      return { ok: true, botInfo: botUser };
    } catch (err: any) {
      const errorMsg = err?.message || 'خطا در برقراری ارتباط مستقیم با سرور تلگرام (api.telegram.org)';
      await dbRepo.updateTelegramConfig({ lastError: errorMsg });
      return { ok: false, error: errorMsg };
    }
  }

  public startPollingLoop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
    this.pollTimer = setInterval(() => {
      void this.pollOnce();
    }, 3500);
  }

  public stopPollingLoop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  public async pollOnce(): Promise<ITelegramMessage[]> {
    if (this.isPollingInFlight) return [];
    const config = await dbRepo.getTelegramConfig();
    if (!config.botToken || !config.isPollingActive) {
      return [];
    }

    this.isPollingInFlight = true;
    const newSavedMessages: ITelegramMessage[] = [];

    try {
      const offset = config.lastUpdateId ? config.lastUpdateId + 1 : 0;
      const url = `https://api.telegram.org/bot${config.botToken}/getUpdates?offset=${offset}&timeout=2&allowed_updates=${encodeURIComponent(
        JSON.stringify(['message', 'edited_message'])
      )}`;

      const res = await fetch(url);
      const data = (await res.json()) as {
        ok: boolean;
        result?: TelegramApiUpdate[];
        description?: string;
        error_code?: number;
      };

      if (!data.ok) {
        // If webhook conflict (409), automatically clear webhook for direct mode
        if (data.error_code === 409) {
          await fetch(`https://api.telegram.org/bot${config.botToken}/deleteWebhook`, { method: 'POST' });
        }
        await dbRepo.updateTelegramConfig({
          lastError: data.description || 'خطا در دریافت آپدیت‌های تلگرام',
          lastPollAt: new Date().toISOString(),
        });
        return [];
      }

      const updates = data.result || [];
      let maxUpdateId = config.lastUpdateId || 0;

      for (const upd of updates) {
        if (upd.update_id > maxUpdateId) {
          maxUpdateId = upd.update_id;
        }
        const msg = upd.message || upd.edited_message;
        if (!msg) continue;

        const textContent = msg.text || msg.caption || '[پیام غیرمتنی / رسانه]';
        const chatIdStr = String(msg.chat.id);
        const senderFirstName =
          msg.from?.first_name || msg.chat.first_name || msg.chat.title || 'کاربر تلگرام';
        const senderLastName = msg.from?.last_name || msg.chat.last_name || '';
        const senderUsername = msg.from?.username || msg.chat.username || '';

        const saved = await dbRepo.addTelegramMessage({
          updateId: upd.update_id,
          chatId: chatIdStr,
          chatType: msg.chat.type || 'private',
          senderUsername,
          senderFirstName,
          senderLastName,
          text: textContent,
          direction: 'incoming',
          isRead: false,
          createdAt: msg.date ? new Date(msg.date * 1000).toISOString() : new Date().toISOString(),
        });

        newSavedMessages.push(saved);
      }

      await dbRepo.updateTelegramConfig({
        lastUpdateId: maxUpdateId,
        lastPollAt: new Date().toISOString(),
        lastError: '',
      });
    } catch (err: any) {
      await dbRepo.updateTelegramConfig({
        lastError: err?.message || 'خطای شبکه در اتصال به تلگرام',
        lastPollAt: new Date().toISOString(),
      });
    } finally {
      this.isPollingInFlight = false;
    }

    return newSavedMessages;
  }

  public async sendDirectMessage(
    chatId: string,
    text: string
  ): Promise<{ ok: boolean; message?: ITelegramMessage; error?: string }> {
    const config = await dbRepo.getTelegramConfig();
    if (!config.botToken) {
      return { ok: false, error: 'ابتدا توکن ربات تلگرام را در بخش تنظیمات متصل کنید.' };
    }

    try {
      const res = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
        }),
      });

      const data = (await res.json()) as {
        ok: boolean;
        result?: TelegramApiMessage;
        description?: string;
      };

      if (!data.ok || !data.result) {
        return {
          ok: false,
          error: data.description || 'ارسال پیام به تلگرام ناموفق بود.',
        };
      }

      const msg = data.result;
      const saved = await dbRepo.addTelegramMessage({
        chatId: String(msg.chat.id),
        chatType: msg.chat.type || 'private',
        senderUsername: msg.chat.username || '',
        senderFirstName: msg.chat.first_name || msg.chat.title || 'کاربر تلگرام',
        senderLastName: msg.chat.last_name || '',
        text,
        direction: 'outgoing',
        isRead: true,
        createdAt: new Date().toISOString(),
      });

      return { ok: true, message: saved };
    } catch (err: any) {
      return {
        ok: false,
        error: err?.message || 'خطا در ارسال پیام به سرور تلگرام',
      };
    }
  }
}

export const telegramWorker = new TelegramDirectPollingWorker();
