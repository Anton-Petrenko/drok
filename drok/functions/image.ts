import { Type } from "@google/genai";

export const ImageGenDeclaration = {
    name: "generate_image",
    description: "Create an image",
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