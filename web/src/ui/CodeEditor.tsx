import { useEffect, useRef, useState } from "react";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";
import "monaco-editor/esm/vs/basic-languages/python/python.contribution";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { initVimMode, type VimAdapterInstance } from "monaco-vim";

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
  onRun: () => void;
  onValueChange: (value: string) => void;
  value: string;
};

export function CodeEditor({ disabled, onRun, onValueChange, value }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const statusRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const vimRef = useRef<VimAdapterInstance | null>(null);
  const onRunRef = useRef(onRun);
  const onValueChangeRef = useRef(onValueChange);
  const [lineCount, setLineCount] = useState(Math.max(1, value.split("\n").length));
  const [vimEnabled, setVimEnabled] = useState(true);

  useEffect(() => {
    onRunRef.current = onRun;
    onValueChangeRef.current = onValueChange;
  }, [onRun, onValueChange]);

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
      onRunRef.current();
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
    <div className="code-editor">
      <div className="code-editor-head u-label">
        <span>Bot code</span>
        <div className="code-editor-tools">
          <span>Python</span>
          <button
            type="button"
            className={vimEnabled ? "active" : ""}
            disabled={disabled}
            onClick={() => setVimEnabled((enabled) => !enabled)}
          >
            Vim
          </button>
        </div>
      </div>
      <div ref={containerRef} className="code-editor-monaco" aria-label="Bot Python code" />
      <div className="code-editor-status u-label">
        <span>{lineCount} lines</span>
        <div ref={statusRef} className="code-editor-vim-status" />
        <span>Cmd/Ctrl+Enter run</span>
      </div>
    </div>
  );
}
