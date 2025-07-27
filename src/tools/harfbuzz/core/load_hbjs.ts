import * as hbjs_mod from './hbjs_core';

let hbjs: ReturnType<typeof hbjs_mod.hbjs> = null!;

const isNodeEnv = () => {
  return typeof window === 'undefined' && typeof global !== 'undefined';
};

const loadWasmInBrowser = async (): Promise<ArrayBuffer> => {
  // In browser environment - use public URL (files in public/ are served from root)
  const wasmUrl = '/harfbuzz/core/hb.wasm';
  const response = await fetch(wasmUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch WASM file: ${response.statusText}`);
  }
  return await response.arrayBuffer();
};

export const load_hbjs = async () => {
  if (!hbjs) {
    let wasmArrayBuffer: ArrayBuffer;

    wasmArrayBuffer = await loadWasmInBrowser();

    const result = await WebAssembly.instantiate(wasmArrayBuffer);
    hbjs = hbjs_mod.hbjs(result.instance);
  }
  return hbjs;
};
