/**
 * یک‌بار پاک‌سازی کامل داده‌های دیتابیس MongoDB
 * ---------------------------------------------------------------------------
 * استفاده:
 *   MONGODB_URI="mongodb+srv://..." npx tsx scripts/wipe-db.ts --yes
 *
 * گزینه‌ها:
 *   --yes                     تأیید نهایی (بدون آن هیچ کاری انجام نمی‌شود)
 *   --scopes=signals,demo,weex,telegram,symbols   انتخاب بخش‌ها (پیش‌فرض: همه)
 *   --include-admins          حذف سایر حساب‌های ادمین (حساب keep-admin حفظ می‌شود)
 *   --keep-admin=email        ایمیلی که باید حفظ شود (پیش‌فرض: همه ادمین‌ها حفظ می‌شوند)
 *   --no-backup               بدون گرفتن نسخه پشتیبان از mirror محلی
 *   --uri=mongodb://...       جایگزین متغیر محیطی MONGODB_URI
 *
 * نکته: پاک‌سازی هم کالکشن‌های MongoDB و هم mirror دیسکی را خالی می‌کند؛
 * در غیر این صورت خواندن‌ها رکوردهای دیسک را دوباره برمی‌گردانند.
 */

import 'dotenv/config';
import { dbRepo, WipeScope } from '../server/models.js';

const VALID_SCOPES: WipeScope[] = ['signals', 'demo', 'weex', 'telegram', 'symbols'];

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

async function main() {
  const hasYes = process.argv.includes('--yes');
  if (!hasYes) {
    console.error('⛔ برای پاکسازی باید --yes را اضافه کنید. هیچ تغییری انجام نشد.');
    console.error('   مثال: MONGODB_URI="..." npx tsx scripts/wipe-db.ts --yes');
    process.exit(1);
  }

  const uri = (argValue('uri') || process.env.MONGODB_URI || '').trim();
  if (!uri) {
    console.error('⛔ MONGODB_URI تنظیم نشده است. آن را در Environment یا با --uri=... بدهید.');
    process.exit(1);
  }

  const scopesArg = argValue('scopes');
  const scopes = scopesArg
    ? (scopesArg
        .split(',')
        .map((s) => s.trim())
        .filter((s): s is WipeScope => VALID_SCOPES.includes(s as WipeScope)))
    : VALID_SCOPES;

  if (scopes.length === 0) {
    console.error(`⛔ حداقل یک scope معتبر بدهید: ${VALID_SCOPES.join(', ')}`);
    process.exit(1);
  }

  const includeAdmins = process.argv.includes('--include-admins');
  const keepAdmin = (argValue('keep-admin') || '').trim().toLowerCase();
  const backup = !process.argv.includes('--no-backup');

  console.log('در حال اتصال به MongoDB…');
  const conn = await dbRepo.connectMongo(uri);
  if (!conn.connected || conn.mode !== 'mongodb_remote') {
    console.error('⛔ اتصال به MongoDB برقرار نشد:', conn.error || conn.mode);
    process.exit(1);
  }
  console.log('✅ متصل شد:', conn.uri);

  const before = await dbRepo.getDatabaseStatus();
  console.log('📊 قبل از پاکسازی:', before.collections);

  console.log(
    `🗑️  پاکسازی بخش‌ها: ${scopes.join(', ')}` +
      (includeAdmins ? ' + سایر ادمین‌ها' : ' (ادمین‌ها حفظ می‌شوند)')
  );

  const result = await dbRepo.wipeDatabase({
    scopes,
    includeAdmins,
    keepAdminEmail: keepAdmin || undefined,
    backup,
  });

  console.log('✅ نتیجه:', result.message);
  console.log('   MongoDB:', result.mongoDeleted);
  console.log('   Disk mirror:', result.diskCleared);
  if (result.backupFile) console.log('   Backup:', result.backupFile);

  const after = await dbRepo.getDatabaseStatus();
  console.log('📊 بعد از پاکسازی:', after.collections);

  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ خطا:', err?.message || err);
  process.exit(1);
});
