import { CodeEditor } from "./editor/editor.js";
import { setupUI } from "./ui.js";
import { loadCode } from "./player-manager.js";
import "./visualizer-manager.js"

const codeEditorContainer = document.querySelector('#code-editor');
const errorText = document.querySelector("#error-text");
const codeEditor = new CodeEditor(codeEditorContainer);

setupUI(codeEditor);

codeEditor.textarea.addEventListener('input', () => {
    const source = codeEditor.textarea.value;
    loadCode(source, errorText);
    const encoded = btoa(encodeURIComponent(source));
    location.hash = "code=" + encoded;
});

const hash = location.hash;
if (hash.startsWith("#code=")) {
    const encoded = hash.slice(6);
    const source = decodeURIComponent(atob(encoded));
    codeEditor.value = source;
}