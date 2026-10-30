import { Camera, CameraOff, WifiOff } from "lucide-react";
import { cn } from "@/lib/cn";
import type { PatientView } from "./recognitionView";

/**
 * A small, calm indicator of whether the camera and the memory assistant
 * are working. No technical detail — the visitor panel explains problems.
 */
export function CameraStatus({ view, className }: { view: PatientView; className?: string }) {
  const state =
    view.kind === "camera-unavailable"
      ? { text: "Camera off", Icon: CameraOff, cls: "bg-danger-50 text-danger-700" }
      : view.kind === "service-unavailable"
        ? { text: "Reconnecting", Icon: WifiOff, cls: "bg-caution-50 text-caution-700" }
        : { text: "Camera on", Icon: Camera, cls: "bg-sage-50 text-sage-700" };
  return (
    <span className={cn("items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold", state.cls, className)}>
      <state.Icon className="h-4 w-4" aria-hidden="true" />
      {state.text}
    </span>
  );
}
