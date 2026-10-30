import { useId } from "react";
import { useNavigate } from "react-router-dom";
import { Download, KeyRound, LogOut, MonitorSmartphone, ShieldCheck } from "lucide-react";
import { api } from "@/api/client";
import { Button, ButtonLink, Card, CardBody, CardHeader, ErrorState, Skeleton } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { cn } from "@/lib/cn";
import { PageHeader } from "../components";
import { usePreferences } from "../preferences";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 py-3">
      <dt className="text-[15px] text-ink-muted">{label}</dt>
      <dd className="text-[15px] font-medium text-ink">{value}</dd>
    </div>
  );
}

/** An accessible on/off switch (role="switch", Space/Enter toggles). */
function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div>
        <p id={`${id}-label`} className="text-[15px] font-semibold text-ink">
          {label}
        </p>
        <p id={`${id}-hint`} className="mt-0.5 text-sm text-ink-muted">
          {hint}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-hint`}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border-2 transition-colors",
          checked ? "border-sage-700 bg-sage-700" : "border-line-strong bg-paper",
        )}
      >
        <span
          aria-hidden="true"
          className={cn("inline-block h-6 w-6 rounded-full bg-white shadow-card transition-transform", checked ? "translate-x-6" : "translate-x-0.5")}
        />
      </button>
    </div>
  );
}

/**
 * Settings that the app actually has. Passwords, the patient PIN and
 * feature switches come from server environment variables, so they are
 * shown as read-only status; display preferences apply to this device only.
 */
export function SettingsPage() {
  const navigate = useNavigate();
  const status = useAsync(() => api.status(), []);
  const session = useAsync(() => api.session(), []);
  const [prefs, setPrefs] = usePreferences();

  async function signOut() {
    await api.caregiverLogout().catch(() => undefined);
    navigate("/caregiver/login", { replace: true });
  }

  return (
    <>
      <PageHeader title="Settings" description="Display preferences, security, this installation, and your data." />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card className="rounded-3xl">
            <CardHeader title="Display on this device" description="Saved in this browser only." />
            <CardBody className="divide-y divide-line py-1">
              <Toggle
                label="Larger text"
                hint="Makes everything in the caregiver workspace about 12% larger."
                checked={prefs.largerText}
                onChange={(v) => setPrefs({ largerText: v })}
              />
              <Toggle
                label="Reduce motion"
                hint="Turns off animations and smooth transitions, even if your device allows them."
                checked={prefs.reduceMotion}
                onChange={(v) => setPrefs({ reduceMotion: v })}
              />
            </CardBody>
          </Card>

          <Card className="rounded-3xl">
            <CardHeader title="Account and security" />
            <CardBody className="space-y-4">
              <ul className="space-y-3 text-[15px] text-ink">
                <li className="flex gap-3">
                  <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-sage-700" aria-hidden="true" />
                  The caregiver password is set by whoever runs the server (the CAREGIVER_PASSWORD setting). To change it, update
                  that setting and restart the app.
                </li>
                <li className="flex gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sage-700" aria-hidden="true" />
                  Your sign-in ends when you sign out or close the browser. After five wrong passwords, sign-in pauses for five minutes.
                </li>
              </ul>
              <Button variant="secondary" icon={<LogOut className="h-4 w-4" aria-hidden="true" />} onClick={signOut}>
                Sign out
              </Button>
            </CardBody>
          </Card>

          <Card className="rounded-3xl">
            <CardHeader title="Patient screen" />
            <CardBody className="space-y-3">
              <p className="text-[15px] text-ink">Open it on the patient's tablet or laptop. If a PIN is required, enter it once on that device.</p>
              <ButtonLink to="/" variant="secondary" icon={<MonitorSmartphone className="h-4 w-4" aria-hidden="true" />}>
                Open patient screen
              </ButtonLink>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="rounded-3xl">
            <CardHeader title="Camera and recognition" description="Set by the server administrator." />
            <CardBody className="py-1">
              {status.error ? (
                <div className="py-4">
                  <ErrorState message={status.error.message} onRetry={status.reload} />
                </div>
              ) : !status.data || !session.data ? (
                <Skeleton className="my-4 h-40" />
              ) : (
                <dl className="divide-y divide-line">
                  <Row label="Camera" value={status.data.camera_mode === "browser" ? "Patient device (browser)" : "Server webcam"} />
                  <Row label="Recognition models" value={status.data.models_loaded ? "Loaded" : "Not loaded"} />
                  <Row label="Recognisable people" value={`${status.data.enrolled_people} (${status.data.gallery_embeddings} face samples)`} />
                  <Row label="Patient screen PIN" value={session.data.patient_pin_required ? "Required" : "Not required"} />
                  <Row label="Voice memos" value={status.data.voice_memos ? "On" : "Off (Whisper not installed)"} />
                  <Row label="AI summaries of voice memos" value={status.data.llm_summaries ? "On" : "Off"} />
                </dl>
              )}
            </CardBody>
          </Card>

          <Card className="rounded-3xl">
            <CardHeader title="Your data" />
            <CardBody className="space-y-4">
              <p className="text-[15px] text-ink">Download every recorded visit as a spreadsheet (CSV).</p>
              <a
                href="/caregiver/export/csv"
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong bg-card px-4 text-[15px] font-semibold text-ink hover:bg-primary-50"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Export visits
              </a>
              <ul className="space-y-2 border-t border-line pt-4 text-[15px] text-ink">
                <li className="flex gap-2.5">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sage-700" aria-hidden="true" />
                  Face photos, memories and visit records are stored only on this server.
                </li>
                <li className="flex gap-2.5">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sage-700" aria-hidden="true" />
                  Camera video is analysed live and not recorded; location data is removed from uploaded photos.
                </li>
              </ul>
              <p className="text-sm text-ink-muted">
                This is an assistive prototype, not a medical device, and has not been clinically validated.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
