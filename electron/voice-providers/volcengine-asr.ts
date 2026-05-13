import { AsrProvider, AsrResult } from './types'
import { DoubaoASR } from '../../src/lib/doubao-asr'
import { log } from '../../src/lib/logger'
import fs from 'fs'

export class VolcengineAsr implements AsrProvider {
  private asr: DoubaoASR

  constructor(appId: string, accessToken: string) {
    this.asr = new DoubaoASR(appId, accessToken)
  }

  async transcribe(filePath: string): Promise<AsrResult> {
    const stat = fs.statSync(filePath)
    log.info('VolcengineASR: 开始转写, 文件:', filePath, '大小:', stat.size, 'bytes')
    if (stat.size < 44) {
      throw new Error('音频文件过小，可能录制失败')
    }
    const text = await this.asr.transcribe(filePath)
    log.info('VolcengineASR: 转写完成, 结果长度:', text.length)
    return { text }
  }

  async validateCredentials(): Promise<void> {
    await this.asr.validateCredentials()
  }
}
