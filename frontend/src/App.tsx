import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Spinner } from "@/components/ui";
import { CaregiverSignIn, PatientSignIn } from "@/features/auth/SignInPage";
import { PatientScreen } from "@/features/patient/PatientScreen";

// The caregiver workspace (charts included) loads only when it's opened, so
// the patient screen stays light.
const CaregiverApp = lazy(() => import("@/features/caregiver/CaregiverApp"));

export function App() {
  return (
    <Routes>
      <Route path="/" element={<PatientScreen />} />
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
