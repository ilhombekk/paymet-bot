require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");
const { Telegraf, Markup } = require("telegraf");

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = String(process.env.ADMIN_CHAT_ID || "");
const COURSE_CHAT_ID = process.env.COURSE_CHAT_ID || "";
const CARD_NUMBER = process.env.CARD_NUMBER || "8600 0000 0000 0000";
const VIDEO_FILE_ID_OR_URL = process.env.VIDEO_FILE_ID_OR_URL || "";
const PORT = Number(process.env.PORT || 3000);

if (!BOT_TOKEN) {
    throw new Error("BOT_TOKEN topilmadi");
}

if (!ADMIN_CHAT_ID) {
    throw new Error("ADMIN_CHAT_ID topilmadi");
}

const bot = new Telegraf(BOT_TOKEN);
const app = express();

app.get("/", (req, res) => {
    res.status(200).send("Bot ishlayapti");
});

const DATA_FILE = path.join(__dirname, "data.json");

function loadData() {
    if (!fs.existsSync(DATA_FILE)) {
        return { payments: [] };
    }
    
    try {
        const raw = fs.readFileSync(DATA_FILE, "utf8");
        const parsed = JSON.parse(raw);
        
        if (!parsed.payments || !Array.isArray(parsed.payments)) {
            return { payments: [] };
        }
        
        return parsed;
    } catch (error) {
        console.error("data.json o‘qishda xato:", error);
        return { payments: [] };
    }
}

function saveData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
    } catch (error) {
        console.error("data.json yozishda xato:", error);
    }
}

const db = loadData();
const sessions = new Map();

function getSession(userId) {
    if (!sessions.has(userId)) {
        sessions.set(userId, {
            step: "idle",
            phone: "",
            fullName: ""
        });
    }
    
    return sessions.get(userId);
}

function resetSession(userId) {
    sessions.set(userId, {
        step: "idle",
        phone: "",
        fullName: ""
    });
}

function createPaymentRequest(user) {
    const id = Date.now().toString();
    
    const payment = {
        id,
        userId: user.userId,
        chatId: user.chatId,
        username: user.username || "",
        firstName: user.firstName || "",
        phone: user.phone || "",
        fullName: user.fullName || "",
        status: "pending",
        createdAt: new Date().toISOString(),
        screenshotFileId: "",
        approvedAt: null,
        rejectedAt: null,
        inviteLink: ""
    };
    
    db.payments.push(payment);
    saveData(db);
    
    return payment;
}

function findPaymentById(id) {
    return db.payments.find((item) => item.id === id);
}

function updatePayment(id, patch) {
    const payment = db.payments.find((item) => item.id === id);
    
    if (!payment) return null;
    
    Object.assign(payment, patch);
    saveData(db);
    
    return payment;
}

async function sendCourseVideo(ctx) {
    if (!VIDEO_FILE_ID_OR_URL) {
        await ctx.reply("Video hozircha sozlanmagan.");
        return;
    }
    
    try {
        if (
            VIDEO_FILE_ID_OR_URL.startsWith("http://") ||
            VIDEO_FILE_ID_OR_URL.startsWith("https://")
        ) {
            await ctx.replyWithVideo(
                { url: VIDEO_FILE_ID_OR_URL },
                { caption: "🎥 Kurs haqida video" }
            );
        } else {
            await ctx.replyWithVideo(VIDEO_FILE_ID_OR_URL, {
                caption: "🎥 Kurs haqida video"
            });
        }
    } catch (error) {
        console.error("Video yuborishda xato:", error);
        await ctx.reply("Videoni yuborib bo‘lmadi.");
    }
}

bot.start(async (ctx) => {
    const userId = String(ctx.from.id);
    
    resetSession(userId);
    
    const session = getSession(userId);
    session.step = "awaiting_phone";
    
    await ctx.reply(
        "Assalomu alaykum.\n\nTelefon raqamingizni yuboring:",
        Markup.keyboard([
            [Markup.button.contactRequest("📱 Telefon raqamni yuborish")]
        ])
        .resize()
        .oneTime()
    );
});

