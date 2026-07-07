type WasmModule = {
  cwrap(name: string, returnType: string | null, argTypes: string[]): (...args: number[]) => number | void;
};

type WasmFactory = (options: { locateFile(path: string): string }) => Promise<WasmModule>;

declare const createRobolocksKernel: WasmFactory;
export default createRobolocksKernel;
