import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router";
import { z } from "zod";
import { ChatScreen } from "../features/chat/ChatScreen";
import { HistoryScreen } from "../features/chat/HistoryScreen";
import { HomeScreen } from "../features/home/HomeScreen";
import { promptRouteStateSchema } from "../lib/promptSchema";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route path="/chat/:id" element={<ChatRoute />} />
      <Route path="/history" element={<HistoryRoute />} />
    </Routes>
  );
}

function HomeRoute() {
  const navigate = useNavigate();
  return (
    <HomeScreen
      onHistory={() => navigate("/history")}
      onConversationCreated={(id, prompt) => navigate(`/chat/${id}`, { state: { prompt } })}
    />
  );
}

function ChatRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const result = z.object({ id: z.uuid() }).safeParse(useParams());
  const prompt = promptRouteStateSchema.safeParse(location.state);
  if (!result.success) return <Navigate to="/" replace />;
  return (
    <ChatScreen
      key={result.data.id}
      conversationId={result.data.id}
      prompt={prompt.success ? prompt.data.prompt : undefined}
      onBack={() => navigate("/")}
    />
  );
}

function HistoryRoute() {
  const navigate = useNavigate();
  return <HistoryScreen onOpen={(id) => navigate(`/chat/${id}`)} onBack={() => navigate("/")} />;
}
