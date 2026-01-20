
import { GoogleGenAI } from "@google/genai";

export class GeminiService {
  async generateStudentObservation(level: string, performance: string): Promise<string> {
    try {
      // Create instance right before making the call as per best practices
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `كأستاذ تربية بدنية، اكتب ملاحظة تربوية قصيرة جداً (أقل من 10 كلمات) لتلميذ في السنة ${level} ابتدائي، مستواه: ${performance}. الملاحظة يجب أن تكون باللغة العربية ومشجعة.`,
      });
      
      return response.text || "أداء جيد يحتاج للاستمرار.";
    } catch (error) {
      console.error("AI Error:", error);
      return "أداء متميز وتطور ملحوظ.";
    }
  }
}

export const geminiService = new GeminiService();
