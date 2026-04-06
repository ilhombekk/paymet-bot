require("dotenv").config();

const path = require("path");
const express = require("express");
const { Telegraf, Markup } = require("telegraf");
const { createClient } = require("@supabase/supabase-js");

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = String(process.env.ADMIN_CHAT_ID || "");
const COURSE_CHAT_ID = process.env.COURSE_CHAT_ID || "";
const CARD_NUMBER = process.env.CARD_NUMBER || "8600 0000 0000 0000";
const VIDEO_FILE_ID_OR_URL = process.env.VIDEO_FILE_ID_OR_URL || "";
const ADMIN_PANEL_PASSWORD = process.env.ADMIN_PANEL_PASSWORD || "12345";
const PORT = Number(process.env.PORT || 3000);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!BOT_TOKEN) throw new Error("BOT_TOKEN topilmadi");
if (!ADMIN_CHAT_ID) throw new Error("ADMIN_CHAT_ID topilmadi");
if (!SUPABASE_URL) throw new Error("SUPABASE_URL topilmadi");
if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY topilmadi");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

const bot = new Telegraf(BOT_TOKEN);
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/public", express.static(path.join(__dirname, "public")));

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

async function createPaymentRequest(user) {
    const id = Date.now().toString();
    
    const payload = {
        id,
        user_id: user.userId,
        chat_id: user.chatId,
        username: user.username || "",
        first_name: user.firstName || "",
        phone: user.phone || "",
        full_name: user.fullName || "",
        status: "pending",
        paid: false,
        screenshot_file_id: "",
        invite_link: ""
    };
    
    const { data, error } = await supabase
    .from("payments")
    .insert(payload)
    .select()
    .single();
    
    if (error) throw error;
    
    return data;
}

async function findPaymentById(id) {
    const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("id", id)
    .maybeSingle();
    
    if (error) throw error;
    
    return data;
}

async function updatePayment(id, patch) {
    const { data, error } = await supabase
    .from("payments")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
    
    if (error) throw error;
    
    return data;
}

async function getPaymentStats() {
    const { data, error } = await supabase
    .from("payments")
    .select("status");
    
    if (error) throw error;
    
    const pending = data.filter((item) => item.status === "pending").length;
    const approved = data.filter((item) => item.status === "approved").length;
    const rejected = data.filter((item) => item.status === "rejected").length;
    
    return {
        pending,
        approved,
        rejected,
        total: data.length
    };
}

async function getPaymentsPage(page = 1, limit = 5) {
    const safePage = Math.max(Number(page) || 1, 1);
    const safeLimit = Math.max(Number(limit) || 5, 1);
    const from = (safePage - 1) * safeLimit;
    const to = from + safeLimit - 1;
    
    const { data, count, error } = await supabase
    .from("payments")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);
    
    if (error) throw error;
    
    return {
        items: data || [],
        total: count || 0,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil((count || 0) / safeLimit) || 1
    };
}

function getStatusText(status) {
    if (status === "approved") return "✅ Tasdiqlangan";
    if (status === "rejected") return "❌ Bekor qilingan";
    return "⏳ Kutilmoqda";
}

function buildPaymentsText(result) {
    if (!result.items.length) {
        return "To‘lovlar ro‘yxati bo‘sh.";
    }
    
    let text = `📋 To‘lovlar ro‘yxati\n`;
    text += `Sahifa: ${result.page}/${result.totalPages}\n`;
    text += `Jami: ${result.total}\n\n`;
    
    result.items.forEach((item, index) => {
        const number = (result.page - 1) * result.limit + index + 1;
        const paidText = item.paid ? "Ha" : "Yo‘q";
        
        text += `${number}) ${item.full_name || "-"}\n`;
        text += `📞 ${item.phone || "-"}\n`;
        text += `💳 To‘lov qildi: ${paidText}\n`;
        text += `📌 Status: ${getStatusText(item.status)}\n`;
        text += `🕒 ${item.created_at ? new Date(item.created_at).toLocaleString() : "-"}\n\n`;
    });
    
    return text;
}

function buildPaymentsKeyboard(page, totalPages) {
    const prevPage = page > 1 ? page - 1 : 1;
    const nextPage = page < totalPages ? page + 1 : totalPages;
    
    return Markup.inlineKeyboard([
        [
            Markup.button.callback("⬅️ Oldingi", `payments_page_${prevPage}`),
            Markup.button.callback(`${page}/${totalPages}`, "payments_current"),
            Markup.button.callback("Keyingi ➡️", `payments_page_${nextPage}`)
        ],
        [
            Markup.button.callback("🔄 Yangilash", `payments_page_${page}`)
        ]
    ]);
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
    
    if (session.step !== "awaiting_phone") return;
    
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
    
    try {
        const payment = await createPaymentRequest({
            userId,
            chatId: String(ctx.chat.id),
            username: ctx.from.username || "",
            firstName: ctx.from.first_name || "",
            phone: session.phone,
            fullName: session.fullName
        });
        
        await updatePayment(payment.id, {
            screenshot_file_id: largestPhoto.file_id
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
    } catch (error) {
        console.error("Photo handler xato:", error);
        await ctx.reply("Saqlashda xatolik bo‘ldi.");
    }
});

bot.action(/approve_(.+)/, async (ctx) => {
    if (String(ctx.from.id) !== ADMIN_CHAT_ID) {
        await ctx.answerCbQuery("Siz admin emassiz");
        return;
    }
    
    const paymentId = ctx.match[1];
    
    try {
        const payment = await findPaymentById(paymentId);
        
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
                "⚠️ COURSE_CHAT_ID yozilmagan."
            );
            return;
        }
        
        const expireDate = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
        
        const invite = await bot.telegram.createChatInviteLink(COURSE_CHAT_ID, {
            name: `course_${payment.user_id}_${payment.id}`,
            member_limit: 1,
            expire_date: expireDate
        });
        
        await updatePayment(paymentId, {
            status: "approved",
            paid: true,
            approved_at: new Date().toISOString(),
            invite_link: invite.invite_link
        });
        
        await bot.telegram.sendMessage(
            payment.chat_id,
            `✅ To‘lovingiz tasdiqlandi.\n\nKursga kirish havolasi:\n${invite.invite_link}`
        );
        
        const oldCaption = ctx.callbackQuery.message.caption || "";
        await ctx.editMessageCaption(`${oldCaption}\n\n✅ TASDIQLANDI`);
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
        await ctx.answerCbQuery("Tasdiqlandi");
    } catch (error) {
        console.error("Approve xato:", error);
        await ctx.answerCbQuery("Xatolik bo‘ldi");
    }
});

