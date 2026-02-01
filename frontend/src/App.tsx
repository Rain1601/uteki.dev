import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import DemoPage from './pages/DemoPage';
import AdminPage from './pages/AdminPage';
import AgentChatPage from './pages/AgentChatPage';
import LoginPage from './pages/LoginPage';

function App() {
  return (
    <Routes>
      {/* 登录页面 - 不受保护 */}
      <Route path="/login" element={<LoginPage />} />

      {/* 受保护的路由 */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DemoPage />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="agent" element={<AgentChatPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
