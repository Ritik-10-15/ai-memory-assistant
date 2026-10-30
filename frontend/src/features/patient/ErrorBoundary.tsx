import { Component, type ErrorInfo, type ReactNode } from "react";
import { HeartHandshake, RefreshCw } from "lucide-react";

interface State {
  failed: boolean;
}

/**
 * Last line of defence for the patient screen: if a rendering bug slips
 * through, show a calm, large message with one obvious action instead of a
 * blank page. Nothing personal is shown, and nothing is logged with
 * patient data — only the error itself.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Development aid only; the message and stack carry no patient data.
    if (import.meta.env.DEV) console.error("Patient screen error:", error.message, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="theme-companion flex min-h-screen items-center justify-center bg-paper px-6 font-sans text-ink">
        <div role="alert" className="max-w-lg rounded-3xl border border-line bg-card p-10 text-center shadow-card">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-sage-50 text-sage-700">
            <HeartHandshake className="h-8 w-8" aria-hidden="true" />
          </span>
          <h1 className="mt-6 font-serif text-4xl text-ink">Something went wrong</h1>
          <p className="mt-3 text-xl text-ink">Please try again. If this keeps happening, let a caregiver know.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-8 inline-flex min-h-16 items-center gap-3 rounded-full bg-primary-700 px-8 text-xl font-semibold text-white hover:bg-primary-800"
          >
            <RefreshCw className="h-6 w-6" aria-hidden="true" />
            Try again
          </button>
        </div>
      </main>
    );
  }
}