bot.action(/reject_(.+)/, async (ctx) => {
    if (String(ctx.from.id) !== ADMIN_CHAT_ID) {
        await ctx.answerCbQuery("Siz admin emassiz");
        return;
    }
    
    const paymentId = ctx.match[1];
    
    try {
        const payment = await findPaymentById(paymentId);
        
        if (!payment) {
            await ctx.answerCbQuery("To‘lov topilmadi");
            return;
        }
        
        await updatePayment(paymentId, {
            status: "rejected",
            paid: false,
            rejected_at: new Date().toISOString()
        });
        
        await bot.telegram.sendMessage(
            payment.chat_id,
            "❌ To‘lov tasdiqlanmadi.\n\nIltimos, qayta tekshirib yuboring."
        );
        
        const oldCaption = ctx.callbackQuery.message.caption || "";
        await ctx.editMessageCaption(`${oldCaption}\n\n❌ BEKOR QILINDI`);
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
        await ctx.answerCbQuery("Bekor qilindi");
    } catch (error) {
        console.error("Reject xato:", error);
        await ctx.answerCbQuery("Xatolik bo‘ldi");
    }
});

bot.command("admin", async (ctx) => {
    if (String(ctx.from.id) !== ADMIN_CHAT_ID) return;
    
    try {
        const stats = await getPaymentStats();
        
        await ctx.reply(
            `📊 Statistika\n\n` +
            `Kutilmoqda: ${stats.pending}\n` +
            `Tasdiqlangan: ${stats.approved}\n` +
            `Bekor qilingan: ${stats.rejected}\n` +
            `Jami: ${stats.total}`
        );
    } catch (error) {
        console.error("Admin stats xato:", error);
        await ctx.reply("Statistikani olishda xatolik bo‘ldi.");
    }
});

bot.command("payments", async (ctx) => {
    if (String(ctx.from.id) !== ADMIN_CHAT_ID) {
        return;
    }
    
    try {
        const result = await getPaymentsPage(1, 5);
        const text = buildPaymentsText(result);
        
        await ctx.reply(
            text,
            buildPaymentsKeyboard(result.page, result.totalPages)
        );
    } catch (error) {
        console.error("Payments command xato:", error);
        await ctx.reply("To‘lovlar ro‘yxatini olib bo‘lmadi.");
    }
});

bot.action("payments_current", async (ctx) => {
    await ctx.answerCbQuery();
});

bot.action(/payments_page_(\d+)/, async (ctx) => {
    if (String(ctx.from.id) !== ADMIN_CHAT_ID) {
        await ctx.answerCbQuery("Siz admin emassiz");
        return;
    }
    
    try {
        const requestedPage = Number(ctx.match[1] || 1);
        const result = await getPaymentsPage(requestedPage, 5);
        
        const safePage = Math.min(
            Math.max(requestedPage, 1),
            Math.max(result.totalPages, 1)
        );
        
        const finalResult = await getPaymentsPage(safePage, 5);
        const text = buildPaymentsText(finalResult);
        
        await ctx.editMessageText(
            text,
            buildPaymentsKeyboard(finalResult.page, finalResult.totalPages)
        );
        
        await ctx.answerCbQuery();
    } catch (error) {
        console.error("Payments pagination xato:", error);
        await ctx.answerCbQuery("Xatolik bo‘ldi");
    }
});

function checkAdminPanelAuth(req, res, next) {
    const password = req.headers["x-admin-password"] || req.query.password;
    
    if (password !== ADMIN_PANEL_PASSWORD) {
        return res.status(401).json({ error: "Parol noto‘g‘ri" });
    }
    
    next();
}

app.get("/", (req, res) => {
    res.send("Bot ishlayapti");
});

app.get("/admin", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("/admin/api/payments", checkAdminPanelAuth, async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page || "1", 10), 1);
        const limit = Math.max(parseInt(req.query.limit || "10", 10), 1);
        const from = (page - 1) * limit;
        const to = from + limit - 1;
        
        const { data, count, error } = await supabase
        .from("payments")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);
        
        if (error) throw error;
        
        const total = count || 0;
        const totalPages = Math.ceil(total / limit) || 1;
        
        const items = (data || []).map((item) => ({
            id: item.id,
            fullName: item.full_name || "",
            phone: item.phone || "",
            paid: item.paid === true,
            status: item.status || "pending",
            createdAt: item.created_at || ""
        }));
        
        res.json({
            page,
            limit,
            total,
            totalPages,
            items
        });
    } catch (error) {
        console.error("Admin API xato:", error);
        res.status(500).json({ error: "Server xatosi" });
    }
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