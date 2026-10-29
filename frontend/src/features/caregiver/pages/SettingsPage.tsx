import { useNavigate } from "react-router-dom";
import { Download, LogOut, MonitorSmartphone, ShieldCheck } from "lucide-react";
import { api } from "@/api/client";
import { Button, ButtonLink, Card, CardBody, CardHeader, ErrorState, Skeleton } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { PageHeader } from "../components";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 py-3">
      <dt className="text-[15px] text-ink-muted">{label}</dt>
      <dd className="text-[15px] font-medium text-ink">{value}</dd>
    </div>
  );
}

/**
 * Settings that the app actually has. Passwords, the patient PIN and
 * feature switches come from server environment variables, so they are
 * shown here as read-only status rather than as editable controls.
 */
export function SettingsPage() {
  const navigate = useNavigate();
  const status = useAsync(() => api.status(), []);
  const session = useAsync(() => api.session(), []);

  async function signOut() {
    await api.caregiverLogout().catch(() => undefined);
    navigate("/caregiver/login", { replace: true });
  }

  return (
    <>
      <PageHeader title="Settings" description="Configuration, data export and account." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="This installation" description="Set by the server administrator through environment variables." />
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
                <Row label="Patient screen PIN" value={session.data.patient_pin_required ? "Required" : "Not required"} />
                <Row label="Voice memos" value={status.data.voice_memos ? "On" : "Off (Whisper not installed)"} />
                <Row label="AI summaries of voice memos" value={status.data.llm_summaries ? "On" : "Off"} />
                <Row label="Recognition models" value={status.data.models_loaded ? "Loaded" : "Not loaded"} />
              </dl>
            )}
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Patient screen" />
            <CardBody className="space-y-3">
              <p className="text-[15px] text-ink">
                Open it on the patient's tablet or laptop. If a PIN is required, enter it once on that device.
              </p>
              <ButtonLink to="/" variant="secondary" icon={<MonitorSmartphone className="h-4 w-4" aria-hidden="true" />}>
                Open patient screen
              </ButtonLink>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Your data" />
            <CardBody className="space-y-3">
              <p className="text-[15px] text-ink">Download every recorded visit as a spreadsheet (CSV).</p>
              <a
                href="/caregiver/export/csv"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-white px-4 text-[15px] font-semibold text-navy hover:bg-brand-50"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Export visits
              </a>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Privacy" />
            <CardBody>
              <ul className="space-y-2 text-[15px] text-ink">
                <li className="flex gap-2.5">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-care-500" aria-hidden="true" />
                  Face photos, memories and visit records are stored only on this server.
                </li>
                <li className="flex gap-2.5">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-care-500" aria-hidden="true" />
                  Camera video is analysed live and not recorded.
                </li>
                <li className="flex gap-2.5">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-care-500" aria-hidden="true" />
                  Location data is removed from uploaded photos.
                </li>
              </ul>
              <p className="mt-4 text-sm text-ink-muted">
                This is an assistive prototype, not a medical device, and has not been clinically validated.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Account" />
            <CardBody>
              <Button variant="secondary" icon={<LogOut className="h-4 w-4" aria-hidden="true" />} onClick={signOut}>
                Sign out
              </Button>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
