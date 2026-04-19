import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
const url = `https://api.telegram.org/bot${token}/sendMessage`;

const body = {
  chat_id: chatId,
  text: "Cursor работает автоматически 🚀",
};

const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const data = await res.json();
console.log(JSON.stringify(data, null, 2));
