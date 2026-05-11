export interface AsrResult {
  text: string
}

export interface AsrProvider {
  transcribe(filePath: string): Promise<AsrResult>
  validateCredentials(): Promise<void>
}

export interface TtsSentence {
  text: string
  startTime: number
  endTime: number
}

export interface TtsWord {
  word: string
  startTime: number
  endTime: number
}

export interface TtsResult {
  audioPath: string
  sentences: TtsSentence[]
  words: TtsWord[]
}

export interface TtsProvider {
  synthesize(text: string, signal?: AbortSignal): Promise<TtsResult | null>
  stop(): void
  validateCredentials(): Promise<void>
}
