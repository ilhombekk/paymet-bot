const fs = require('fs');
const p = 'index.js';
let text = fs.readFileSync(p, 'utf8');
const oldRe = /try \{\r?\n([ \t]*)await bot\.telegram\.sendMessage\(\r?\n([ \t]*)payment\.chat_id,\r?\n([ \t]*)`✅ To‘lovingiz tasdiqlandi\.[\s\S]*?\r?\n([ \t]*)\);\r?\n\r?\n([ \t]*)const oldCaption = ctx\.callbackQuery\.message\.caption \|\| "";/;
const replace = 'try {\r\n$1await bot.telegram.sendMessage(\r\n$2payment.chat_id,\r\n$2`✅ To‘lovingiz tasdiqlandi.\n\nKursga kirish havolasi:\n${inviteLink}`\r\n$1    );\r\n$1} catch (notifyError) {\r\n$1    console.error(\'Foydalanuvchiga xabar yuborishda xato:\', notifyError);\r\n$1    await bot.telegram.sendMessage(\r\n$1        ADMIN_CHAT_ID,\r\n$1        `⚠️ Foydalanuvchiga xabar yuborilmadi: ${notifyError.message || notifyError}`\r\n$1    );\r\n$1}\r\n\r\n$6const oldCaption = ctx.callbackQuery.message.caption || "";';
if (!oldRe.test(text)) {
  console.error('pattern not found');
  process.exit(1);
}
text = text.replace(oldRe, replace);
fs.writeFileSync(p, text, 'utf8');
console.log('patched');
