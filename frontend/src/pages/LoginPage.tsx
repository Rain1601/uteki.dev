import { Box, Button, Typography, Paper, Alert } from '@mui/material';
import { GoogleColorIcon, GitHubIcon } from '../components/icons/SocialIcons';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../theme/ThemeProvider';
import { useResponsive } from '../hooks/useResponsive';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import LoadingDots from '../components/LoadingDots';

export default function LoginPage() {
  const { loading, error, login, isAuthenticated } = useAuth();
  const { theme, isDark } = useTheme();
  const { isMobile } = useResponsive();
  const navigate = useNavigate();

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/agent');
    }
  }, [isAuthenticated, navigate]);

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          bgcolor: theme.background.primary,
        }}
      >
        <LoadingDots text="加载中" fontSize={16} />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        bgcolor: theme.background.deepest,
        p: 2,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          p: isMobile ? 3 : 5,
          maxWidth: isMobile ? '100%' : 420,
          width: '100%',
          textAlign: 'center',
          bgcolor: theme.background.secondary,
          borderRadius: isMobile ? 2 : 3,
          border: `1px solid ${theme.border.subtle}`,
        }}
      >
        <Typography
          variant={isMobile ? 'h5' : 'h4'}
          component="h1"
          sx={{
            fontWeight: 600,
            color: theme.text.primary,
            mb: 1,
          }}
        >
          登录 Uteki
        </Typography>
        <Typography
          variant="body1"
          sx={{
            color: theme.text.secondary,
            mb: 4,
          }}
        >
          使用您的社交账号登录
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* GitHub 登录按钮 */}
          <Button
            variant="contained"
            size="large"
            startIcon={<GitHubIcon sx={{ fontSize: 22 }} />}
            onClick={() => login('github')}
            sx={{
              py: 1.5,
              px: 3,
              minHeight: 48,
              bgcolor: isDark ? '#fff' : '#24292e',
              color: isDark ? '#24292e' : '#fff',
              fontWeight: 600,
              fontSize: '1rem',
              textTransform: 'none',
              borderRadius: 2,
              boxShadow: 'none',
              '&:hover': {
                bgcolor: isDark ? '#f0f0f0' : '#1a1e22',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              },
              '& .MuiButton-startIcon': {
                mr: 1.5,
              },
            }}
          >
            使用 GitHub 登录
          </Button>

          {/* Google 登录按钮 */}
          <Button
            variant="outlined"
            size="large"
            startIcon={<GoogleColorIcon sx={{ fontSize: 22 }} />}
            onClick={() => login('google')}
            sx={{
              py: 1.5,
              px: 3,
              minHeight: 48,
              bgcolor: 'transparent',
              borderColor: theme.border.default,
              color: theme.text.primary,
              fontWeight: 600,
              fontSize: '1rem',
              textTransform: 'none',
              borderRadius: 2,
              '&:hover': {
                borderColor: theme.brand.primary,
                bgcolor: 'rgba(100, 149, 237, 0.08)',
              },
              '& .MuiButton-startIcon': {
                mr: 1.5,
              },
            }}
          >
            使用 Google 登录
          </Button>
        </Box>

        <Typography
          variant="caption"
          sx={{
            mt: 4,
            display: 'block',
            color: theme.text.muted,
          }}
        >
          登录即表示您同意我们的服务条款和隐私政策
        </Typography>
      </Paper>
    </Box>
  );
}
