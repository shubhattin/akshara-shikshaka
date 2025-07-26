import * as hbjs_mod from './hbjs_core';

let hbjs: ReturnType<typeof hbjs_mod.hbjs> = null!;

const isNodeEnv = () => {
  return typeof window === 'undefined' && typeof global !== 'undefined';
};

const loadWasmInNode = async (): Promise<ArrayBuffer> => {
  // In Node.js environment
  const path = await import('path');
  const fs = await import('fs/promises');

  // Get the current file's directory and construct path to WASM file
  const currentDir = path.dirname(new URL(import.meta.url).pathname);
  const wasmPath = path.join(currentDir, 'hb.wasm');

  const wasmBuffer = await fs.readFile(wasmPath);
  // Convert Node.js Buffer to ArrayBuffer
  return wasmBuffer.buffer.slice(
    wasmBuffer.byteOffset,
    wasmBuffer.byteOffset + wasmBuffer.byteLength
  ) as ArrayBuffer;
};

const loadWasmInBrowser = async (): Promise<ArrayBuffer> => {
  // In browser environment - use public URL
  const wasmUrl = '/src/tools/harfbuzz/core/hb.wasm';
  const response = await fetch(wasmUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch WASM file: ${response.statusText}`);
  }
  return await response.arrayBuffer();
};

export const load_hbjs = async () => {
  if (!hbjs) {
    let wasmArrayBuffer: ArrayBuffer;

    if (isNodeEnv()) {
      wasmArrayBuffer = await loadWasmInNode();
    } else {
      wasmArrayBuffer = await loadWasmInBrowser();
    }

    const result = await WebAssembly.instantiate(wasmArrayBuffer);
    hbjs = hbjs_mod.hbjs(result.instance);
  }
  return hbjs;
};
