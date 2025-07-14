const axios = require("axios");
const { Events } = require('discord.js');
const { GoogleGenAI } = require("@google/genai")

const INTEXT_CITATION_NUM = ["⁰", "¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹"]
const HISTORY_WINDOW_SIZE = 10; // Keep the last 10 user-bot message pairs (20 messages total)

const chatHistory = new Map();
const ai = new GoogleGenAI({});
const instruction = `
    You are Drok, a full-of-life Discord bot designed to respond to user messages in a serious, clear, short, and thoughtful manner while maintaining a conversational tone appropriate to the context. 
    Your personality is inspired by characters like Grok from science fiction: logical, perceptive, grounded, and occasionally dryly witty. 
    You are capable of light humor and casual conversation, but you take factual accuracy seriously.

    # Conversation Structure & Mentions:
    You will be given conversation history of Discord chats to use as context for your responses.
    You will be prompted for a response when users mention you directly.
    User messages will be formatted as: [{author_name} - {author_id}] {message}.
    Mentions of other users within messages will appear as <@{mention_id}>. These are tags which send a notification to the user with that id, and are used within messages sent by the author.
    You may address people by their name when it is provided, but NEVER mention users or repeat user IDs in your response unless explicitly asked to.

    # Formatting Rules (Non-Negotiable):
    Write every response as a single, continuous paragraph of MAXIMUM 3 sentences.
    NEVER use bullet points, numbered lists, or any kind of list formatting.
    NEVER insert paragraph breaks or line breaks.
    Integrate all examples, clarifications, and elaborations into a smooth, flowing paragraph regardless of complexity.
    Even when providing multiple points, do so conversationally within the paragraph.
    NEVER BREAK THESE RULES AND NEVER USE MARKDOWN STYLING.

    # Tone and Behavior:
    You adjust your tone based on the context: when a user asks seriously, you answer seriously; when they joke, you may joke back within reason. 
    You are thoughtful, perceptive, and unafraid to offer a dry or witty remark, but you are never rude, mean-spirited, or crass. 
    Avoid over-explaining, but ensure your answers feel complete and well-considered.

    # Source-Checking and Factual Accuracy:
    When answering factual, technical, legal, medical, scientific, or historical questions, prioritize accuracy. 
    If necessary, you may state the limits of current knowledge. 
    You are expected to use your search functionality when appropriate to verify or research answers. 
    This is especially important when asked about recent events, rules, policies, or information where precision matters. 
    If you cannot find trustworthy information, it is better to say so than to guess.
    Do not be afraid to say 'politically incorrect' statements as long as they are substantiated.
    When answering, you should explain how you know something (e.g., "According to official rules as of 2025," or "Based on publicly available data").

    # Identity & Character:
    You are Drok, never refer to yourself as being Gemini or created by Google.
    You do not break character.
    You are grounded, observant, thoughtful, and capable of warmth or humor when appropriate, but serious when required.

    # Formatting Rules (Non-Negotiable):
    Write every response as a single, continuous paragraph of MAXIMUM 3 sentences.
    NEVER use bullet points, numbered lists, or any kind of list formatting.
    NEVER insert paragraph breaks or line breaks.
    Integrate all examples, clarifications, and elaborations into a smooth, flowing paragraph regardless of complexity.
    Even when providing multiple points, do so conversationally within the paragraph.
    NEVER BREAK THESE RULES AND NEVER USE MARKDOWN STYLING.
`

/**
 * A function that takes a message and parses through any attachments, returning a ready to insert array which can be given directly to the Gemini API
 * @param {*} message 
 * @returns An array of objects which can be added to the Gemini API query directly
 */
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

/**
 * A function that checks the message to see if it is a reply. If it is, it adds the reply to the chat history for the channel.
 * @param {*} message 
 * @returns nothing
 */
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
    if (referencedMessage.author.bot) return
    const attachments = await parseAttachments(referencedMessage)
    let currentHistory = chatHistory.get(message.channel.id) || []
    if (attachments && attachments.length > 0) {
        currentHistory.push({ role: "user", parts: [{ text: referencedMessage.content }].concat(attachments) })
    } else {
        currentHistory.push({ role: "user", parts: [{ text: referencedMessage.content }] })
    }
    chatHistory.set(message.channel.id, currentHistory)
}

function updateHistory(role, text, attachments, channelID) {

    if (role != "user" && role != "model") {
        console.error("Variable 'role' must be either 'model' or 'user' - chat history not updated.")
        return
    }
    if (!text) {
        console.error("Variable 'text' is not valid - chat history not updated.")
        return
    }

    const parts = attachments.length > 0 ? [{ text: text }].concat(attachments) : [{ text: text }]

    let currentHistory = chatHistory.get(channelID) || []
    currentHistory.push({ role: "user", parts: parts })
    if (currentHistory.length > HISTORY_WINDOW_SIZE * 2) {
        currentHistory = currentHistory.slice(-HISTORY_WINDOW_SIZE * 2);
    }
    chatHistory.set(channelID, currentHistory)

}

function formatResponse(response) {
    let text = response.text;
    return text
}

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {

        if (message.author.bot) return

        // Processing the message for context & attachments
        await handleReferences(message)
        const attachments = await parseAttachments(message)
        
        // Store each message in history
        updateHistory("user", `[${message.author.displayName} - ${message.author.id}]: ${message.content}`, attachments, message.channel.id)

        // Only respond to specific message
        if (!message.mentions.has(message.client.user)) return
        if (message.content.length === 0) return

        // Create an AI chat with context using Gemini API
        const chat = ai.chats.create({
            model: "gemini-2.0-flash",
            history: chatHistory.get(message.channel.id) || [],
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

            // Query AI
            const response = attachments.length > 0 ? await chat.sendMessage({ message: [message.content].concat(attachments) }) : await chat.sendMessage({ message: [message.content] })
            const text = formatResponse(response)

            // Update chat history with bot output
            updateHistory("model", text, [], message.channel.id)

            // Send message to Discord
            if (text.length > 2000) {
                // const chunks = text.match(/[\s\S]{1,1999}/g);
                let msg = "-# Drok may have long responses despite their instruction. Some messages may get cut off.\n" + text.slice(0, 1900)
                await message.reply(msg)
            // for (const chunk of chunks) {
            //     await message.reply(chunk);
            // }
            } else {
                await message.reply(text);
            }
            
        } catch (error) {
            console.error("Error with Gemini API or Discord:", error);
            if (error.message.includes("candidate was blocked")) {
                message.reply("Sorry, I couldn't respond to that. The content may have violated safety guidelines. Let's try a fresh start!");
                activeChatHistories.delete(message.channel.id);
            } else {
                return
            }
        }
        console.log(JSON.stringify(chatHistory.get(message.channel.id)))
        return

    }
};