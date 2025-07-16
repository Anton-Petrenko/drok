import axios from "axios";
import { historySize, instruction, modelName } from './types'
import { Content, GoogleGenAI } from '@google/genai'
import { Message, OmitPartialGroupDMChannel } from 'discord.js'

class Drok {

    #drok = new GoogleGenAI({});
    #chatHistory: Map<string, Content[]> = new Map();

    async prompt(message: OmitPartialGroupDMChannel<Message<boolean>>) {
        const prompt = await this.preprocess(message)
        if (!prompt) return
        const chat = this.createChat(message.channel.id)
        const response = await chat.sendMessage({
            message: prompt
        })
        console.log(JSON.stringify(chat.getHistory()))
        return response
    }

    format(message: Message<boolean>, attachments: { inlineData: { mimeType: string; data: string; }; }[] | null) {
        const { client } = message
        message.content = message.content.replaceAll(`<@${client.user.id}>`, "Drok")
        message.content = `[${message.author.displayName} - ${message.author.id}]: ${message.content}`
        if (!attachments) {
            return [{ text: message.content }]
        } else {
            const text: any[] = [{ text: message.content }]
            return text.concat(attachments)
        }
    }

    async preprocess(message: Message<boolean>) {
        if (!message.reference) {
            const attachments = await this.media(message)
            this.addHistory("user", this.format(message, attachments), message.channel.id)
            return this.format(message, null)
        }
        if (!message.reference.messageId) return

        const referencedMessage = await message.channel.messages.fetch(message.reference.messageId)
        const referencedAttachments = await this.media(message)
        this.addHistory("user", this.format(referencedMessage, referencedAttachments), message.channel.id)
        return this.format(message, referencedAttachments)
    }

    async media(message: Message<boolean>) {
        if (message.attachments.size === 0) return null
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

    addHistory(user: "user" | "model", parts: any[], channelID: string) {
        const channelHistory = this.#chatHistory.get(channelID)
        if (!channelHistory) {
            this.#chatHistory.set(channelID, [{ role: user, parts: parts }])
        } else {
            if (channelHistory.length === historySize) {
                const newChannelHistory = channelHistory.slice(1)
                newChannelHistory.push({ role: user, parts: parts })
                this.#chatHistory.set(channelID, newChannelHistory)
            } else {
                channelHistory.push({ role: user, parts: parts })
                this.#chatHistory.set(channelID, channelHistory)
            }
        }
    }

    createChat(channelID: string) {
        return this.#drok.chats.create({
            model: modelName,
            history: this.#chatHistory.get(channelID) || [],
            config: {
                systemInstruction: instruction,
                tools: [
                    {
                        googleSearch: {}
                    }
                ]
            }
        })
    }

}

export const drok = new Drok()