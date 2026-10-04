import { spawn } from 'node:child_process';
import { readdir, mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

export interface CardImageGenerator {
  available(): Promise<boolean>;
  generate(prompt: string, signal?: AbortSignal): Promise<string>;
}

const THREAD_ID = /^[0-9a-f-]{36}$/u;
const DEFAULT_TIMEOUT_MS = 10 * 60_000;

/** Run Codex's included image tool in a disposable directory; return its own output path. */
export function createCodexImageGenerator(options: {
  binary?: string;
  generatedImagesRoot?: string;
  timeoutMs?: number;
} = {}): CardImageGenerator {
  const binary = options.binary ?? process.env.CODEX_EXECUTABLE ?? 'codex';
  const generatedImagesRoot = options.generatedImagesRoot ?? join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'generated_images');
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let availability: Promise<boolean> | undefined;

  const available = () => availability ??= new Promise<boolean>(resolve => {
    const child = spawn(binary, ['--version'], { stdio: 'ignore' });
    const timer = setTimeout(() => { child.kill(); resolve(false); }, 5_000);
    child.once('error', () => { clearTimeout(timer); resolve(false); });
    child.once('close', code => { clearTimeout(timer); resolve(code === 0); });
  });

  async function generate(prompt: string, signal?: AbortSignal): Promise<string> {
    if (!await available()) throw Error('Codex CLI 不可用，插画仍待生成');
    const directory = await mkdtemp(join(tmpdir(), 'worka-codex-art-'));
    try {
      const instruction = `$imagegen\n${prompt}\n\nGenerate exactly one original image with a transparent background. Use the built-in image generation tool. Do not run shell commands, edit project files, call a separate API, or copy the image. Reply with the generated image path only.`;
      const args = ['exec', '--json', '--skip-git-repo-check', '--ephemeral', '-C', directory, '-s', 'workspace-write', '-'];
      const child = spawn(binary, args, { cwd: directory, stdio: ['pipe', 'pipe', 'pipe'] });
      let output = '';
      let stderr = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', chunk => { if (output.length < 256_000) output += String(chunk).slice(0, 256_000 - output.length); });
      child.stderr.on('data', chunk => { stderr = (stderr + String(chunk)).slice(-8_000); });
      child.stdin.end(instruction);
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = (error?: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal?.removeEventListener('abort', abort);
          if (error) reject(error); else resolve();
        };
        const abort = () => { child.kill(); finish(Error('Codex 生图已中断，可重新发起当前请求')); };
        const timer = setTimeout(() => { child.kill(); finish(Error('Codex 生图超时，可重新发起当前请求')); }, timeoutMs);
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) { abort(); return; }
        child.once('error', error => finish(Error(`无法启动 Codex 生图：${error.message}`)));
        child.once('close', code => finish(code === 0 ? undefined : Error(`Codex 生图失败（退出码 ${code ?? '未知'}）${stderr.includes('rate limit') ? '：使用额度暂不可用' : ''}`)));
      });
      const threadId = output.match(/"type":"thread\.started","thread_id":"([0-9a-f-]{36})"/u)?.[1];
      if (!threadId || !THREAD_ID.test(threadId)) throw Error('Codex 生图没有返回可核验的会话 ID');
      const outputDirectory = join(generatedImagesRoot, threadId);
      const files = (await readdir(outputDirectory, { withFileTypes: true })).filter(entry => entry.isFile() && /^exec-[0-9a-f-]+\.png$/u.test(entry.name));
      if (files.length !== 1) throw Error(`Codex 生图需要恰好一张 PNG，实际找到 ${files.length} 张`);
      return join(outputDirectory, files[0]!.name);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  return { available, generate };
}
