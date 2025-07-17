import { Type } from "@google/genai";

export const SearchDeclaration = {
    name: "get_information",
    description: "Get any real-time and up-to-date information including the time, current events, breaking news, and research on in depth topics.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            search_for: {
                type: Type.STRING,
                description: "The general topic, question, or query to searh for information about."
            }
        }
    }
}