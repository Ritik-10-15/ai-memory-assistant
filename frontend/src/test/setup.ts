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
