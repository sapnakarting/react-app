
import { GoogleGenAI, Type } from "@google/genai";

/**
 * Service to handle Gemini API interactions for fleet management.
 */

// Fix: Removed global API_KEY and getAi to ensure we initialize the client with process.env.API_KEY inside the functions.
export const getFleetInsights = async (state: any) => {
  try {
    // Fix: Create a new GoogleGenAI instance right before making an API call using process.env.API_KEY.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `You are a world-class fleet management analyst. Analyze the following fleet data and provide 3 high-impact, actionable insights to improve efficiency or reduce costs. Return the results as a concise Markdown list. Data: ${JSON.stringify(state)}`,
    });
    // Fix: Use the .text property (not a method) to access the generated text.
    return response.text;
  } catch (error) {
    console.error("Error generating fleet insights:", error);
    return "Error: Unable to generate insights at this time.";
  }
};

// Fix: Refactor extractMiningDataFromImage to follow strict SDK guidelines for initialization and content extraction.
export const extractMiningDataFromImage = async (base64Image: string) => {
  try {
    // Fix: Initialize the client using the mandatory process.env.API_KEY environment variable.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const base64Data = base64Image.split(',')[1] || base64Image;

    const imagePart = {
      inlineData: {
        mimeType: 'image/jpeg',
        data: base64Data,
      },
    };

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          imagePart,
          { text: "Extract structured mining dispatch/purchase information from this image into JSON format." }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            date: { type: Type.STRING, description: "Date in YYYY-MM-DD format" },
            time: { type: Type.STRING, description: "Time in HH:mm format" },
            chalanNo: { type: Type.STRING },
            material: { type: Type.STRING },
            gross: { type: Type.NUMBER },
            tare: { type: Type.NUMBER },
            net: { type: Type.NUMBER },
            customerName: { type: Type.STRING },
            truckId: { type: Type.STRING, description: "Vehicle Plate Number" }
          },
          required: ["chalanNo", "truckId", "gross", "tare", "net"]
        },
      },
    });

    // Fix: Access text output from the response using the .text property and trim before parsing.
    return response.text ? JSON.parse(response.text.trim()) : null;
  } catch (error) {
    console.error("Error extracting data from image:", error);
    return null;
  }
};
