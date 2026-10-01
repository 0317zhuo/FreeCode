import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router";
import { ChatScreen } from "../features/chat/ChatScreen";
import { HomeScreen } from "../features/home/HomeScreen";
import { promptRouteStateSchema } from "../lib/promptSchema";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route path="/chat" element={<ChatRoute />} />
    </Routes>
  );
}

function HomeRoute() {
  const navigate = useNavigate();
  return <HomeScreen onSubmitPrompt={(prompt) => navigate("/chat", { state: { prompt } })} />;
}

function ChatRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const result = promptRouteStateSchema.safeParse(location.state);

  if (!result.success) return <Navigate to="/" replace />;

  return <ChatScreen prompt={result.data.prompt} onBack={() => navigate("/")} />;
}
