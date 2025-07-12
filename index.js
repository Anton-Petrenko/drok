require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); // Define model once

const HISTORY_WINDOW_SIZE = 10; // Keep the last 10 user-bot message pairs (20 messages total)

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// Store chat history. Key: channel ID, Value: Array of message parts (Gemini format)
const activeChatHistories = new Map();

client.on("ready", () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    const isBotMentioned = message.mentions.has(client.user);
    const isDirectMessage = message.channel.type === 1;

    if (!isBotMentioned && !isDirectMessage) return;

    let userMessage = message.content;
    if (isBotMentioned && !isDirectMessage) {
        userMessage = userMessage.replace(`<@${client.user.id}>`, "").trim();
    }

    if (userMessage.length === 0) {
        if (isBotMentioned || isDirectMessage) {
            message.reply("Hello! How can I help you today?");
        }
        return;
    }

    // Get current history for this channel, or start fresh
    let currentHistory = activeChatHistories.get(message.channel.id) || [];

    // Create a new chat session with the current (and potentially trimmed) history
    const chat = model.startChat({
        history: currentHistory,
        generationConfig: {
            maxOutputTokens: 1000, // Optional: Limit output token size for responses
        },
    });

    try {
        message.channel.sendTyping();

        const result = await chat.sendMessage(userMessage);
        const response = await result.response;
        const text = response.text();

        // After a successful response, update the history
        // Append user's message and bot's response to the history
        currentHistory.push({ role: "user", parts: [{ text: userMessage }] });
        currentHistory.push({ role: "model", parts: [{ text: text }] });

        // Trim the history to the window size
        // Each "pair" is 2 messages (user + model). So 2 * HISTORY_WINDOW_SIZE messages.
        if (currentHistory.length > HISTORY_WINDOW_SIZE * 2) {
            currentHistory = currentHistory.slice(-HISTORY_WINDOW_SIZE * 2);
        }

        // Store the updated and trimmed history back
        activeChatHistories.set(message.channel.id, currentHistory);

        if (text.length > 2000) {
            const chunks = text.match(/[\s\S]{1,1999}/g);
            for (const chunk of chunks) {
                await message.reply(chunk);
            }
        } else {
            await message.reply(text);
        }
    } catch (error) {
        console.error("Error with Gemini API or Discord:", error);
        if (error.message.includes("candidate was blocked")) {
            message.reply("Sorry, I couldn't respond to that. The content may have violated safety guidelines. Let's try a fresh start!");
            activeChatHistories.delete(message.channel.id); // Clear history for this channel
        } else {
            message.reply("Sorry, I'm having trouble with that request right now.");
        }
    }
});

client.login(DISCORD_BOT_TOKEN);