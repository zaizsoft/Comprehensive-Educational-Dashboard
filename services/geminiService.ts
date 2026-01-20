
import { GoogleGenAI } from "@google/genai";

export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    // Fixed initialization to use process.env.API_KEY directly as required
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async generateStudentObservation(level: string, performance: string): Promise<string> {
    try {
      // Correct usage of generateContent with model and prompt
      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `كأستاذ تربية بدنية، اكتب ملاحظة تربوية قصيرة جداً (أقل من 10 كلمات) لتلميذ في السنة ${level} ابتدائي، مستواه: ${performance}. الملاحظة يجب أن تكون باللغة العربية ومشجعة.`,
      });
      // Directly accessing the .text property as per guidelines
      return response.text || "أداء جيد يحتاج للاستمرار.";
    } catch (error) {
      console.error("AI Error:", error);
      return "أداء متميز وتطور ملحوظ.";
    }
  }
}

export const geminiService = new GeminiService();
