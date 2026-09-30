import { useKeyboard, useRenderer } from "@opentui/react";
import { MemoryRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router";
import { AboutScreen } from "../features/about/AboutScreen";
import { AiTestScreen } from "../features/ai-test/AiTestScreen";
import { ChatScreen } from "../features/chat/ChatScreen";
import { chatRouteStateSchema } from "../features/chat/promptSchema";
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
  const renderer = useRenderer();

  useKeyboard((key) => {
    if (
      (key.name === "q" && !renderer.currentFocusedEditor) ||
      key.name === "escape" ||
      (key.ctrl && key.name === "c")
    ) {
      onQuit();
    }
  });

  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route path="/about" element={<AboutRoute />} />
      <Route path="/ai" element={<AiTestRoute />} />
      <Route path="/chat" element={<ChatRoute />} />
      <Route path="/settings" element={<SettingsRoute />} />
    </Routes>
  );
}

function HomeRoute() {
  const navigate = useNavigate();
  return (
    <HomeScreen
      onNavigate={(path) => navigate(path)}
      onSubmitPrompt={(prompt) => navigate("/chat", { state: { prompt } })}
    />
  );
}

function ChatRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const result = chatRouteStateSchema.safeParse(location.state);

  if (!result.success) return <Navigate to="/" replace />;

  return <ChatScreen prompt={result.data.prompt} onBack={() => navigate("/")} />;
}

function AboutRoute() {
  const navigate = useNavigate();
  return <AboutScreen onBack={() => navigate("/")} />;
}

function SettingsRoute() {
  const navigate = useNavigate();
  return <SettingsScreen onBack={() => navigate("/")} />;
}

function AiTestRoute() {
  const navigate = useNavigate();
  return <AiTestScreen onBack={() => navigate("/")} />;
}
