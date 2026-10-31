import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { HeartHandshake, LockKeyhole } from "lucide-react";
import { api, ApiError } from "@/api/client";
import { Alert, Button, Card, TextField } from "@/components/ui";

const QUERY_ERRORS: Record<string, string> = {
  invalid: "That wasn't right. Please try again.",
  locked: "Too many attempts. Please wait a few minutes and try again.",
};

export function Shell({
  title,
  description,
  children,
  companion = false,
}: {
  title: string;
  description: string;
  children: ReactNode;
  /** Patient pages use the companion (mint/plum) theme. */
  companion?: boolean;
}) {
  return (
    <main className={`flex min-h-screen items-center justify-center bg-paper px-4 py-10 font-sans text-ink ${companion ? "theme-companion" : ""}`}>
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-700 text-white">
            <HeartHandshake className="h-6 w-6" aria-hidden="true" />
          </span>
          <span className="text-xl font-semibold text-ink">Memory Assistant</span>
        </div>
        <Card className="p-7 sm:p-8">
          <h1 className="text-2xl font-semibold text-ink">{title}</h1>
          <p className="mt-1.5 text-[15px] text-ink-muted">{description}</p>
          <div className="mt-6">{children}</div>
        </Card>
      </div>
    </main>
  );
}

function useSecretForm(submit: (secret: string) => Promise<unknown>, onSuccess: () => void) {
  const [params] = useSearchParams();
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(QUERY_ERRORS[params.get("error") ?? ""] ?? null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await submit(secret);
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setSecret("");
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }
  return { secret, setSecret, error, busy, onSubmit, inputRef };
}

/**
 * Only allow same-site relative paths as a post-login destination: one
 * leading "/", never "//" or a backslash anywhere (browsers and React Router
 * read "/\evil.example" as another site), and no control characters.
 */
export function safeNext(next: string | null, fallback: string) {
  return next && /^\/(?!\/)[^\\\u0000-\u001f]*$/.test(next) ? next : fallback;
}

export function CaregiverSignIn() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"), "/caregiver");
  const form = useSecretForm(api.caregiverLogin, () => navigate(next, { replace: true }));

  useEffect(() => {
    api
      .session()
      .then((s) => {
        if (s.sandbox) navigate(`/signin?next=${encodeURIComponent(next)}`, { replace: true });
        else if (s.caregiver) navigate(next, { replace: true });
      })
      .catch(() => undefined);
  }, [navigate, next]);

  return (
    <Shell companion title="Caregiver sign-in" description="Manage people, face enrollment and memories.">
      <form onSubmit={form.onSubmit} className="space-y-4" noValidate>
        {form.error && <Alert tone="error">{form.error}</Alert>}
        <TextField
          ref={form.inputRef}
          label="Password"
          type="password"
          autoComplete="current-password"
          value={form.secret}
          onChange={(e) => form.setSecret(e.target.value)}
          required
          autoFocus
        />
        <Button type="submit" size="lg" className="w-full" loading={form.busy} disabled={!form.secret}
          icon={<LockKeyhole className="h-5 w-5" aria-hidden="true" />}>
          Sign in
        </Button>
      </form>
      <Link to="/" className="mt-6 inline-block text-sm font-medium text-primary-700 underline-offset-4 hover:underline">
        Back to the patient screen
      </Link>
    </Shell>
  );
}

export function PatientSignIn() {
  const navigate = useNavigate();
  const form = useSecretForm(api.patientLogin, () => navigate("/", { replace: true }));

  useEffect(() => {
    api.session().then((s) => s.sandbox && navigate("/signin?next=/", { replace: true })).catch(() => undefined);
  }, [navigate]);

  return (
    <Shell
      companion
      title="Set up this screen"
      description="Enter the patient PIN once. This device will stay signed in."
    >
      <form onSubmit={form.onSubmit} className="space-y-4" noValidate>
        {form.error && <Alert tone="error">{form.error}</Alert>}
        <TextField
          ref={form.inputRef}
          label="PIN"
          type="password"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={form.secret}
          onChange={(e) => form.setSecret(e.target.value.replace(/\D/g, ""))}
          className="text-center text-2xl tracking-[0.4em]"
          required
          autoFocus
        />
        <Button type="submit" size="lg" className="w-full" loading={form.busy} disabled={!form.secret}>
          Continue
        </Button>
      </form>
      <div className="mt-6 flex flex-wrap justify-between gap-3 text-sm font-medium">
        <Link to="/caregiver/login" className="text-primary-700 underline-offset-4 hover:underline">
          Caregiver sign-in
        </Link>
        <Link to="/welcome" className="text-primary-700 underline-offset-4 hover:underline">
          What is Memory Assistant?
        </Link>
      </div>
    </Shell>
  );
}
