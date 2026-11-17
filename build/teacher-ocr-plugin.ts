import type { Plugin } from 'vite';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_IMAGE = 10 * 1024 * 1024;
const MAX_BODY = Math.ceil(MAX_IMAGE * 4 / 3) + 1024;
const script = fileURLToPath(new URL('../scripts/teacher-ocr.swift', import.meta.url));
const localAvailable = process.platform === 'darwin' && existsSync('/usr/bin/xcrun') && existsSync(script);

export function teacherOCR(): Plugin {
  return { name: 'teacher-local-ocr', apply: 'serve', configureServer(server) {
    // Compile once while the dev server starts; launching a native tool avoids
    // interpreting Swift and loading the compiler on every image upload.
    let toolDirectory: string | undefined;
    const toolReady = localAvailable ? (async () => {
      toolDirectory = await mkdtemp(join(tmpdir(), 'teacher-ocr-tool-'));
      const executable = join(toolDirectory, 'recognize');
      await new Promise<void>((resolveTool, reject) => {
        execFile('/usr/bin/xcrun', ['swiftc', '-module-cache-path', resolve(tmpdir(), 'teacher-swift-module-cache'), '-O', script, '-o', executable], { timeout: 60_000, maxBuffer: 512 * 1024 }, error => { if (error) reject(error); else resolveTool(); });
      });
      return executable;
    })() : Promise.reject(new Error('Unavailable'));
    void toolReady.catch(() => {});
    server.httpServer?.once('close', () => { if (toolDirectory) void rm(toolDirectory, { recursive: true, force: true }).catch(() => {}); });
    server.middlewares.use(async (req, res, next) => {
      if (req.url?.split('?')[0] !== '/api/teacher/ocr') return next();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      const reply = (status: number, data: object) => { res.statusCode = status; res.end(JSON.stringify(data)); };
      if (req.method === 'GET') return reply(200, { available: localAvailable, engine: localAvailable ? 'Apple Vision（本机识别）' : '未配置' });
      if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return reply(405, { error: '不支持的请求方法。' }); }
      // Keep this local image-processing endpoint same-origin, including on localhost.
      const origin = req.headers.origin;
      if (origin) {
        try { if (new URL(origin).host !== req.headers.host) return reply(403, { error: '请从本机工作台上传图片。' }); }
        catch { return reply(403, { error: '请求来源无效。' }); }
      }
      if (!localAvailable) return reply(503, { error: '当前环境未配置图片识别，请先粘贴周程文字。' });
      let directory: string | undefined;
      try {
        const chunks: Buffer[] = []; let length = 0;
        for await (const raw of req) {
          const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
          length += chunk.length;
          if (length > MAX_BODY) return reply(413, { error: '图片不能超过 10 MB，请压缩后重试。' });
          chunks.push(chunk);
        }
        let body: unknown;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch { return reply(400, { error: '图片请求格式不正确。' }); }
        const value = body && typeof body === 'object' && 'image' in body ? body.image : null;
        if (typeof value !== 'string') return reply(400, { error: '请选择需要识别的图片。' });
        const match = /^data:image\/(png|jpe?g|webp|gif|heic|heif|bmp|tiff);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(value);
        if (!match) return reply(400, { error: '图片格式不受支持，请上传 PNG、JPEG 或其他常见图片。' });
        const bytes = Buffer.from(match[2], 'base64');
        if (!bytes.length || bytes.length > MAX_IMAGE) return reply(413, { error: '图片为空或超过 10 MB。' });
        directory = await mkdtemp(join(tmpdir(), 'teacher-ocr-'));
        const file = join(directory, `image.${match[1].toLowerCase()}`);
        await writeFile(file, bytes, { mode: 0o600 });
        const executable = await toolReady;
        const output = await new Promise<string>((resolveOutput, reject) => {
          execFile(executable, [file], { timeout: 45_000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout) => {
            if (error) reject(error); else resolveOutput(stdout);
          });
        });
        const payload = JSON.parse(output) as { text?: string };
        if (!payload.text?.trim()) return reply(422, { error: '没有识别到清晰文字，请上传更清晰的图片。' });
        reply(200, { text: payload.text.trim(), engine: 'Apple Vision（本机识别）' });
      } catch (error) {
        const timeout = error && typeof error === 'object' && 'killed' in error && error.killed;
        reply(timeout ? 504 : 500, { error: timeout ? '本机识别超时，请缩小图片后重试。' : '本机图片识别暂不可用，请先粘贴周程文字。' });
      } finally { if (directory) await rm(directory, { recursive: true, force: true }).catch(() => {}); }
    });
  } };
}
