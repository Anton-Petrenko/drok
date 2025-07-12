require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); // Define model once

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// Store active chat sessions. Key: channel ID, Value: Gemini ChatSession object
const activeChats = new Map();

client.on("ready", () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on("messageCreate", async (message) => {
    // Ignore messages from the bot itself
    if (message.author.bot) return;

    // Check if the bot is mentioned or if it's a DM
    const isBotMentioned = message.mentions.has(client.user);
    const isDirectMessage = message.channel.type === 1; // 1 means DM

    // If not mentioned in a guild channel and not a DM, ignore
    if (!isBotMentioned && !isDirectMessage) return;

    let userMessage = message.content;

    // Remove bot mention if present in a guild channel
    if (isBotMentioned && !isDirectMessage) {
        userMessage = userMessage.replace(`<@${client.user.id}>`, "").trim();
    }

    if (userMessage.length === 0) {
        if (isBotMentioned || isDirectMessage) {
            message.reply("Hello! How can I help you today?");
        }
        return;
    }

    // Get or create a chat session for this channel
    let chat = activeChats.get(message.channel.id);
    if (!chat) {
        chat = model.startChat({
            history: [], // Initialize with empty history for a new chat
        });
        activeChats.set(message.channel.id, chat);
    }

    try {
        // Send typing indicator while processing
        message.channel.sendTyping();

        // Send the message to the ongoing chat session
        const result = await chat.sendMessage(userMessage);
        const response = await result.response;
        const text = response.text();

        // Reply with the generated text
        if (text.length > 2000) {
            // Discord has a 2000 character limit, so split the message if needed
            const chunks = text.match(/[\s\S]{1,1999}/g);
            for (const chunk of chunks) {
                await message.reply(chunk);
            }
        } else {
            await message.reply(text);
        }
    } catch (error) {
        console.error("Error with Gemini API or Discord:", error);
        // If the error indicates a problem with the chat history (e.g., content policy violation mid-conversation),
        // you might want to reset the chat history for that channel.
        if (error.message.includes("candidate was blocked")) {
            message.reply("Sorry, I couldn't respond to that. The content may have violated safety guidelines. Let's try a fresh start!");
            activeChats.delete(message.channel.id); // Clear history for this channel
        } else {
            message.reply("Sorry, I'm having trouble with that request right now.");
        }
    }
});

client.login(DISCORD_BOT_TOKEN);