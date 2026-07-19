import { Navigate, Link } from "react-router-dom";
import type { MeResponse } from "../api-client";
import { AdminFellowshipsPanel } from "../components/AdminFellowshipsPanel";
import { AdminMembersPanel } from "../components/AdminMembersPanel";

export default function Admin({ me }: { me: MeResponse }) {
  if (!me.isAdmin) return <Navigate to="/" replace />;
  return (
    <div className="admin-page">
      <Link to="/" className="admin-back">← Back to map</Link>
      <h1>Admin</h1>
      <AdminFellowshipsPanel />
      <AdminMembersPanel />
    </div>
  );
}
