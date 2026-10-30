import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { api } from "@/api/client";
import type { FrameResult } from "@/api/types";
import type { CameraProblem } from "./recognitionView";

export type CameraStatus = "idle" | "starting" | "live" | CameraProblem;

/** Pause between frame uploads; a new frame is sent only after the last reply. */
export const FRAME_GAP_MS = 150;

export function cameraProblemFrom(err: unknown): CameraProblem {
  const name = (err as { name?: string } | null)?.name;
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  return "unavailable";
}

export async function openCamera(): Promise<MediaStream> {
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    throw Object.assign(new Error("insecure"), { name: "InsecureContext" });
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw Object.assign(new Error("unsupported"), { name: "NotSupportedError" });
  }
  return navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
}

export function grabJpeg(video: HTMLVideoElement, paper: HTMLCanvasElement, quality = 0.8): Promise<Blob | null> {
  if (!video.videoWidth) return Promise.resolve(null);
  paper.width = video.videoWidth;
  paper.height = video.videoHeight;
  paper.getContext("2d")?.drawImage(video, 0, 0);
  return new Promise((resolve) => paper.toBlob(resolve, "image/jpeg", quality));
}

/**
 * The latest face box from /api/frame. Only the camera overlay needs it, and
 * it changes several times a second, so it lives outside React state: the
 * overlay subscribes (useFrame) and the rest of the patient screen does not
 * re-render for every frame.
 */
export interface FrameStore {
  get: () => FrameResult | null;
  subscribe: (onChange: () => void) => () => void;
}

export function createFrameStore(): FrameStore & { set: (f: FrameResult | null) => void } {
  let current: FrameResult | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set: (f) => {
      current = f;
      listeners.forEach((l) => l());
    },
    subscribe: (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
  };
}

export function useFrame(frames: FrameStore): FrameResult | null {
  return useSyncExternalStore(frames.subscribe, frames.get);
}

/**
 * Browser-camera mode: stream the webcam into `videoRef` and post frames to
 * /api/frame, which feeds the server's recognition worker. Stops the camera
 * and all uploads on unmount or when `active` becomes false (e.g. hidden tab).
 */
export function useBrowserCamera(videoRef: RefObject<HTMLVideoElement>, active: boolean) {
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [frames] = useState(createFrameStore);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!active) return;
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let stopped = false;
    canvasRef.current ??= document.createElement("canvas");

    const loop = async () => {
      const video = videoRef.current;
      if (stopped || !video) return;
      const blob = await grabJpeg(video, canvasRef.current!);
      if (blob && !stopped) {
        controller = new AbortController();
        try {
          frames.set(await api.sendFrame(blob, controller.signal));
        } catch {
          // Upload failures surface through the recognition poll's
          // service-unavailable state; keep trying.
          if (!stopped) frames.set(null);
        }
      }
      if (!stopped) timer = setTimeout(loop, FRAME_GAP_MS);
    };

    setStatus("starting");
    openCamera()
      .then(async (s) => {
        stream = s;
        if (stopped) return;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = s;
        await video.play().catch(() => undefined);
        setStatus("live");
        loop();
      })
      .catch((err) => {
        if (stopped) return;
        const name = (err as { name?: string }).name;
        setStatus(name === "InsecureContext" ? "insecure" : name === "NotSupportedError" ? "unsupported" : cameraProblemFrom(err));
      });

    return () => {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
      stream?.getTracks().forEach((t) => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      frames.set(null);
      setStatus("idle");
    };
  }, [active, videoRef, frames]);

  return { status, frames };
}
