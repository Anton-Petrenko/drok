import { historySize, instruction } from './lib'
import { AttachmentBuilder, Message } from 'discord.js'
import { ImageGenDeclaration } from './functions/image'
import { Content, GenerateContentResponse, GoogleGenAI, Modality, Part } from '@google/genai'

/**
 * FEATURES TO ADD
 * 1. Google Search
 * 2. URL Context
 * 3. Setting Scheduled Messages
 * 4. Sharing Links
 * 5. Make a Discord Event
 */

class Drok {

    #drok = new GoogleGenAI({});
    #chatHistory: Map<string, Content[]> = new Map();

    async draw({ image_description }: any) {
        const response = await this.#drok.models.generateContent({
            model: "gemini-2.0-flash-preview-image-generation",
            contents: image_description,
            config: {
                responseModalities: [Modality.IMAGE, Modality.TEXT]
            }
        })
        if (!response.candidates?.[0]?.content?.parts) return
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData?.data) return part.inlineData
        }
    }

    async ask(message: Message<boolean>) {

        console.log(JSON.stringify(this.#chatHistory.get(message.channel.id)))
        const chat = this.#drok.chats.create({
            model: "gemini-2.5-flash-lite-preview-06-17",
            config: {
                systemInstruction: instruction,
                tools: [
                    {
                        functionDeclarations: [
                            ImageGenDeclaration
                        ]
                    }
                ],
                responseModalities: [Modality.TEXT]
            },
            history: this.#chatHistory.get(message.channel.id) || []
        })

        const response = await chat.sendMessage({ message: message.content })
        const reply = await this.delegate(response, message.channel.id)
        if (reply) return message.reply(reply)
        if (response.text) {
            drok.log("model", response.text, [], message.channel.id)
            message.reply(response.text)
        }
    }

    async delegate(response: GenerateContentResponse, channelID: string): Promise<any | undefined> {
        // Only supports one function call (no daisy chains)
        if (response.functionCalls && response.functionCalls.length > 0) {
            const { name, args } = response.functionCalls[0]
            if (name === "generate_image") {
                const image = await this.draw(args)
                if (!image?.data) return
                const attachment = new AttachmentBuilder(Buffer.from(image.data, "base64"), { name: 'drok-image.png' })
                drok.log("model", response.text || "", [{ inlineData: { mimeType: image.mimeType, data: image.data } }], channelID)
                return { files: [attachment] }
            }
        }
        return undefined
    }

    log(author: "model" | "user", text: string, attachments: Part[], channelID: string) {

        // Create object to push to history
        const parts: Part[] = attachments ? ([{ text: text }] as Part[]).concat(attachments) : [{ text: text }]
        const newLog: Content = { role: author, parts: parts }

        // Dynamically handle existing history
        let channelHistory = this.#chatHistory.get(channelID)
        if (!channelHistory) {
            this.#chatHistory.set(channelID, [newLog])
            return
        }
        if (channelHistory.length === historySize) {  
            channelHistory = channelHistory.slice(1)
        }
        channelHistory.push(newLog)

        this.#chatHistory.set(channelID, channelHistory)

    }

}

export const drok = new Drok()