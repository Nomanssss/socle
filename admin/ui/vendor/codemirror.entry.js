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
export { EditorView, Decoration, WidgetType, ViewPlugin, keymap, drawSelection, placeholder } from '@codemirror/view';
export { history, historyKeymap, defaultKeymap, indentMore, indentLess } from '@codemirror/commands';
export { syntaxHighlighting, syntaxTree, ensureSyntaxTree, HighlightStyle } from '@codemirror/language';
export { markdown, markdownLanguage } from '@codemirror/lang-markdown';
// Les langages des blocs de code d'un cours : ceux du web.
export { javascript } from '@codemirror/lang-javascript';
export { html } from '@codemirror/lang-html';
export { css } from '@codemirror/lang-css';
export { yaml } from '@codemirror/lang-yaml';
export { tags } from '@lezer/highlight';
