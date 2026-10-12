import React, { useEffect, useRef, useState } from 'react';
import {
  Bot,
  Send,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Trash2,
  Power,
  Key,
  User,
  Sparkles,
} from 'lucide-react';
import {
  apiClient,
  TelegramBotStatusConfig,
  TelegramChatMessage,
} from '../apiclient';
import { LiveTickerData } from './BinanceLiveTicker';

interface TelegramBotManagerProps {
  tickers: Record<string, LiveTickerData>;
}

interface GroupedConversation {
  chatId: string;
  senderName: string;
  senderUsername: string;
  lastMessage: TelegramChatMessage;
  unreadCount: number;
  messages: TelegramChatMessage[];
}

export function TelegramBotManager({ tickers }: TelegramBotManagerProps) {
  const [statusConfig, setStatusConfig] = useState<TelegramBotStatusConfig | null>(null);
  const [messages, setMessages] = useState<TelegramChatMessage[]>([]);
  const [botTokenInput, setBotTokenInput] = useState('');
  const [selectedChatId, setSelectedChatId] = useState<string>('');
  const [manualChatIdInput, setManualChatIdInput] = useState('');
  const [replyText, setReplyText] = useState('');
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [pollingNow, setPollingNow] = useState(false);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const loadData = async (silent = false) => {
    if (!silent) setLoadingConfig(true);
    try {
      const [statusRes, msgRes] = await Promise.all([
        apiClient.getTelegramStatus(),
        apiClient.getTelegramMessages(),
      ]);
      setStatusConfig(statusRes.config);
      setMessages(msgRes.messages);
    } catch (err: any) {
      if (!silent) {
        setFeedback({ type: 'error', text: err?.message || 'خطا در دریافت اطلاعات ربات تلگرام' });
      }
    } finally {
      if (!silent) setLoadingConfig(false);
    }
  };

  useEffect(() => {
    void loadData(false);
    const interval = setInterval(() => {
      void loadData(true);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  // Group messages by chatId
  const conversationsMap = new Map<string, GroupedConversation>();
  for (const msg of messages) {
    const existing = conversationsMap.get(msg.chatId);
    const fullName = `${msg.senderFirstName || 'کاربر'} ${msg.senderLastName || ''}`.trim();
    if (!existing) {
      conversationsMap.set(msg.chatId, {
        chatId: msg.chatId,
        senderName: fullName,
        senderUsername: msg.senderUsername || '',
        lastMessage: msg,
        unreadCount: msg.direction === 'incoming' && !msg.isRead ? 1 : 0,
        messages: [msg],
      });
    } else {
      existing.messages.push(msg);
      existing.lastMessage = msg;
      if (msg.direction === 'incoming') {
        existing.senderName = fullName || existing.senderName;
        existing.senderUsername = msg.senderUsername || existing.senderUsername;
        if (!msg.isRead) {
          existing.unreadCount += 1;
        }
      }
    }
  }

  const conversations = Array.from(conversationsMap.values()).sort(
    (a, b) =>
      new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime()
  );

  // Auto-select first conversation if none selected
  useEffect(() => {
    if (!selectedChatId && conversations.length > 0) {
      setSelectedChatId(conversations[0].chatId);
    }
  }, [conversations.length, selectedChatId]);

  const activeConversation = conversationsMap.get(selectedChatId);

  const handleSelectConversation = async (chatId: string) => {
    setSelectedChatId(chatId);
    const conv = conversationsMap.get(chatId);
    if (conv && conv.unreadCount > 0) {
      try {
        const res = await apiClient.markChatRead(chatId);
        setMessages(res.messages);
      } catch {
        // ignore
      }
    }
  };

  const handleConnectBot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!botTokenInput.trim()) return;
    setFeedback(null);
    setConnecting(true);

    try {
      const res = await apiClient.connectTelegramBot(botTokenInput.trim());
      setStatusConfig(res.config);
      setBotTokenInput('');
      setFeedback({
        type: 'success',
        text: `ربات @${res.config.botUsername || res.config.botFirstName} با موفقیت به صورت مستقیم (بدون وبهوک) متصل شد و دریافت پیام‌ها فعال گردید.`,
      });
      await loadData(true);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || 'خطا در اتصال به ربات تلگرام',
      });
    } finally {
      setConnecting(false);
    }
  };

  const handleTogglePolling = async () => {
    if (!statusConfig) return;
    setFeedback(null);
    try {
      const res = await apiClient.toggleTelegramPolling(!statusConfig.isPollingActive);
      setStatusConfig({ ...statusConfig, isPollingActive: res.isPollingActive });
      setFeedback({
        type: 'success',
        text: res.isPollingActive
          ? 'دریافت مستقیم پیام‌های تلگرام (Long Polling) فعال شد.'
          : 'دریافت خودکار پیام‌های تلگرام متوقف شد.',
      });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'خطا در تغییر وضعیت ربات' });
    }
  };

  const handlePollNow = async () => {
    setPollingNow(true);
    setFeedback(null);
    try {
      const res = await apiClient.pollTelegramNow();
      setMessages(res.messages);
      setFeedback({
        type: 'success',
        text:
          res.newCount > 0
            ? `${res.newCount} پیام جدید از تلگرام دریافت شد.`
            : 'بررسی انجام شد؛ پیام جدیدی در صف تلگرام وجود نداشت.',
      });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'خطا در دریافت آنی پیام‌ها' });
    } finally {
      setPollingNow(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetChatId = (selectedChatId || manualChatIdInput).trim();
    if (!targetChatId || !replyText.trim()) return;

    setSending(true);
    setFeedback(null);
    try {
      const res = await apiClient.sendTelegramMessage(targetChatId, replyText.trim());
      setMessages(res.messages);
      setSelectedChatId(targetChatId);
      setReplyText('');
      setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'خطا در ارسال پیام به کاربر تلگرام' });
    } finally {
      setSending(false);
    }
  };

  const handleInsertLivePrices = () => {
    const entries = Object.values(tickers) as LiveTickerData[];
    if (entries.length === 0) {
      setReplyText('گزارش قیمت لحظه‌ای بایننس:\nدر حال حاضر قیمت‌ها در حال بارگذاری هستند.');
      return;
    }
    const lines = entries.slice(0, 8).map((t) => {
      const sign = t.rawChangePercent >= 0 ? '+' : '';
      return `• ${t.symbol}: $${t.price} (${sign}${t.changePercent}%)`;
    });
    const text = `📊 قیمت لحظه‌ای ارزهای بایننس:\n\n${lines.join('\n')}\n\n🕒 ارسال شده از پنل مدیریت`;
    setReplyText(text);
  };

  const handleDeleteChat = async (chatId: string) => {
    try {
      const res = await apiClient.deleteTelegramChat(chatId);
      setMessages(res.messages);
      if (selectedChatId === chatId) {
        setSelectedChatId('');
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'خطا در حذف گفتگو' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Configuration Card: Direct Connection (No Webhook) */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-slate-900">
                اتصال مستقیم به ربات تلگرام (بدون Webhook)
              </h2>
              {statusConfig?.hasToken && (
                <span
                  className={`text-xs font-semibold flex items-center gap-1.5 ${
                    statusConfig.isPollingActive ? 'text-emerald-600' : 'text-amber-600'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {statusConfig.isPollingActive
                      ? `متصل و در حال دریافت زنده (@${statusConfig.botUsername})`
                      : 'متصل (دریافت خودکار متوقف شده)'}
                  </span>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              این بخش به صورت مستقیم از طریق متد <span className="font-mono-tabular">getUpdates</span> و{' '}
              <span className="font-mono-tabular">sendMessage</span> با سرور تلگرام ارتباط برقرار می‌کند و نیازی به تنظیم Webhook یا دامنه SSL ندارد.
            </p>
          </div>

          {statusConfig?.hasToken && (
            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={handlePollNow}
                disabled={pollingNow}
                className="px-3.5 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${pollingNow ? 'animate-spin' : ''}`} />
                <span>{pollingNow ? 'در حال بررسی...' : 'دریافت آنی پیام‌ها'}</span>
              </button>

              <button
                type="button"
                onClick={handleTogglePolling}
                className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  statusConfig.isPollingActive
                    ? 'text-amber-700 bg-amber-50 hover:bg-amber-100'
                    : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                }`}
              >
                <Power className="w-3.5 h-3.5" />
                <span>
                  {statusConfig.isPollingActive ? 'توقف موقت Polling' : 'فعال‌سازی مجدد Polling'}
                </span>
              </button>
            </div>
          )}
        </div>

        {feedback && (
          <div
            className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}

        {/* Bot Token Input Form */}
        <form onSubmit={handleConnectBot} className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-1">
          <div className="md:col-span-9">
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              توکن ربات تلگرام (دریافتی از @BotFather)
            </label>
            <div className="relative">
              <Key className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
              <input
                type="text"
                dir="ltr"
                required
                value={botTokenInput}
                onChange={(e) => setBotTokenInput(e.target.value)}
                placeholder={
                  statusConfig?.hasToken
                    ? `توکن فعلی: ${statusConfig.maskedToken} (برای تغییر، توکن جدید را وارد کنید)`
                    : '123456789:ABCdefGHIjklMNOpqrsTUVwxyz...'
                }
                className="w-full pr-10 pl-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-blue-600 font-mono-tabular text-left"
              />
            </div>
          </div>

          <div className="md:col-span-3 flex items-end">
            <button
              type="submit"
              disabled={connecting || !botTokenInput.trim()}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2 h-[42px] whitespace-nowrap cursor-pointer"
            >
              <Bot className="w-4 h-4" />
              <span>{connecting ? 'در حال اتصال مستقیم...' : 'اتصال مستقیم به ربات'}</span>
            </button>
          </div>
        </form>

        {/* Active Bot Telemetry Bar */}
        {statusConfig?.hasToken && (
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-600">
            <div>
              <span className="text-slate-400 ml-1">نام ربات:</span>
              <span className="font-semibold text-slate-900">{statusConfig.botFirstName}</span>
            </div>
            <span aria-hidden="true">·</span>
            <div>
              <span className="text-slate-400 ml-1">یوزرنیم:</span>
              <span className="font-mono-tabular font-semibold text-blue-600">
                @{statusConfig.botUsername}
              </span>
            </div>
            <span aria-hidden="true">·</span>
            <div>
              <span className="text-slate-400 ml-1">نوع اتصال:</span>
              <span className="font-medium text-slate-800">Direct Long Polling (بدون Webhook)</span>
            </div>
            {statusConfig.lastPollAt && (
              <>
                <span aria-hidden="true">·</span>
                <div>
                  <span className="text-slate-400 ml-1">آخرین استعلام:</span>
                  <span className="font-mono-tabular">
                    {new Date(statusConfig.lastPollAt).toLocaleTimeString('fa-IR')}
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Two-Pane User Messages & Direct Reply Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Right Column (4 cols): User Conversations List */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl flex flex-col h-[560px]">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900">پیام‌های کاربران ربات</h3>
            </div>
            <span className="text-xs text-slate-500">{conversations.length} گفتگو</span>
          </div>

          {/* Direct Chat ID Quick Start */}
          <div className="p-3 border-b border-slate-100 bg-slate-50/60">
            <div className="flex items-center gap-2">
              <input
                type="text"
                dir="ltr"
                value={manualChatIdInput}
                onChange={(e) => setManualChatIdInput(e.target.value)}
                placeholder="ورود دستی Chat ID (مثلاً 12345678)"
                className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600 font-mono-tabular text-left"
              />
              <button
                type="button"
                onClick={() => {
                  if (manualChatIdInput.trim()) {
                    setSelectedChatId(manualChatIdInput.trim());
                  }
                }}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg whitespace-nowrap cursor-pointer"
              >
                انتخاب چت
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {loadingConfig ? (
              <div className="p-6 text-center text-xs text-slate-400">در حال بارگذاری گفتگوها...</div>
            ) : conversations.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <Bot className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-semibold text-slate-700">هنوز پیامی دریافت نشده است</p>
                <p className="text-xs text-slate-500 leading-relaxed">
                  به محض اینکه کاربری در تلگرام به ربات شما پیام بفرستد (مثلاً /start)، نام و پیام او به صورت خودکار در این لیست ظاهر می‌شود.
                </p>
              </div>
            ) : (
              conversations.map((conv) => {
                const isSelected = conv.chatId === selectedChatId;
                return (
                  <div
                    key={conv.chatId}
                    onClick={() => handleSelectConversation(conv.chatId)}
                    className={`p-4 transition-colors cursor-pointer flex items-start justify-between gap-3 ${
                      isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 shrink-0 mt-0.5">
                        <User className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900 truncate">
                            {conv.senderName}
                          </span>
                          {conv.senderUsername && (
                            <span className="text-[11px] text-blue-600 font-mono-tabular truncate">
                              @{conv.senderUsername}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 truncate">{conv.lastMessage.text}</p>
                        <div className="text-[11px] text-slate-400 font-mono-tabular flex items-center gap-2">
                          <span>ID: {conv.chatId}</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {new Date(conv.lastMessage.createdAt).toLocaleTimeString('fa-IR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {conv.unreadCount > 0 && (
                        <span className="text-xs font-bold text-blue-600">
                          {conv.unreadCount} جدید
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDeleteChat(conv.chatId);
                        }}
                        title="حذف تاریخچه این گفتگو"
                        className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Left Column (8 cols): Active Conversation Messages & Direct Reply Box */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl flex flex-col h-[560px]">
          {/* Chat Header */}
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            {activeConversation ? (
              <div className="flex items-center gap-3">
                <div>
                  <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span>{activeConversation.senderName}</span>
                    {activeConversation.senderUsername && (
                      <span className="text-xs font-mono-tabular text-blue-600">
                        @{activeConversation.senderUsername}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 font-mono-tabular">
                    Chat ID: {activeConversation.chatId}
                  </div>
                </div>
              </div>
            ) : selectedChatId ? (
              <div>
                <div className="text-sm font-bold text-slate-900">ارسال پیام مستقیم به شناسه چت</div>
                <div className="text-xs text-slate-500 font-mono-tabular">
                  Chat ID: {selectedChatId}
                </div>
              </div>
            ) : (
              <div className="text-sm font-bold text-slate-700">
                یک گفتگو را از ستون سمت راست انتخاب کنید
              </div>
            )}

            <button
              type="button"
              onClick={handleInsertLivePrices}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>درج قیمت لحظه‌ای ارزهای بایننس در پیام</span>
            </button>
          </div>

          {/* Messages Viewport */}
          <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-slate-50/50">
            {!activeConversation || activeConversation.messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-2">
                <MessageSquare className="w-8 h-8 text-slate-300" />
                <p className="text-sm font-semibold text-slate-700">
                  {selectedChatId
                    ? 'هنوز پیامی در این گفتگو ثبت نشده است'
                    : 'گفتگویی انتخاب نشده است'}
                </p>
                <p className="text-xs text-slate-500 max-w-md">
                  شما می‌توانید مستقیماً از کادر پایین به کاربر پیام ارسال کنید یا منتظر دریافت پیام از سمت کاربر در ربات تلگرام بمانید.
                </p>
              </div>
            ) : (
              activeConversation.messages.map((msg) => {
                const isOutgoing = msg.direction === 'outgoing';
                return (
                  <div
                    key={msg._id}
                    className={`flex flex-col ${isOutgoing ? 'items-start' : 'items-end'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 text-xs leading-relaxed whitespace-pre-wrap ${
                        isOutgoing
                          ? 'bg-blue-600 text-white rounded-tr-xs'
                          : 'bg-white border border-slate-200 text-slate-900 rounded-tl-xs'
                      }`}
                    >
                      {msg.text}
                    </div>
                    <div className="mt-1 px-1 text-[11px] text-slate-400 flex items-center gap-1.5">
                      <span>{isOutgoing ? 'ارسالی توسط ادمین' : msg.senderFirstName}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular">
                        {new Date(msg.createdAt).toLocaleTimeString('fa-IR', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Direct Message Composer */}
          <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-200 bg-white">
            <div className="flex items-end gap-3">
              <textarea
                rows={2}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={
                  selectedChatId
                    ? `پاسخ مستقیم به کاربر (${selectedChatId}) را بنویسید...`
                    : 'ابتدا یک کاربر را انتخاب کنید یا Chat ID را در ستون راست وارد نمایید...'
                }
                className="flex-1 px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-blue-600 resize-none"
              />
              <button
                type="submit"
                disabled={sending || !replyText.trim() || (!selectedChatId && !manualChatIdInput.trim())}
                className="px-5 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>{sending ? 'در حال ارسال...' : 'ارسال به تلگرام'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
