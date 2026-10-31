import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { LogIn, Sparkles } from "lucide-react";
import { api, ApiError } from "@/api/client";
import { Alert, Button, TextField } from "@/components/ui";
import { safeNext, Shell } from "./SignInPage";

/**
 * Sandbox accounts (public "try it yourself" deployments): every visitor
 * signs up for a private, temporary copy of Memory Assistant with a
 * fictional family. The server decides whether this mode is on; in the
 * household mode these pages send people to the caregiver sign-in.
 */
function useAccountForm(submit: () => Promise<unknown>, after: string) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already signed in? Go straight on. Not a sandbox deployment? Use the household sign-in.
  useEffect(() => {
    api
      .session()
      .then((s) => {
        if (!s.sandbox) navigate("/caregiver/login", { replace: true });
        else if (s.caregiver) navigate(after, { replace: true });
      })
      .catch(() => undefined);
  }, [navigate, after]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await submit();
      navigate(after, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return { error, busy, onSubmit };
}

export function SandboxSignIn() {
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"), "/caregiver");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const form = useAccountForm(() => api.accountLogin(username, password), next);

  return (
    <Shell companion title="Sign in to your sandbox" description="Your own private copy of Memory Assistant.">
      <form onSubmit={form.onSubmit} className="space-y-4" noValidate>
        {form.error && <Alert tone="error">{form.error}</Alert>}
        <TextField label="Username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
        <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <Button type="submit" size="lg" className="w-full" loading={form.busy} disabled={!username || !password}
          icon={<LogIn className="h-5 w-5" aria-hidden="true" />}>
          Sign in
        </Button>
      </form>
      <p className="mt-6 text-[15px] text-ink">
        New here?{" "}
        <Link to="/signup" className="font-semibold text-primary-700 underline-offset-4 hover:underline">
          Create a free sandbox
        </Link>
      </p>
    </Shell>
  );
}

export function SandboxSignUp() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const form = useAccountForm(() => api.signUp(username, password, consent), "/caregiver");

  return (
    <Shell
      companion
      title="Try Memory Assistant yourself"
      description="Get your own private copy, ready to explore with a fictional family. No email needed."
    >
      <form onSubmit={form.onSubmit} className="space-y-4" noValidate>
        {form.error && <Alert tone="error">{form.error}</Alert>}
        <TextField
          label="Username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          hint="3–32 letters, numbers, dots, dashes or underscores."
          required
          autoFocus
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint="At least 10 characters."
          required
        />
        <div className="space-y-2 rounded-2xl border border-line bg-paper p-4 text-[15px] text-ink">
          <p>
            Your sandbox starts with a <strong>fictional family</strong> (drawn pictures, made-up memories). To try live
            recognition you can add a face: <strong>only your own, or someone who has agreed</strong>.
          </p>
          <p>
            Face photos and everything else stay in your sandbox only. It is <strong>deleted automatically after 7 days</strong>,
            or whenever you choose in Settings.
          </p>
          <label className="flex items-start gap-3 pt-1 font-semibold">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-primary-700" />
            I understand, and I will only add my own face or faces of people who have agreed.
          </label>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={form.busy} disabled={!username || !password || !consent}
          icon={<Sparkles className="h-5 w-5" aria-hidden="true" />}>
          Create my sandbox
        </Button>
      </form>
      <p className="mt-6 text-[15px] text-ink">
        Already have one?{" "}
        <Link to="/signin" className="font-semibold text-primary-700 underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </Shell>
  );
}
