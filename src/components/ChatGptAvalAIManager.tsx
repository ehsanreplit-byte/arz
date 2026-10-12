import React, { useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  Key,
  Cpu,
  Globe,
  CheckCircle2,
  AlertCircle,
  Send,
  RefreshCw,
  Save,
  Trash2,
  Code2,
  Zap,
  TrendingUp,
} from 'lucide-react';
import { apiClient, AvalAIConfigInfo } from '../apiclient';
import { LiveTickerData } from './BinanceLiveTicker';

interface ChatGptAvalAIManagerProps {
  tickers: Record<string, LiveTickerData>;
}

interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  latencyMs?: number;
  createdAt: string;
}

const POPULAR_AVALAI_MODELS = [
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-4.1-mini',
  'gpt-4.1',
  'gpt-3.5-turbo',
  'o3-mini',
  'deepseek-chat',
  'claude-3-5-sonnet-20241022',
  'gemini-2.0-flash',
];

export function ChatGptAvalAIManager({ tickers }: ChatGptAvalAIManagerProps) {
  const [config, setConfig] = useState<AvalAIConfigInfo | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [baseUrlInput, setBaseUrlInput] = useState('https://api.avalai.ir/v1');
  const [modelNameInput, setModelNameInput] = useState('gpt-4o-mini');
  const [systemPromptInput, setSystemPromptInput] = useState(
    'شما دستیار هوشمند پنل مدیریت ارزهای دیجیتال و تلگرام هستید و به زبان فارسی پاسخ‌های دقیق و کاربردی می‌دهید.'
  );
  const [temperatureInput, setTemperatureInput] = useState<number>(0.7);

  const [loadingConfig, setLoadingConfig] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showDocsSnippet, setShowDocsSnippet] = useState(false);

  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    title: string;
    detail?: string;
    latencyMs?: number;
    confirmedModel?: string;
  } | null>(null);

  // Live Playground Chat State
  const [chatHistory, setChatHistory] = useState<ChatMessageItem[]>([]);
  const [userPrompt, setUserPrompt] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadConfig = async () => {
      setLoadingConfig(true);
      try {
        const res = await apiClient.getAvalAIConfig();
        setConfig(res.config);
        setBaseUrlInput(res.config.baseUrl || 'https://api.avalai.ir/v1');
        setModelNameInput(res.config.modelName || 'gpt-4o-mini');
        if (res.config.systemPrompt) {
          setSystemPromptInput(res.config.systemPrompt);
        }
        setTemperatureInput(res.config.temperature ?? 0.7);
      } catch (err: any) {
        setFeedback({
          type: 'error',
          title: err?.message || 'خطا در بارگذاری تنظیمات اتصال به ChatGPT (AvalAI)',
        });
      } finally {
        setLoadingConfig(false);
      }
    };
    void loadConfig();
  }, []);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modelNameInput.trim()) {
      setFeedback({ type: 'error', title: 'لطفاً نام مدل (Model Name) را وارد کنید.' });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const res = await apiClient.saveAvalAIConfig({
        apiKey: apiKeyInput.trim() || undefined,
        baseUrl: baseUrlInput.trim() || 'https://api.avalai.ir/v1',
        modelName: modelNameInput.trim(),
        systemPrompt: systemPromptInput.trim(),
        temperature: temperatureInput,
      });
      setConfig(res.config);
      setApiKeyInput('');
      setFeedback({
        type: 'success',
        title: 'تنظیمات اتصال به ChatGPT (AvalAI) با موفقیت در دیتابیس MongoDB ذخیره شد.',
        confirmedModel: res.config.modelName,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        title: err?.message || 'خطا در ذخیره تنظیمات',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!modelNameInput.trim()) {
      setFeedback({ type: 'error', title: 'لطفاً ابتدا نام مدل را وارد کنید.' });
      return;
    }

    setTesting(true);
    setFeedback(null);
    try {
      const res = await apiClient.testAvalAIConnection({
        apiKey: apiKeyInput.trim() || undefined,
        baseUrl: baseUrlInput.trim() || 'https://api.avalai.ir/v1',
        modelName: modelNameInput.trim(),
      });
      setConfig(res.config);
      if (apiKeyInput.trim()) {
        setApiKeyInput('');
      }
      setFeedback({
        type: 'success',
        title: 'تست اتصال به وب‌سرویس AvalAI با موفقیت انجام شد!',
        detail: `پاسخ مدل: «${res.reply}»`,
        latencyMs: res.latencyMs,
        confirmedModel: res.confirmedModel,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        title: 'تست اتصال به وب‌سرویس AvalAI ناموفق بود',
        detail: err?.message || 'لطفاً کلید API آوالای و نام مدل را بررسی نمایید.',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userPrompt.trim() || sendingChat) return;

    const text = userPrompt.trim();
    const userMsg: ChatMessageItem = {
      id: `${Date.now()}-user`,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };

    const nextHistory = [...chatHistory, userMsg];
    setChatHistory(nextHistory);
    setUserPrompt('');
    setSendingChat(true);

    try {
      const payloadMessages = nextHistory.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const res = await apiClient.sendAvalAIChat({
        messages: payloadMessages,
        modelName: modelNameInput.trim() || config?.modelName || 'gpt-4o-mini',
      });

      const assistantMsg: ChatMessageItem = {
        id: `${Date.now()}-assistant`,
        role: 'assistant',
        content: res.reply,
        model: res.model,
        latencyMs: res.latencyMs,
        createdAt: new Date().toISOString(),
      };
      setChatHistory((prev) => [...prev, assistantMsg]);
      setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        title: 'خطا در دریافت پاسخ از ChatGPT (AvalAI)',
        detail: err?.message,
      });
    } finally {
      setSendingChat(false);
    }
  };

  const handleInsertMarketAnalysisPrompt = () => {
    const list = Object.values(tickers) as LiveTickerData[];
    if (list.length === 0) {
      setUserPrompt('لطفاً وضعیت کلی بازار ارزهای دیجیتال (بیت‌کوین و اتریوم) را به زبان ساده تحلیل کن.');
      return;
    }
    const summary = list
      .slice(0, 6)
      .map((t) => `${t.symbol}: $${t.price} (${t.rawChangePercent >= 0 ? '+' : ''}${t.changePercent}%)`)
      .join(' | ');
    setUserPrompt(
      `بر اساس قیمت‌های لحظه‌ای بایننس (${summary})، یک تحلیل کوتاه و کاربردی از وضعیت فعلی بازار به زبان فارسی ارائه بده.`
    );
  };

  return (
    <div className="space-y-6">
      {/* Header & Status Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-slate-900">
              اتصال به ChatGPT (وب‌سرویس AvalAI)
            </h2>
            {config?.hasApiKey && (
              <span
                className={`text-xs font-semibold flex items-center gap-1.5 ${
                  config.lastTestStatus === 'success'
                    ? 'text-emerald-600'
                    : config.lastTestStatus === 'error'
                    ? 'text-red-600'
                    : 'text-blue-600'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {config.lastTestStatus === 'success'
                    ? `متصل و تایید شده (${config.modelName})`
                    : config.lastTestStatus === 'error'
                    ? 'خطا در آخرین تست اتصال'
                    : `کلید ثبت شده (${config.modelName})`}
                </span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500">
            پیاده‌سازی شده بر اساس مستندات رسمی{' '}
            <span className="font-mono-tabular">docs.avalai.ir/fa</span> از طریق نقطه پایانی استاندارد{' '}
            <span className="font-mono-tabular">https://api.avalai.ir/v1/chat/completions</span>.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowDocsSnippet(!showDocsSnippet)}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Code2 className="w-4 h-4" />
            <span>{showDocsSnippet ? 'بستن راهنمای مستندات' : 'مشاهده ساختار درخواست AvalAI'}</span>
          </button>

          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testing}
            className="px-4 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Zap className={`w-4 h-4 ${testing ? 'animate-pulse' : ''}`} />
            <span>{testing ? 'در حال تست اتصال...' : 'تست اتصال (Test Connection)'}</span>
          </button>
        </div>
      </div>

      {/* Expandable AvalAI Docs Reference Box */}
      {showDocsSnippet && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">
              ساختار استاندارد اتصال به AvalAI (مطابق مستندات docs.avalai.ir/fa)
            </h3>
            <span className="text-xs font-mono-tabular text-blue-600">
              POST {baseUrlInput.replace(/\/+$/, '')}/chat/completions
            </span>
          </div>
          <pre
            dir="ltr"
            className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono-tabular text-slate-800 overflow-x-auto leading-relaxed"
          >{`fetch("${baseUrlInput.replace(/\/+$/, '')}/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer <AVALAI_API_KEY>"
  },
  body: JSON.stringify({
    model: "${modelNameInput || 'gpt-4o-mini'}",
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "سلام!" }
    ]
  })
});`}</pre>
        </div>
      )}

      {/* Connection Settings Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              تنظیمات کلید API، نام مدل و تست اتصال به AvalAI
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              کلید API دریافتی از پنل کاربری آوالای و نام مدل مورد نظر خود را وارد کرده و اتصال را تست کنید.
            </p>
          </div>
          {config?.lastTestLatencyMs !== undefined && (
            <div className="text-xs text-slate-500 font-mono-tabular">
              Latency: <span className="font-bold text-slate-900">{config.lastTestLatencyMs} ms</span>
            </div>
          )}
        </div>

        {/* Live Feedback / Test Connection Output */}
        {feedback && (
          <div
            className={`p-4 rounded-xl border text-xs space-y-1.5 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="font-bold flex items-center gap-2">
                {feedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                )}
                <span>{feedback.title}</span>
              </div>
              {feedback.latencyMs !== undefined && (
                <span className="font-mono-tabular text-[11px] font-semibold">
                  زمان پاسخ: {feedback.latencyMs}ms · مدل: {feedback.confirmedModel}
                </span>
              )}
            </div>
            {feedback.detail && (
              <p className="text-xs leading-relaxed pr-6 opacity-90">{feedback.detail}</p>
            )}
          </div>
        )}

        <form onSubmit={handleSaveConfig} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* Field 1: AvalAI API Key */}
            <div className="md:col-span-5">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                کلید API آوالای (AvalAI API Key)
              </label>
              <div className="relative">
                <Key className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
                <input
                  type="password"
                  dir="ltr"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder={
                    config?.hasApiKey
                      ? `کلید فعلی: ${config.maskedApiKey} (برای تغییر وارد کنید)`
                      : 'aa-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
                  }
                  className="w-full pr-10 pl-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-blue-600 font-mono-tabular text-left"
                />
              </div>
            </div>

            {/* Field 2: Model Name Input */}
            <div className="md:col-span-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                نام مدل (Model Name در AvalAI)
              </label>
              <div className="relative">
                <Cpu className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
                <input
                  type="text"
                  required
                  dir="ltr"
                  value={modelNameInput}
                  onChange={(e) => setModelNameInput(e.target.value)}
                  placeholder="gpt-4o-mini"
                  className="w-full pr-10 pl-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-blue-600 font-mono-tabular text-left"
                />
              </div>
            </div>

            {/* Field 3: Base URL */}
            <div className="md:col-span-3">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                آدرس پایه (Base URL)
              </label>
              <div className="relative">
                <Globe className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
                <input
                  type="url"
                  required
                  dir="ltr"
                  value={baseUrlInput}
                  onChange={(e) => setBaseUrlInput(e.target.value)}
                  placeholder="https://api.avalai.ir/v1"
                  className="w-full pr-10 pl-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-blue-600 font-mono-tabular text-left"
                />
              </div>
            </div>
          </div>

          {/* Quick Popular AvalAI Model Selector */}
          <div className="pt-1">
            <div className="text-xs text-slate-500 mb-2">
              انتخاب سریع نام مدل‌های پرکاربرد در AvalAI (یا تایپ دستی هر مدل در فیلد بالا):
            </div>
            <div className="flex flex-wrap gap-2">
              {POPULAR_AVALAI_MODELS.map((mdl) => {
                const isSelected = modelNameInput.trim() === mdl;
                return (
                  <button
                    key={mdl}
                    type="button"
                    onClick={() => setModelNameInput(mdl)}
                    className={`px-3 py-1.5 text-xs font-mono-tabular rounded-lg border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-blue-600 border-blue-600 text-white font-bold'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-blue-600 hover:text-blue-600'
                    }`}
                  >
                    {mdl}
                  </button>
                );
              })}
            </div>
          </div>

          {/* System Prompt */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              دستورالعمل سیستم (System Prompt)
            </label>
            <textarea
              rows={2}
              value={systemPromptInput}
              onChange={(e) => setSystemPromptInput(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-blue-600 resize-none"
            />
          </div>

          {/* Action Buttons: Save + Test Connection */}
          <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing || saving}
              className="px-5 py-2.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${testing ? 'animate-spin' : ''}`} />
              <span>{testing ? 'در حال تست اتصال با سرور AvalAI...' : 'تست اتصال با مدل انتخابی'}</span>
            </button>

            <button
              type="submit"
              disabled={saving || loadingConfig}
              className="px-6 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'در حال ذخیره...' : 'ذخیره تنظیمات در دیتابیس'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Interactive ChatGPT / AvalAI Live Console */}
      <div className="bg-white border border-slate-200 rounded-xl flex flex-col h-[500px]">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">
              گفتگوی زنده و تحلیل بازار با ChatGPT (مدل فعلی:{' '}
              <span className="font-mono-tabular text-blue-600">{modelNameInput || 'gpt-4o-mini'}</span>)
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleInsertMarketAnalysisPrompt}
              className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>تحلیل قیمت‌های لحظه‌ای بایننس با هوش مصنوعی</span>
            </button>

            {chatHistory.length > 0 && (
              <button
                type="button"
                onClick={() => setChatHistory([])}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1 whitespace-nowrap cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>پاک کردن گفتگو</span>
              </button>
            )}
          </div>
        </div>

        {/* Chat Messages Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-slate-50/50">
          {chatHistory.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-2">
              <Sparkles className="w-8 h-8 text-slate-300" />
              <p className="text-sm font-semibold text-slate-700">
                کنسول گفتگوی مستقیم با مدل‌های AvalAI آماده است
              </p>
              <p className="text-xs text-slate-500 max-w-md leading-relaxed">
                پس از وارد کردن کلید API و تست اتصال، می‌توانید هر سوالی را از مدل{' '}
                <span className="font-mono-tabular">{modelNameInput}</span> بپرسید یا با دکمه بالا، قیمت‌های لحظه‌ای بایننس را تحلیل کنید.
              </p>
            </div>
          ) : (
            chatHistory.map((item) => {
              const isUser = item.role === 'user';
              return (
                <div
                  key={item.id}
                  className={`flex flex-col ${isUser ? 'items-start' : 'items-end'}`}
                >
                  <div
                    className={`max-w-[82%] rounded-2xl px-4 py-3 text-xs leading-relaxed whitespace-pre-wrap ${
                      isUser
                        ? 'bg-blue-600 text-white rounded-tr-xs'
                        : 'bg-white border border-slate-200 text-slate-900 rounded-tl-xs'
                    }`}
                  >
                    {item.content}
                  </div>
                  <div className="mt-1 px-1 text-[11px] text-slate-400 flex items-center gap-2 font-mono-tabular">
                    <span>{isUser ? 'مدیر سیستم' : item.model || modelNameInput}</span>
                    {item.latencyMs !== undefined && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{item.latencyMs}ms</span>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Chat Input Form */}
        <form onSubmit={handleSendChat} className="p-4 border-t border-slate-200 bg-white">
          <div className="flex items-end gap-3">
            <textarea
              rows={2}
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              placeholder={`پیام خود را برای ارسال به مدل ${modelNameInput || 'gpt-4o-mini'} بنویسید...`}
              className="flex-1 px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-blue-600 resize-none"
            />
            <button
              type="submit"
              disabled={sendingChat || !userPrompt.trim()}
              className="px-5 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>{sendingChat ? 'در حال دریافت پاسخ...' : 'ارسال به ChatGPT'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
