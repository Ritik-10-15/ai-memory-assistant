import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { api, UNAUTHORIZED_EVENT } from "@/api/client";
import { Spinner } from "@/components/ui";
import { CaregiverLayout } from "./CaregiverLayout";
import { EnrollmentPage } from "./pages/EnrollmentPage";
import { MemoriesPage } from "./pages/MemoriesPage";
import { OverviewPage } from "./pages/OverviewPage";
import { PeoplePage } from "./pages/PeoplePage";
import { PersonEditorPage } from "./pages/PersonEditorPage";
import { PersonProfilePage } from "./pages/PersonProfilePage";
import { PhotosPage } from "./pages/PhotosPage";
import { SettingsPage } from "./pages/SettingsPage";
import { VisitsPage } from "./pages/VisitsPage";

/** Fresh editor state per person: "add" → "edit" must not reuse the old instance. */
function PersonEditorRoute() {
  const { id } = useParams();
  return <PersonEditorPage key={id ?? "new"} />;
}

/**
 * Caregiver workspace. The server already redirects signed-out page loads
 * to /caregiver/login; this guard also covers a session that expires while
 * the app is open (any API 401 sends the caregiver back to sign in).
 */
export default function CaregiverApp() {
  const navigate = useNavigate();
  const location = useLocation();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const toLogin = () => {
      const next = encodeURIComponent(location.pathname + location.search);
      navigate(`/caregiver/login?next=${next}`, { replace: true });
    };
    api
      .session()
      .then((s) => (s.caregiver ? setChecked(true) : toLogin()))
      .catch(() => setChecked(true)); // offline: let pages show their own errors
    window.addEventListener(UNAUTHORIZED_EVENT, toLogin);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, toLogin);
    // Only on entry; in-app navigation is covered by the 401 listener.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!checked) return <Spinner label="Checking sign-in" className="min-h-screen" />;

  return (
    <Routes>
      <Route element={<CaregiverLayout />}>
        <Route index element={<OverviewPage />} />
        <Route path="people" element={<PeoplePage />} />
        <Route path="people/add" element={<PersonEditorRoute />} />
        <Route path="people/:id/edit" element={<PersonEditorRoute />} />
        <Route path="people/:id" element={<PersonProfilePage />} />
        <Route path="enroll" element={<EnrollmentPage />} />
        <Route path="enroll/:id" element={<EnrollmentPage />} />
        <Route path="photos" element={<PhotosPage />} />
        <Route path="memories" element={<MemoriesPage />} />
        <Route path="visits" element={<VisitsPage />} />
        <Route path="analytics" element={<Navigate to="/caregiver/visits" replace />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/caregiver" replace />} />
      </Route>
    </Routes>
  );
}
