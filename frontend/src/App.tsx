import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { Spinner } from "@/components/ui";
import { CaregiverSignIn, PatientSignIn } from "@/features/auth/SignInPage";
import { PatientScreen } from "@/features/patient/PatientScreen";

// The caregiver workspace (charts included) loads only when it's opened, so
// the patient screen stays light.
const CaregiverApp = lazy(() => import("@/features/caregiver/CaregiverApp"));
// The public homepage brings its own fonts and is only fetched on /welcome.
const SitePage = lazy(() => import("@/features/site/SitePage"));

export function App() {
  return (
    <Routes>
      <Route path="/*" element={<PatientScreen />} />
      <Route
        path="/welcome"
        element={
          <Suspense fallback={<div className="min-h-screen bg-mint" />}>
            <SitePage />
          </Suspense>
        }
      />
      <Route path="/patient/login" element={<PatientSignIn />} />
      <Route path="/caregiver/login" element={<CaregiverSignIn />} />
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
