import { Navigate, useLocation } from 'react-router-dom';
import { Box } from '@mui/material';
import { useAuth } from '../hooks/useAuth';
import LoadingDots from './LoadingDots';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          bgcolor: 'background.default',
        }}
      >
        <LoadingDots text="加载中" fontSize={16} />
      </Box>
    );
  }

  if (!isAuthenticated) {
    // Redirect to login page, save current location for redirect after login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
