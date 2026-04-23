# 模型下载可靠性修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 onboarding 阶段模型下载因网络不稳定导致 truncated bzip2 文件的问题，添加完整性校验和自动重试。

**Architecture:** 在 IPC handler 中添加下载完整性校验（`downloaded === contentLength`）和最多 3 次自动重试逻辑。前端 `startDownload` 在重试时重置进度条。保持现有架构不变，仅增强 `electron/main.ts` 中的下载逻辑和 `src/components/Onboarding.tsx` 的状态管理。

**Tech Stack:** Electron IPC, Node.js fetch/stream, fs, child_process.execSync

---

### Task 1: 后端 — 添加完整性校验 + 自动重试

**Files:**
- Modify: `electron/main.ts:350-402`

- [ ] **Step 1: 替换 IPC handler，添加校验和重试**

将 `electron/main.ts` 第 350-402 行整个 IPC handler 替换为：

```typescript
  ipcMain.handle('onboarding:download-model', async (event) => {
    const modelDir = path.join(userDataDir, 'models');
    if (!fs.existsSync(modelDir)) fs.mkdirSync(modelDir, { recursive: true });
    const modelPath = path.join(modelDir, 'sensevoice-small-int8.onnx');
    const tokensPath = path.join(modelDir, 'tokens.txt');

    if (fs.existsSync(modelPath) && fs.existsSync(tokensPath)) return;

    const archiveName = 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2';
    const extractedName = 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17';
    const url = `https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/${archiveName}`;

    const tmpDir = path.join(userDataDir, 'tmp-download');
    const archivePath = path.join(tmpDir, archiveName);
    const maxRetries = 3;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // 清理上次残留
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
        fs.mkdirSync(tmpDir, { recursive: true });

        const response = await fetch(url, { redirect: 'follow' });
        if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);

        const contentLength = Number(response.headers.get('content-length') || 0);
        const fileStream = fs.createWriteStream(archivePath);
        const reader = response.body!.getReader();
        let downloaded = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fileStream.write(value);
          downloaded += value.length;
          if (contentLength > 0) {
            event.sender.send('onboarding:download-progress', Math.round(downloaded / contentLength * 100));
          }
        }
        fileStream.end();

        // 校验下载完整性
        if (contentLength > 0 && downloaded !== contentLength) {
          throw new Error(`Download incomplete: received ${downloaded} bytes, expected ${contentLength} bytes`);
        }

        // 解压 tar.bz2
        const { execSync } = require('child_process');
        execSync(`tar xjf "${archiveName}"`, { cwd: tmpDir });

        // 移动文件到 models 目录
        const extractedDir = path.join(tmpDir, extractedName);
        fs.renameSync(path.join(extractedDir, 'model.int8.onnx'), modelPath);
        fs.renameSync(path.join(extractedDir, 'tokens.txt'), tokensPath);

        // 成功，清理并返回
        fs.rmSync(tmpDir, { recursive: true });
        return;
      } catch (err: any) {
        lastError = err;
        if (attempt < maxRetries) {
          event.sender.send('onboarding:download-progress', 0);
        }
      }
    }

    // 所有重试都失败
    try { fs.rmSync(tmpDir, { recursive: true }); } catch {}
    throw new Error(`${lastError?.message || 'Download failed'} (after ${maxRetries} attempts)`);
  });
```

相比原代码的变化：
- `for` 循环最多重试 3 次
- 每次尝试前清理残留临时目录
- `fileStream.end()` 后校验 `downloaded !== contentLength`，避免对不完整文件执行 tar
- 每次重试前发送 `progress=0` 让前端重置进度条
- 最终错误信息包含重试次数

- [ ] **Step 2: 验证逻辑正确性**

手动检查：
- 成功路径：`return` 在循环内，不会继续重试
- `contentLength === 0` 时跳过大小校验（某些 CDN 不返回此 header）
- `lastError` 保存最后一次错误，最终抛出包含 `(after 3 attempts)` 后缀
- 循环外清理临时目录并抛错

- [ ] **Step 3: Commit**

```bash
git add electron/main.ts
git commit -m "fix: add download size verification and auto-retry (max 3) for model download"
```

---

### Task 2: 前端 — 重置进度条

**Files:**
- Modify: `src/components/Onboarding.tsx:22-34`

- [ ] **Step 1: 在 startDownload 中重置进度条**

将 `src/components/Onboarding.tsx` 第 22-34 行的 `startDownload` 函数替换为：

```typescript
  const startDownload = async () => {
    setError('');
    setDownloadProgress(0);
    const progressHandler = (_: any, p: number) => setDownloadProgress(p);
    ipcRenderer?.on('onboarding:download-progress', progressHandler);
    try {
      await ipcRenderer?.invoke('onboarding:download-model');
      ipcRenderer?.removeListener('onboarding:download-progress', progressHandler);
      setStep('api-key');
    } catch (e: any) {
      ipcRenderer?.removeAllListeners('onboarding:download-progress');
      setError(e.message);
    }
  };
```

唯一变化：在 `setError('')` 后添加 `setDownloadProgress(0)`，确保手动重试时进度条从 0 开始。

- [ ] **Step 2: 验证 UI 行为**

确认：
- 手动点击"下载模型"按钮时，`setDownloadProgress(0)` 确保进度条归零
- 自动重试时后端发送 `progress=0`，前端也会更新为 0
- 成功进入 `api-key` 步骤后，进度条不再可见

- [ ] **Step 3: Commit**

```bash
git add src/components/Onboarding.tsx
git commit -m "fix: reset download progress bar to 0 on retry"
```

---

### Task 3: 构建验证

**Files:**
- None (验证步骤)

- [ ] **Step 1: 验证 Electron 主进程构建通过**

```bash
npm run build:electron
```

Expected: 构建成功

- [ ] **Step 2: 验证 Next.js 构建通过**

```bash
npm run build
```

Expected: 构建成功

- [ ] **Step 3: Commit build fixes if needed**

```bash
git add -A
git commit -m "fix: resolve build issues from model download reliability changes"
```

仅在构建失败时需要此步骤。
