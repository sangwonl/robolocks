type WasmModule = {
  UTF8ToString(pointer: number): string;
  lengthBytesUTF8(value: string): number;
  stringToUTF8(value: string, pointer: number, maxBytesToWrite: number): void;
  _malloc(byteLength: number): number;
  _free(pointer: number): void;
  addFunction(fn: (...args: number[]) => number | void, signature: string): number;
  removeFunction(pointer: number): void;
  cwrap(name: string, returnType: string | null, argTypes: string[]): (...args: number[]) => number | void;
};

type WasmFactory = (options: { locateFile(path: string): string }) => Promise<WasmModule>;

declare const createRobolocksKernel: WasmFactory;
export default createRobolocksKernel;
