import { useEffect, useState } from "react";
import { api, type AdminUser, type AdminFellowship } from "../api-client";

export function AdminMembersPanel() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [fellowships, setFellowships] = useState<AdminFellowship[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    Promise.all([api.adminListMembers(), api.adminListFellowships()])
      .then(([u, f]) => { setUsers(u.users); setFellowships(f.fellowships); });
  useEffect(() => { load(); }, []);

  const toggle = async (userId: string, fellowshipId: string, isMember: boolean) => {
    setError(null);
    try {
      if (isMember) await api.adminRemoveMember(userId, fellowshipId);
      else await api.adminAddMember(userId, fellowshipId);
      await load();
    } catch (e) {
      setError(e instanceof Error && e.message === "409" ? "Can't remove someone's last fellowship." : "Something went wrong.");
    }
  };

  return (
    <div className="admin-panel">
      <h2>Members</h2>
      {error && <p className="admin-error">{error}</p>}
      <table className="admin-table">
        <thead>
          <tr><th>Name</th>{fellowships.map((f) => <th key={f.id}>{f.name}</th>)}</tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.displayName}</td>
              {fellowships.map((f) => {
                const isMember = u.fellowships.some((uf) => uf.id === f.id);
                return (
                  <td key={f.id}>
                    <input type="checkbox" checked={isMember} onChange={() => toggle(u.id, f.id, isMember)} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