bot.on("contact", async (ctx) => {
    const userId = String(ctx.from.id);
    const session = getSession(userId);
    
    if (session.step !== "awaiting_phone") {
        return;
    }
    
    const contact = ctx.message.contact;
    
    if (!contact) {
        await ctx.reply("Telefon raqam yuboring.");
        return;
    }
    
    if (String(contact.user_id || "") !== userId) {
        await ctx.reply("Iltimos, o‘zingizning telefon raqamingizni yuboring.");
        return;
    }
    
    session.phone = contact.phone_number;
    session.step = "awaiting_name";
    
    await ctx.reply(
        "Rahmat.\n\nEndi ism familiyangizni yozing:",
        Markup.removeKeyboard()
    );
});

bot.on("text", async (ctx, next) => {
    const text = ctx.message.text;
    
    if (text.startsWith("/")) {
        return next();
    }
    
    const userId = String(ctx.from.id);
    const session = getSession(userId);
    
    if (session.step === "awaiting_name") {
        session.fullName = text.trim();
        session.step = "ready_for_course";
        
        await ctx.reply(`Rahmat, ${session.fullName}.`);
        await sendCourseVideo(ctx);
        
        await ctx.reply(
            "Kursga yozilish uchun tugmani bosing:",
            Markup.inlineKeyboard([
                [Markup.button.callback("📚 Kursga yozilish", "join_course")]
            ])
        );
        
        return;
    }
    
    if (session.step === "awaiting_screenshot") {
        await ctx.reply("Iltimos, to‘lov skrinshotini rasm qilib yuboring.");
        return;
    }
    
    return next();
});

bot.action("join_course", async (ctx) => {
    const userId = String(ctx.from.id);
    const session = getSession(userId);
    
    if (!session.phone || !session.fullName) {
        await ctx.answerCbQuery("Avval /start bosing");
        return;
    }
    
    session.step = "awaiting_screenshot";
    
    await ctx.answerCbQuery();
    
    await ctx.reply(
        `💳 To‘lov uchun karta raqami:\n\n${CARD_NUMBER}\n\nTo‘lov qilganingizdan keyin skrinshot yuboring.`
    );
});

bot.on("photo", async (ctx, next) => {
    const userId = String(ctx.from.id);
    const session = getSession(userId);
    
    if (session.step !== "awaiting_screenshot") {
        return next();
    }
    
    const photos = ctx.message.photo || [];
    const largestPhoto = photos[photos.length - 1];
    
    if (!largestPhoto) {
        await ctx.reply("Skrinshotni rasm ko‘rinishida yuboring.");
        return;
    }
    
    const payment = createPaymentRequest({
        userId,
        chatId: String(ctx.chat.id),
        username: ctx.from.username || "",
        firstName: ctx.from.first_name || "",
        phone: session.phone,
        fullName: session.fullName
    });
    
    updatePayment(payment.id, {
        screenshotFileId: largestPhoto.file_id
    });
    
    const adminCaption =
    `🧾 Yangi to‘lov skrinshoti\n\n` +
    `ID: ${payment.id}\n` +
    `Ism familiya: ${session.fullName}\n` +
    `Telefon: ${session.phone}\n` +
    `Username: ${ctx.from.username ? "@" + ctx.from.username : "yo‘q"}\n` +
    `User ID: ${userId}\n` +
    `Status: Kutilmoqda`;
    
    await bot.telegram.sendPhoto(ADMIN_CHAT_ID, largestPhoto.file_id, {
        caption: adminCaption,
        ...Markup.inlineKeyboard([
            [
                Markup.button.callback("✅ Tasdiqlash", `approve_${payment.id}`),
                Markup.button.callback("❌ Bekor qilish", `reject_${payment.id}`)
            ]
        ])
    });
    
    session.step = "waiting_admin";
    
    await ctx.reply("✅ Skrinshot adminga yuborildi.\n\nTasdiqlanishini kuting.");
});

