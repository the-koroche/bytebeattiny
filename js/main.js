import { CodeEditor } from "/js/editor/editor.js";
import { setupUI } from "/js/ui.js";
import { loadCode } from "/js/player-manager.js";
import "/js/visualizer-manager.js"

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