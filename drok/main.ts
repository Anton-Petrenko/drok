import { historySize, instruction } from './lib'
import { AttachmentBuilder, Message } from 'discord.js'
import { ImageGenDeclaration } from './functions/image'
import { Content, GenerateContentResponse, GoogleGenAI, Modality, Part } from '@google/genai'
import { SearchDeclaration } from './functions/search';

/**
 * FEATURES TO ADD
 * 2. URL Context
 * 3. Setting Scheduled Messages
 * 4. Sharing Links
 * 5. Make a Discord Event
 */

class Drok {

    #drok = new GoogleGenAI({});
    #chatHistory: Map<string, Content[]> = new Map();

    async ask(message: Message<boolean>) {

        const chat = this.#drok.chats.create({
            model: "gemini-2.5-flash-lite-preview-06-17",
            config: {
                systemInstruction: instruction,
                tools: [
                    {
                        functionDeclarations: [
                            ImageGenDeclaration,
                            SearchDeclaration
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
                const image = await this.draw(args, channelID)
                if (!image?.data) return
                const attachment = new AttachmentBuilder(Buffer.from(image.data, "base64"), { name: 'drok-image.png' })
                drok.log("model", response.text || "", [{ inlineData: { mimeType: image.mimeType, data: image.data } }], channelID)
                return { files: [attachment] }
            } else if (name === "get_information") {
                const answer = await this.google(args, channelID)
                if (!answer) return
                drok.log("model", answer, [], channelID)
                return answer
            }
        }
        return undefined
    }

    async draw(args: Record<any, any> | undefined, channelID: string) {
        console.info("[Function] image")
        if (!args) return
        const { image_description } = args
        const chat = this.#drok.chats.create({
            model: "gemini-2.0-flash-preview-image-generation",
            history: this.#chatHistory.get(channelID),
            config: {
                responseModalities: [Modality.IMAGE, Modality.TEXT]
            }
        })
        const response = await chat.sendMessage({ message: image_description })
        if (!response.candidates?.[0]?.content?.parts) return
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData?.data) return part.inlineData
        }
    }

    async google(args: Record<any, any> | undefined, channelID: string) {
        console.info("[Function] google")
        if (!args) return
        const { search_for } = args
        const chat = this.#drok.chats.create({
            model: "gemini-2.5-flash-lite-preview-06-17",
            history: this.#chatHistory.get(channelID),
            config: {
                systemInstruction: "Your job is to search the internet to address the prompt given to you and summarize the results of that search in 2 sentences or less.",
                tools: [
                    {
                        googleSearch: {}
                    }
                ]
            }
        })
        const response = await chat.sendMessage({ message: search_for })
        if (response.text) return response.text
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