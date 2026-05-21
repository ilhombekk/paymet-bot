const fs = require('fs');
const path = 'index.js';
let text = fs.readFileSync(path, 'utf8');
const oldRe = /        try \{\r?\n            await bot\.telegram\.sendMessage\(\r?\n                payment\.chat_id,\r?\n\s*`✅ To‘lovingiz tasdiqlandi\.[\s\S]*?\r?\n        \);\r?\n\r?\n        const oldCaption = ctx\.callbackQuery\.message\.caption \|\| "";\r?\n/;
const neu = `        try {\r
            await bot.telegram.sendMessage(\r\n                payment.chat_id,\r\n                \`✅ To‘lovingiz tasdiqlandi.\n\nKursga kirish havolasi:\n${inviteLink}\`\r\n            );\r\n        } catch (notifyError) {\r\n            console.error('Foydalanuvchiga xabar yuborishda xato:', notifyError);\r\n            await bot.telegram.sendMessage(\r\n                ADMIN_CHAT_ID,\r\n                \`⚠️ Foydalanuvchiga xabar yuborilmadi: ${notifyError.message || notifyError}\`\r\n            );\r\n        }\r\n\r\n        const oldCaption = ctx.callbackQuery.message.caption || "";\r\n`;
if (!oldRe.test(text)) {
  console.error('pattern not found');
  process.exit(1);
}
text = text.replace(oldRe, neu);
fs.writeFileSync(path, text, 'utf8');
console.log('patched');
