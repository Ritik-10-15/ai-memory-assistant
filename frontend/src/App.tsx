import { lazy, Suspense, type ReactNode } from "react";
import { Route, Routes } from "react-router-dom";
import { Spinner } from "@/components/ui";
import { SandboxSignIn, SandboxSignUp } from "@/features/auth/AccountPages";
import { CaregiverSignIn, PatientSignIn } from "@/features/auth/SignInPage";
import { ErrorBoundary } from "@/features/patient/ErrorBoundary";
import { PatientScreen } from "@/features/patient/PatientScreen";
import { SiteModeContext, siteModeFromPage } from "@/lib/siteMode";

// The caregiver workspace (charts included) loads only when it's opened, so
// the patient screen stays light.
const CaregiverApp = lazy(() => import("@/features/caregiver/CaregiverApp"));
// The public homepage brings its own fonts and is only fetched on /welcome.
const SitePage = lazy(() => import("@/features/site/SitePage"));

/** Tells the public homepage whether this server offers sandbox sign-ups (read from the page, no request). */
function ServerSiteMode({ children }: { children: ReactNode }) {
  return <SiteModeContext.Provider value={siteModeFromPage()}>{children}</SiteModeContext.Provider>;
}

export function App() {
  return (
    <Routes>
      <Route
        path="/*"
        element={
          <ErrorBoundary>
            <PatientScreen />
          </ErrorBoundary>
        }
      />
      <Route
        path="/welcome"
        element={
          <Suspense fallback={<div className="min-h-screen bg-mint" />}>
            <ServerSiteMode>
              <SitePage />
            </ServerSiteMode>
          </Suspense>
        }
      />
      <Route path="/patient/login" element={<PatientSignIn />} />
      <Route path="/caregiver/login" element={<CaregiverSignIn />} />
      <Route path="/signin" element={<SandboxSignIn />} />
      <Route path="/signup" element={<SandboxSignUp />} />
      <Route
        path="/caregiver/*"
        element={
          <Suspense fallback={<Spinner label="Loading caregiver workspace" className="min-h-screen" />}>
            <CaregiverApp />
          </Suspense>
        }
      />
    </Routes>
  );
}
