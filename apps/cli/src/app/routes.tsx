import {
  type AgentMode,
  agentModeSchema,
  conversationReferenceSchema,
  defaultAgentMode,
} from "@freecode/contracts";
import { useKeyboard } from "@opentui/react";
import { useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router";
import { ChatScreen } from "../features/chat/ChatScreen";
import { HistoryScreen } from "../features/chat/HistoryScreen";
import { HomeScreen } from "../features/home/HomeScreen";
import { promptRouteStateSchema } from "../lib/promptSchema";

export function AppRoutes() {
  const [mode, setMode] = useState<AgentMode>(defaultAgentMode);
  const { pathname } = useLocation();
  useKeyboard((key) => {
    if (pathname !== "/" && !pathname.startsWith("/chat/")) return;
    if (key.name !== "tab" || key.ctrl || key.meta || key.shift || key.super) return;
    key.preventDefault();
    setMode((current) => {
      const modes = agentModeSchema.options;
      return modes[(modes.indexOf(current) + 1) % modes.length] ?? defaultAgentMode;
    });
  });
  return (
    <Routes>
      <Route path="/" element={<HomeRoute mode={mode} />} />
      <Route path="/chat/:id" element={<ChatRoute mode={mode} />} />
      <Route path="/history" element={<HistoryRoute />} />
    </Routes>
  );
}

function HomeRoute({ mode }: { mode: AgentMode }) {
  const navigate = useNavigate();
  return (
    <HomeScreen
      mode={mode}
      onHistory={() => navigate("/history")}
      onConversationCreated={(id, prompt) => navigate(`/chat/${id}`, { state: { prompt, mode } })}
    />
  );
}

function ChatRoute({ mode }: { mode: AgentMode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const result = conversationReferenceSchema.safeParse(useParams());
  const prompt = promptRouteStateSchema.safeParse(location.state);
  if (!result.success) return <Navigate to="/" replace />;
  return (
    <ChatScreen
      key={result.data.id}
      conversationId={result.data.id}
      mode={mode}
      prompt={prompt.success ? prompt.data.prompt : undefined}
      promptMode={prompt.success ? prompt.data.mode : undefined}
      onBack={() => navigate("/")}
    />
  );
}

function HistoryRoute() {
  const navigate = useNavigate();
  return <HistoryScreen onOpen={(id) => navigate(`/chat/${id}`)} onBack={() => navigate("/")} />;
}
