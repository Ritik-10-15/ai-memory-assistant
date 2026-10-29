import { useEffect, useRef, useState, type RefObject } from "react";
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

export function grabJpeg(video: HTMLVideoElement, canvas: HTMLCanvasElement, quality = 0.8): Promise<Blob | null> {
  if (!video.videoWidth) return Promise.resolve(null);
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d")?.drawImage(video, 0, 0);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * Browser-camera mode: stream the webcam into `videoRef` and post frames to
 * /api/frame, which feeds the server's recognition worker. Stops the camera
 * and all uploads on unmount or when `active` becomes false (e.g. hidden tab).
 */
export function useBrowserCamera(videoRef: RefObject<HTMLVideoElement>, active: boolean) {
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [frame, setFrame] = useState<FrameResult | null>(null);
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
          setFrame(await api.sendFrame(blob, controller.signal));
        } catch {
          // Upload failures surface through the recognition poll's
          // service-unavailable state; keep trying.
          if (!stopped) setFrame(null);
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
      setFrame(null);
      setStatus("idle");
    };
  }, [active, videoRef]);

  return { status, frame };
}