bot.action(/approve_(.+)/, async (ctx) => {
    if (String(ctx.from.id) !== ADMIN_CHAT_ID) {
        await ctx.answerCbQuery("Siz admin emassiz");
        return;
    }
    
    const paymentId = ctx.match[1];
    const payment = findPaymentById(paymentId);
    
    if (!payment) {
        await ctx.answerCbQuery("To‘lov topilmadi");
        return;
    }
    
    if (payment.status === "approved") {
        await ctx.answerCbQuery("Bu to‘lov avval tasdiqlangan");
        return;
    }
    
    if (!COURSE_CHAT_ID) {
        await ctx.answerCbQuery("COURSE_CHAT_ID yozilmagan");
        await bot.telegram.sendMessage(
            ADMIN_CHAT_ID,
            "⚠️ COURSE_CHAT_ID yozilmagan. Railway Variables ichiga yozing."
        );
        return;
    }
    
    try {
        const expireDate = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
        
        const invite = await bot.telegram.createChatInviteLink(COURSE_CHAT_ID, {
            name: `course_${payment.userId}_${payment.id}`,
            member_limit: 1,
            expire_date: expireDate
        });
        
        updatePayment(paymentId, {
            status: "approved",
            approvedAt: new Date().toISOString(),
            inviteLink: invite.invite_link
        });
        
        await bot.telegram.sendMessage(
            payment.chatId,
            `✅ To‘lovingiz tasdiqlandi.\n\nKursga kirish havolasi:\n${invite.invite_link}`
        );
        
        const oldCaption = ctx.callbackQuery.message.caption || "";
        
        await ctx.editMessageCaption(`${oldCaption}\n\n✅ TASDIQLANDI`);
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
        await ctx.answerCbQuery("Tasdiqlandi");
    } catch (error) {
        console.error("Tasdiqlashda xato:", error);
        await ctx.answerCbQuery("Xatolik bo‘ldi");
    }
});

bot.action(/reject_(.+)/, async (ctx) => {
    if (String(ctx.from.id) !== ADMIN_CHAT_ID) {
        await ctx.answerCbQuery("Siz admin emassiz");
        return;
    }
    
    const paymentId = ctx.match[1];
    const payment = findPaymentById(paymentId);
    
    if (!payment) {
        await ctx.answerCbQuery("To‘lov topilmadi");
        return;
    }
    
    updatePayment(paymentId, {
        status: "rejected",
        rejectedAt: new Date().toISOString()
    });
    
    await bot.telegram.sendMessage(
        payment.chatId,
        "❌ To‘lov tasdiqlanmadi.\n\nIltimos, qayta tekshirib yuboring."
    );
    
    const oldCaption = ctx.callbackQuery.message.caption || "";
    
    await ctx.editMessageCaption(`${oldCaption}\n\n❌ BEKOR QILINDI`);
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await ctx.answerCbQuery("Bekor qilindi");
});

bot.command("admin", async (ctx) => {
    if (String(ctx.from.id) !== ADMIN_CHAT_ID) {
        return;
    }
    
    const pending = db.payments.filter((p) => p.status === "pending").length;
    const approved = db.payments.filter((p) => p.status === "approved").length;
    const rejected = db.payments.filter((p) => p.status === "rejected").length;
    
    await ctx.reply(
        `📊 Statistika\n\n` +
        `Kutilmoqda: ${pending}\n` +
        `Tasdiqlangan: ${approved}\n` +
        `Bekor qilingan: ${rejected}\n` +
        `Jami: ${db.payments.length}`
    );
});

async function startBot() {
    try {
        await bot.telegram.deleteWebhook();
        await bot.launch({
            dropPendingUpdates: true
        });
        console.log("Bot ishga tushdi");
    } catch (error) {
        console.error("Botni ishga tushirishda xatolik:", error);
    }
}

app.listen(PORT, async () => {
    console.log(`Server ${PORT} portda ishlayapti`);
    await startBot();
});

process.on("unhandledRejection", (err) => {
    console.error("Unhandled error:", err);
});

process.on("uncaughtException", (err) => {
    console.error("Uncaught error:", err);
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));