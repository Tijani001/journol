// pdf.js ships no type declarations for its worker module. Journol imports it
// only so the module is bundled with the server and preloaded for pdf.js.
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs";
