// electron/tts-sentence-parser.ts

export interface ParsedSentence {
  text: string;
  duration: number;
  words?: Array<{ word: string; startTime: number; endTime: number; [key: string]: any }>;
}

export function parseSentenceFromPayload(payload: any): ParsedSentence | null {
  const sentenceText =
    payload?.text
    ?? payload?.res_params?.text
    ?? payload?.payload?.text
    ?? payload?.sentence?.text
    ?? '';

  let duration =
    payload?.res_params?.duration
    ?? payload?.payload?.duration
    ?? 0;

  if (duration === 0 && Array.isArray(payload?.words) && payload.words.length > 0) {
    const first = payload.words[0];
    const last = payload.words[payload.words.length - 1];
    if (first?.startTime != null && last?.endTime != null) {
      duration = last.endTime - first.startTime;
    }
  }

  if (duration > 0 && sentenceText) {
    return { text: sentenceText, duration, words: Array.isArray(payload?.words) && payload.words.length > 0 ? payload.words : undefined };
  }

  return null;
}
