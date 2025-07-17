import axios from "axios";
import { drok } from "../drok/main";
import { Part } from "@google/genai";
import { ClientEvents, Events, Message } from "discord.js";

function format(message: Message<boolean>): void {
    message.content = message.content.replaceAll(`<@${message.client.user.id}>`, "@Drok")
    message.content = `[${message.author.displayName} - ${message.author.id}]: ${message.content}`
}

async function media(message: Message<boolean>): Promise<Part[]> {
    if (message.attachments.size === 0) return []
    const attachments = []
    for (const [id, attachment] of message.attachments) {
        if (attachment.contentType && attachment.contentType.startsWith("image/")) {
            try {
                const response = await axios.get(attachment.url, {
                    responseType: 'arraybuffer'
                });
                const imageBuffer = Buffer.from(response.data);
                attachments.push({
                    inlineData: {
                        mimeType: attachment.contentType,
                        data: imageBuffer.toString('base64'),
                    },
                });
                console.log(`Downloaded image: ${attachment.name}`);
            } catch (imgError) {
                console.error(`Error downloading image ${attachment.url}:`, imgError);
            }
        }
    }
    return attachments
}

async function handle(message: Message<boolean>) {
    // References must be added first
    if (message.reference && message.reference.messageId) {

        // Get all message content
        const refMessage = await message.channel.messages.fetch(message.reference.messageId)
        const refAttachments = await media(refMessage)
        const refAuthor = refMessage.author.id === message.client.user.id ? "model" : "user"

        format(refMessage)
        
        drok.log(refAuthor, refMessage.content, refAttachments, message.channel.id)
    }

    // Add original message
    const attachments = await media(message)
    const author = message.author.id === message.client.user.id ? "model" : "user"

    format(message)

    drok.log(author, message.content, attachments, message.channel.id)
}


module.exports = {
    name: Events.MessageCreate,
    async execute(message: ClientEvents[Events.MessageCreate][0]) {
        if (message.author.id === message.client.user.id) return
        await handle(message)
        if (!message.mentions.has(message.client.user)) return

        try {
            message.channel.sendTyping()
            const reply = await drok.ask(message)
            if (reply) await message.reply(reply)
        } catch (error) {
            console.error(error)
        }
    }
};