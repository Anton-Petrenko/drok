import { Type } from "@google/genai";

export const ImageGenDeclaration = {
    name: "generate_image",
    description: "Draw an image when explicitly directed to",
    parameters: {
        type: Type.OBJECT,
        properties: {
            image_description: {
                type: Type.STRING,
                description: "A verbal description of what the image should look like."
            }
        }
    }
}