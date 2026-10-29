import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// jsdom lacks these browser APIs; minimal stand-ins keep components rendering.
(HTMLCanvasElement.prototype as unknown as { getContext: () => null }).getContext = () => null;
HTMLCanvasElement.prototype.toBlob = function toBlob(cb: BlobCallback) {
  cb(new Blob(["frame"], { type: "image/jpeg" }));
};
if (!URL.createObjectURL) {
  URL.createObjectURL = () => "blob:preview";
  URL.revokeObjectURL = () => undefined;
}
if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
HTMLMediaElement.prototype.play = function play() {
  return Promise.resolve();
};
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
}
