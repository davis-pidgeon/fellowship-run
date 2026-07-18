import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useSession } from "./useSession";
import Login from "./pages/Login";
import Join from "./pages/Join";
import CharacterSelect from "./pages/CharacterSelect";
import Dashboard from "./pages/Dashboard";
import Admin from "./pages/Admin";
import { LoadingRing } from "./components/LoadingRing";

function Home() {
  const { data, loading, refresh } = useSession();
  if (loading) return <LoadingRing label="Summoning the Fellowship…" />;
  if (!data) return <Navigate to="/login" replace />;
  if (!data.user.chosenCharacter) return <CharacterSelect onChosen={refresh} />;
  return <Dashboard me={data} refresh={refresh} />;
}

function AdminRoute() {
  const { data, loading } = useSession();
  if (loading) return <LoadingRing label="Summoning the Fellowship…" />;
  if (!data) return <Navigate to="/login" replace />;
  return <Admin me={data} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/join" element={<Join />} />
        <Route path="/admin" element={<AdminRoute />} />
        <Route path="/" element={<Home />} />
      </Routes>
    </BrowserRouter>
  );
}
