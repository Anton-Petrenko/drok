import { historySize, instruction } from './lib'
import { SearchDeclaration } from './functions/search'
import { AttachmentBuilder, Message } from 'discord.js'
import { ImageGenDeclaration } from './functions/image'
import { Content, FunctionCall, FunctionResponse, GenerateContentResponse, GoogleGenAI, Modality, Part } from '@google/genai'

/**
 * FEATURES TO ADD
 * 2. URL Context
 * 3. Setting Scheduled Messages
 * 4. Sharing Links
 * 5. Make a Discord Event
 */

const ai = new GoogleGenAI({});
const chatHistory: Map<string, Content[]> = new Map();

class Drok {

    async ask(message: Message<boolean>) {
        let responseTag = null
        const drokFunctions: Record<string, (args: Record<any, any> | undefined, channelID: string) => any> = {
            "generate_image": this.draw,
            "get_information": this.google
        }
        while (true) {
            const channelHistory = chatHistory.get(message.channel.id) || []
            const reply = await ai.models.generateContent({
                model: "gemini-2.5-flash-lite-preview-06-17",
                contents: channelHistory,
                config: {
                    systemInstruction: instruction,
                    tools: [
                        {
                            functionDeclarations: [
                                ImageGenDeclaration,
                                SearchDeclaration
                            ]
                        }
                    ]
                }
            })
            if (reply.functionCalls && reply.functionCalls.length > 0) {
                const functionCall = reply.functionCalls[0]
                const { name, args } = functionCall
                console.info(`[drok] ${name}`)
                if (!name) { console.log("[drok] Function call requested with no name"); break; }
                if (!drokFunctions[name]) { console.error("[drok] Unknown function name"); break; }
                if (!responseTag && name === "get_information") responseTag = "-# *Drok searched the web*\n"
                const funcResponse = await drokFunctions[name](args, message.channel.id);
                const funcResponsePart: any = {
                    name: functionCall.name,
                    response: {
                        result: funcResponse
                    }
                }
                console.log(funcResponse)
                if (funcResponsePart.response.result["mimeType"]) {
                    const image = funcResponsePart.response.result
                    if (!image?.data) return
                    const attachment = new AttachmentBuilder(Buffer.from(image.data, "base64"), { name: 'drok-image.png' })
                    this.log("model", null, [{ inlineData: image }], null, null, message.channel.id)
                    return { files: [attachment] }
                } else {
                    this.log("model", null, null, functionCall, null, message.channel.id)
                    this.log("user", null, null, null, funcResponsePart, message.channel.id)
                }
            } else {
                this.log("model", reply.text || null, null, null, null, message.channel.id)
                if (reply.text) return responseTag + reply.text
            }
        }
    }

    async delegate(response: GenerateContentResponse, channelID: string): Promise<any | undefined> {
        if (response.functionCalls && response.functionCalls.length > 0) {
            const { name, args } = response.functionCalls[0]
            if (name === "generate_image") {
                const image = await this.draw(args, channelID)
                if (!image?.data) return
                const attachment = new AttachmentBuilder(Buffer.from(image.data, "base64"), { name: 'drok-image.png' })
                // drok.log("model", response.text || "", [{ inlineData: { mimeType: image.mimeType, data: image.data } }], channelID)
                return { files: [attachment] }
            } else if (name === "get_information") {
                const answer = await this.google(args, channelID)
                if (!answer) return
                // drok.log("model", answer, [], channelID)
                return `-# Drok searched the internet\n${answer}`
            }
        }

        return undefined
    }

    async draw(args: Record<any, any> | undefined, channelID: string) {
        if (!args) return
        const { image_description } = args
        const response = await ai.models.generateContent({
            model: "gemini-2.0-flash-preview-image-generation",
            contents: `Prompt: ${image_description}\n`,
            config: {
                responseModalities: [Modality.IMAGE, Modality.TEXT]
            }
        })
        if (!response.candidates?.[0]?.content?.parts) return
        for (const part of response.candidates[0].content.parts) {
            if (part.text) console.log(`[drok] generate_image: ${part.text}`)
            if (part.inlineData?.data) return part.inlineData
        }
    }

    async google(args: Record<any, any> | undefined, channelID: string) {
        if (!args) return
        const { search_for } = args
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-lite-preview-06-17",
            contents: search_for,
            config: {
                systemInstruction: "Your job is to search the internet to address the prompt given to you and summarize the results of that search.",
                tools: [
                    {
                        googleSearch: {}
                    }
                ]
            }
        })
        if (response.text) return response.text
    }

    log(author: "model" | "user", text: string | null, attachments: Part[] | null, functionCall: FunctionCall | null, functionResponse: FunctionResponse | null, channelID: string) {

        // Create object to push to history
        let parts: Part[] = []
        if (text) parts = parts.concat([{ text: text }])
        if (attachments) parts = parts.concat(attachments)
        if (functionCall) parts = parts.concat([{ functionCall: functionCall }])
        if (functionResponse) parts = parts.concat([{ functionResponse: functionResponse }])
        if (parts.length === 0) {
            console.warn("[drok] Nothing was added to log on request")
            return
        }
        console.log("[drok] logging...")
        const newLog: Content = { role: author, parts: parts }

        // Dynamically handle existing history
        let channelHistory = chatHistory.get(channelID)
        if (!channelHistory) {
            chatHistory.set(channelID, [newLog])
            return
        }
        if (channelHistory.length === historySize) {  
            channelHistory = channelHistory.slice(1)
        }
        channelHistory.push(newLog)

        chatHistory.set(channelID, channelHistory)

    }

}

export const drok = new Drok()