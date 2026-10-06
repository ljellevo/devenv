export interface MonacoEditor {
  getValue(): string; setValue(value: string): void; getModel(): unknown;
  onDidChangeModelContent(callback: () => void): { dispose(): void };
  addCommand(keybinding: number, callback: () => void): void;
  dispose(): void;
}
export interface MonacoApi {
  languages: {
    getLanguages(): Array<{ id: string }>;
    register(language: unknown): void;
    setLanguageConfiguration(id: string, config: unknown): void;
    setMonarchTokensProvider(id: string, config: unknown): void;
  };
  editor: {
    create(element: HTMLElement, options: unknown): MonacoEditor;
    defineTheme(name: string, data: unknown): void;
    setModelMarkers(model: unknown, owner: string, markers: unknown[]): void;
  };
  MarkerSeverity: { Error: number };
  KeyMod: { CtrlCmd: number };
  KeyCode: { KeyS: number };
}
interface AmdRequire {
  config(options: unknown): void;
  (ids: string[], loaded: () => void, failed: (error: unknown) => void): void;
}
declare global { interface Window { require?: AmdRequire; monaco?: MonacoApi } }

let loading: Promise<MonacoApi> | undefined;
export function loadMonaco(): Promise<MonacoApi> {
  if (loading) return loading;
  loading = new Promise<MonacoApi>((resolve, reject) => {
    const amd = window.require;
    if (!amd) { reject(new Error('Monaco loader is unavailable.')); return; }
    amd.config({ paths: { vs: new URL('./monaco-editor/vs', document.baseURI).href }, preferScriptTags: true });
    amd(['vs/editor/editor.main'], () => {
      const monaco = window.monaco;
      if (!monaco) { reject(new Error('Monaco did not initialize.')); return; }
      if (!monaco.languages.getLanguages().some(language => language.id === 'toml')) {
        monaco.languages.register({ id: 'toml', extensions: ['.toml'], aliases: ['TOML'] });
        monaco.languages.setLanguageConfiguration('toml', {
          comments: { lineComment: '#' }, brackets: [['[', ']'], ['{', '}']],
          autoClosingPairs: [{ open: '"', close: '"' }, { open: "'", close: "'" }, { open: '[', close: ']' }, { open: '{', close: '}' }],
        });
        monaco.languages.setMonarchTokensProvider('toml', {
          tokenizer: { root: [
            [/\s+/, 'white'], [/#.*$/, 'comment'], [/\[\[?[^\]]+\]\]?/, 'type'],
            [/\b[A-Za-z_][\w.-]*(?=\s*=)/, 'key'], [/"""/, { token: 'string', next: '@tripleDouble' }],
            [/"(?:\\.|[^"\\])*"/, 'string'], [/'(?:[^']|'')*'/, 'string'],
            [/\b(?:true|false)\b/, 'keyword'], [/\b\d[\d._-]*(?:[Tt ][\d:.+-]+)?\b/, 'number'],
            [/=/, 'operator'], [/[{},]/, 'delimiter'],
          ], tripleDouble: [[/"""/, { token: 'string', next: '@pop' }], [/./, 'string']] },
        });
      }
      resolve(monaco);
    }, reject);
  }).catch(error => { loading = undefined; throw error; });
  return loading;
}

export function configureMonacoTheme(monaco: MonacoApi, appearance: 'light' | 'dark'): string {
  const light = appearance === 'light';
  const name = light ? 'devenv-nord-light' : 'devenv-nord-dark';
  monaco.editor.defineTheme(name, {
    base: light ? 'vs' : 'vs-dark', inherit: true,
    rules: [
      { token: 'comment', foreground: light ? '7B879A' : '616E88' },
      { token: 'type', foreground: light ? '5E81AC' : '88C0D0', fontStyle: 'bold' },
      { token: 'key', foreground: light ? '4C566A' : '81A1C1' },
      { token: 'string', foreground: light ? '5E7B50' : 'A3BE8C' },
      { token: 'keyword', foreground: light ? '8A5A83' : 'B48EAD' },
      { token: 'number', foreground: light ? 'A35A46' : 'D08770' },
      { token: 'operator', foreground: light ? '434C5E' : 'D8DEE9' },
    ],
    colors: {
      'editor.background': light ? '#ECEFF4' : '#2E3440',
      'editor.foreground': light ? '#2E3440' : '#D8DEE9',
      'editorLineNumber.foreground': light ? '#8995A9' : '#616E88',
      'editor.lineHighlightBackground': light ? '#E5E9F0' : '#3B4252',
      'editor.selectionBackground': light ? '#C9D7E6' : '#434C5E',
    },
  });
  return name;
}
