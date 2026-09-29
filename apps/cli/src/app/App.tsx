import { useKeyboard } from "@opentui/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router";
import { AboutScreen } from "../features/about/AboutScreen";
import { HomeScreen } from "../features/home/HomeScreen";
import { SettingsScreen } from "../features/settings/SettingsScreen";

export function App({ onQuit }: { onQuit: () => void }) {
  return (
    <MemoryRouter>
      <AppRoutes onQuit={onQuit} />
    </MemoryRouter>
  );
}

function AppRoutes({ onQuit }: { onQuit: () => void }) {
  useKeyboard((key) => {
    if (key.name === "q" || key.name === "escape" || (key.ctrl && key.name === "c")) {
      onQuit();
    }
  });

  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route path="/about" element={<AboutRoute />} />
      <Route path="/settings" element={<SettingsRoute />} />
    </Routes>
  );
}

function HomeRoute() {
  const navigate = useNavigate();
  return <HomeScreen onNavigate={(path) => navigate(path)} />;
}

function AboutRoute() {
  const navigate = useNavigate();
  return <AboutScreen onBack={() => navigate("/")} />;
}

function SettingsRoute() {
  const navigate = useNavigate();
  return <SettingsScreen onBack={() => navigate("/")} />;
}
