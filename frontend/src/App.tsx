import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import AdminPage from './pages/AdminPage';
import AgentChatPage from './pages/AgentChatPage';
import LoginPage from './pages/LoginPage';
import NewsTimelinePage from './pages/NewsTimelinePage';
import SnbTradingPage from './pages/SnbTradingPage';
import IndexAgentPage from './pages/IndexAgentPage';
import CompanyAgentPage from './pages/CompanyAgentPage';
import CompanyAgentDemoPage from './pages/CompanyAgentDemoPage';
import CompanyConversationDemo from './pages/CompanyConversationDemo';
import CompanyAgentV2DemoPage from './pages/CompanyAgentV2DemoPage';
import IndexAgentDemoPage from './pages/IndexAgentDemoPage';
import ApiTestPage from './pages/ApiTestPage';
import DashboardPage from './pages/DashboardPage';

import NewsHubPage from './pages/NewsHubPage';
import MarketDashboardPage from './pages/MarketDashboardPage';
import VotingDemoPage from './pages/VotingDemoPage';
import ReflectionDemoPage from './pages/ReflectionDemoPage';
import ModelSelectorDemoPage from './pages/ModelSelectorDemoPage';


function App() {
  return (
    <Routes>
      {/* 不受保护的页面 */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/test-llm" element={<ApiTestPage />} />
      <Route path="/demo/voting" element={<VotingDemoPage />} />
      <Route path="/demo/reflection" element={<ReflectionDemoPage />} />
      <Route path="/demo/model-selector" element={<ModelSelectorDemoPage />} />
      <Route path="/demo/company-agent" element={<CompanyAgentDemoPage />} />
      <Route path="/demo/company-conversation" element={<CompanyConversationDemo />} />
      <Route path="/company-v2" element={<CompanyAgentV2DemoPage />} />
      {/* CompanyTaskPage merged into /company-v2 */}
      <Route path="/demo/index-agent" element={<IndexAgentDemoPage />} />

      {/* 受保护的路由 */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="agent" element={<AgentChatPage />} />
        <Route path="news-timeline" element={<NewsTimelinePage />} />
        <Route path="news-hub" element={<NewsHubPage />} />
        <Route path="macro/market-dashboard" element={<MarketDashboardPage />} />
        <Route path="trading/snb" element={<SnbTradingPage />} />
<Route path="index-agent" element={<IndexAgentPage />} />
        <Route path="index-agent-demo" element={<IndexAgentDemoPage />} />
        <Route path="company-agent" element={<CompanyAgentPage />} />
        <Route path="company-agent/:id" element={<CompanyAgentPage />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
