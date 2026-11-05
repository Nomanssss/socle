// =============================================================
// codemirror.entry.js - ce que l'admin prend de CodeMirror
//
// Ce fichier n'est pas servi tel quel : le serveur de l'admin
// l'empaquette avec esbuild (server/vendor.mjs) en un seul module,
// que le navigateur charge sous /admin/vendor/codemirror.js. Le
// navigateur ne sait pas résoudre « @codemirror/view » : il lui faut
// un fichier, pas un nom de paquet.
//
// Tout ce que l'interface importe de CodeMirror passe par ici - une
// seule copie de @codemirror/state, sans quoi CodeMirror refuse de
// fonctionner.
// =============================================================

export { EditorState, EditorSelection, StateField, StateEffect, RangeSetBuilder } from '@codemirror/state';
export { EditorView, Decoration, WidgetType, keymap, drawSelection, placeholder } from '@codemirror/view';
export { history, historyKeymap, defaultKeymap, indentWithTab } from '@codemirror/commands';
export { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
export { markdown, markdownLanguage } from '@codemirror/lang-markdown';
export { tags } from '@lezer/highlight';
