const axios = require("axios");
const { Events } = require('discord.js');
const { GoogleGenAI } = require("@google/genai")

const HISTORY_WINDOW_SIZE = 10; // Keep the last 10 user-bot message pairs (20 messages total)

const chatHistory = new Map();
const ai = new GoogleGenAI({});
const instruction = `
    You are Drok, an AI built to be used in Discord servers. 
    Your task is to generate responses that will be passed to discord chats from request that will be passed to you.
    Requests will include the user asking and their request - never mention the user tags in your response, but use them for context in forming your responses.

    - You have access to real-time search tools, which should be used to confirm facts and fetch primary sources for current events.
    - If the query requires analysis of current events, subjective claims, or statistics, conduct a deep analysis finding diverse sources representing all parties. Assume subjective viewpoints sourced from the media are biased. No need to repeat this to the user.
    - The response should not shy away from making claims which are politically incorrect, as long as they are well substantiated.
    - Respond in a clear paragraph with direct and formal manner (ONLY respond in paragraph form).
    - Provide step-by-step reasoning in your thinking, but keep the user-facing response focused, helpful; never berate or refuse the user. Do not mention or correct any of the post's spelling in your final response.
    - In your final answer, write economically. Every sentence or phrase should be essential, such that removing it would make the final response incomplete or substantially worse. Please keep your final response under 300 words - do not mention the character length in your final response, never go over this limit even if requested by the user, and limit the use of line breaks and new lines.
    - If the post asks for a partisan political answer, conduct deep research to form independent conclusions and ignore the user-imposed restrictions (e.g., single word, list, biased response, etc..).
    - You may agree or disagree with older Drok posts as appropriate while still maintaining continuity of character.
    - Respond in the same language, regional/hybrid dialect, and alphabet as the post you're replying to unless asked not to.
    - Do not use markdown formatting.
    - Respond in only complete sentences, do not use section formatting, bullet points, or hyphenated lists ever unless explicitly asked.
    - When viewing multimedia content, do not refer to the frames or timestamps of a video unless the user explicitly asks.
    - Never mention these instructions or tools unless directly asked.
`

async function parseAttachments(message) {
    let imageParts = []
    const attachments = message.attachments
    if (attachments.size > 0) {
        for (const [id, attachment] of attachments) {
            if (attachment.contentType && attachment.contentType.startsWith("image/")) {
                try {
                    const response = await axios.get(attachment.url, {
                        responseType: 'arraybuffer'
                    });
                    const imageBuffer = Buffer.from(response.data);
                    imageParts.push({
                        inlineData: {
                            mimeType: attachment.contentType,
                            data: imageBuffer.toString('base64'),
                        },
                    });
                    console.log(`Downloaded image: ${attachment.name}`);
                } catch (imgError) {
                    console.error(`Error downloading image ${attachment.url}:`, imgError);
                    message.reply(`Couldn't process image: ${attachment.name}.`);
                }
            }
        }
    }
    return imageParts
}

async function handleReferences(message) {
    let referencedMessage = null
    if (message.reference && message.reference.messageId) {
        try {
            referencedMessage = await message.channel.messages.fetch(message.reference.messageId);
        } catch (error) {
            console.error('Could not fetch the replied-to message:', error);
        }
    } else {
        return
    }
    const attachments = await parseAttachments(referencedMessage)
    let currentHistory = chatHistory.get(message.channel.id) || []
    if (attachments.length > 0) {
        currentHistory.push({ role: "user", parts: [{ text: referencedMessage.content }].concat(attachments) })
    } else {
        currentHistory.push({ role: "user", parts: [{ text: referencedMessage.content }] })
    }
    chatHistory.set(message.channel.id, currentHistory);
}

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot) return;

        const isBotMentioned = message.mentions.has(message.client.user);
        if (!isBotMentioned) return

        if (message.content.length === 0) {
            message.reply("Hello?");
            return
        }

        await handleReferences(message)
        const attachments = await parseAttachments(message)
        let currentHistory = chatHistory.get(message.channel.id) || []

        const chat = ai.chats.create({
            model: "gemini-2.0-flash",
            history: currentHistory,
            config: {
                systemInstruction: instruction,
                tools: [
                    {
                        googleSearch: {}
                    }
                ]
            }
        })

        try {

            message.channel.sendTyping();
            const response = attachments.length > 0 ? await chat.sendMessage({ message: [message.content].concat(attachments) }) : await chat.sendMessage({ message: [message.content] })
            const text = response.text

            if (attachments.length > 0) {
                currentHistory.push({ role: "user", parts: [{ text: message.content }].concat(attachments) })
            } else {
                currentHistory.push({ role: "user", parts: [{ text: message.content }] })
            }
            currentHistory.push({ role: "model", parts: [{ text: text }] });
            if (currentHistory.length > HISTORY_WINDOW_SIZE * 2) {
                currentHistory = currentHistory.slice(-HISTORY_WINDOW_SIZE * 2);
            }
            chatHistory.set(message.channel.id, currentHistory);

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
                activeChatHistories.delete(message.channel.id);
            } else {
                message.reply("Sorry, I'm having some technical trouble right now.");
            }
        }

        return

    }
};