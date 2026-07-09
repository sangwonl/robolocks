import { useEffect, useRef, useState } from "react";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";
import "monaco-editor/esm/vs/basic-languages/python/python.contribution";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { initVimMode, type VimAdapterInstance } from "monaco-vim";
import { cn } from "../lib/utils.ts";

type MonacoEnvironment = {
  getWorker: () => Worker;
};

(globalThis as typeof globalThis & { MonacoEnvironment?: MonacoEnvironment }).MonacoEnvironment = {
  getWorker() {
    return new EditorWorker();
  },
};

export type CodeEditorProps = {
  disabled: boolean;
  onApply: () => void;
  onValueChange: (value: string) => void;
  value: string;
};

export function CodeEditor({ disabled, onApply, onValueChange, value }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const statusRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const vimRef = useRef<VimAdapterInstance | null>(null);
  const onApplyRef = useRef(onApply);
  const onValueChangeRef = useRef(onValueChange);
  const [lineCount, setLineCount] = useState(Math.max(1, value.split("\n").length));
  const [vimEnabled, setVimEnabled] = useState(true);

  useEffect(() => {
    onApplyRef.current = onApply;
    onValueChangeRef.current = onValueChange;
  }, [onApply, onValueChange]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const editor = monaco.editor.create(container, {
      value,
      language: "python",
      theme: "vs-dark",
      readOnly: disabled,
      automaticLayout: true,
      fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
      fontSize: 12,
      lineHeight: 18,
      minimap: { enabled: false },
      padding: { top: 10, bottom: 10 },
      renderLineHighlight: "line",
      rulers: [88],
      scrollbar: {
        verticalScrollbarSize: 9,
        horizontalScrollbarSize: 9,
        useShadows: false,
      },
      scrollBeyondLastLine: false,
      tabSize: 4,
      insertSpaces: true,
      wordWrap: "off",
    });
    editorRef.current = editor;

    const changeDisposable = editor.onDidChangeModelContent(() => {
      const nextValue = editor.getValue();
      setLineCount(editor.getModel()?.getLineCount() ?? Math.max(1, nextValue.split("\n").length));
      onValueChangeRef.current(nextValue);
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      onApplyRef.current();
    });

    if (statusRef.current) {
      vimRef.current = initVimMode(editor, statusRef.current);
    }

    setLineCount(editor.getModel()?.getLineCount() ?? lineCount);
    editor.focus();

    return () => {
      vimRef.current?.dispose();
      vimRef.current = null;
      changeDisposable.dispose();
      editor.dispose();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    editor.updateOptions({ readOnly: disabled });
  }, [disabled]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || editor.getValue() === value) {
      return;
    }
    editor.setValue(value);
    setLineCount(editor.getModel()?.getLineCount() ?? Math.max(1, value.split("\n").length));
  }, [value]);

  useEffect(() => {
    const editor = editorRef.current;
    const status = statusRef.current;
    if (!editor || !status) {
      return;
    }

    if (vimEnabled && !vimRef.current) {
      vimRef.current = initVimMode(editor, status);
      return;
    }
    if (!vimEnabled && vimRef.current) {
      vimRef.current.dispose();
      vimRef.current = null;
      status.textContent = "";
    }
  }, [vimEnabled]);

  return (
    <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface-inset)]">
      <div className="u-label flex min-w-0 items-center justify-between gap-2 border-b border-[var(--line)] px-2 py-1 text-[10px]">
        <span>Bot code</span>
        <div className="flex items-center gap-1.5">
          <span>Python</span>
          <button
            type="button"
            className={cn(
              "w-auto rounded-[5px] border border-[var(--line-control)] bg-transparent px-1.5 py-0.5 text-[10px] font-semibold leading-none text-[var(--text-dim)]",
              vimEnabled && "bg-[var(--brand)] text-[var(--ink)]",
            )}
            disabled={disabled}
            onClick={() => setVimEnabled((enabled) => !enabled)}
          >
            Vim
          </button>
        </div>
      </div>
      <div ref={containerRef} className="h-full min-h-[260px] overflow-hidden" aria-label="Bot Python code" />
      <div className="u-label grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 border-t border-[var(--line)] px-2 py-1 text-[10px] normal-case">
        <span>{lineCount} lines</span>
        <div ref={statusRef} className="min-w-0 truncate font-mono text-[var(--text-soft)]" />
        <span>Cmd/Ctrl+Enter apply</span>
        <button
          type="button"
          className="w-auto rounded-[5px] border border-[var(--line-control)] bg-[var(--brand)] px-2 py-0.5 text-[10px] font-bold leading-none text-[var(--ink)] disabled:opacity-50"
          disabled={disabled}
          onClick={onApply}
        >
          Apply
        </button>
      </div>
    </div>
  );
}
