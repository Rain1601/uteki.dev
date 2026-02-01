import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TextField,
  Alert,
} from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  PlayArrow,
  Pause,
  CheckCircle,
  Error,
} from '@mui/icons-material';
import { useTheme } from '../theme/ThemeProvider';
import { useResponsive } from '../hooks/useResponsive';

export default function DemoPage() {
  const { theme } = useTheme();
  const { isMobile } = useResponsive();

  const statsData = [
    { label: '总市值', value: '$50.00万亿', change: '+1.20%', positive: true },
    { label: '黄金总市值', value: '$15.00万亿', change: '+0.50%', positive: true },
    { label: '加密货币总市值', value: '$3.00万亿', change: '-2.10%', positive: false },
    { label: '今日交易量', value: '$2.5万亿', change: '+5.30%', positive: true },
  ];

  const tradesData = [
    { symbol: 'BTC-USDT', side: 'buy', price: '42,350', amount: '0.5', profit: '+$1,250', status: 'completed' },
    { symbol: 'ETH-USDT', side: 'sell', price: '2,280', amount: '5.0', profit: '-$340', status: 'completed' },
    { symbol: 'SOL-USDT', side: 'buy', price: '98.50', amount: '50', profit: '+$820', status: 'running' },
    { symbol: 'BNB-USDT', side: 'buy', price: '310', amount: '10', profit: '+$150', status: 'paused' },
  ];

  return (
    <Box>
      {/* 标题区域 */}
      <Box sx={{ mb: 4 }}>
        <Typography
          variant="h4"
          sx={{
            fontWeight: 700,
            mb: 1,
            background: `linear-gradient(135deg, ${theme.brand.primary} 0%, ${theme.brand.accent} 100%)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          配色方案演示
        </Typography>
        <Typography variant="body1" color="text.secondary">
          基于 uchu_trade 原配色 #2EE5AC + Material UI 无缝线设计
        </Typography>
      </Box>

      {/* 统计卡片 */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {statsData.map((stat, index) => (
          <Grid item xs={12} sm={6} md={3} key={index}>
            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {stat.label}
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
                  {stat.value}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {stat.positive ? (
                    <TrendingUp sx={{ color: theme.trading.profit, fontSize: '1rem' }} />
                  ) : (
                    <TrendingDown sx={{ color: theme.trading.loss, fontSize: '1rem' }} />
                  )}
                  <Typography
                    variant="body2"
                    sx={{
                      color: stat.positive ? theme.trading.profit : theme.trading.loss,
                      fontWeight: 600,
                    }}
                  >
                    {stat.change}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* 按钮演示 */}
      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
            按钮样式
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 3 }}>
            <Button variant="contained" color="primary">
              主要按钮
            </Button>
            <Button variant="outlined" color="primary">
              次要按钮
            </Button>
            <Button variant="contained" color="success">
              成功
            </Button>
            <Button variant="contained" color="error">
              危险
            </Button>
            <Button variant="contained" color="warning">
              警告
            </Button>
            <Button variant="contained" color="info">
              信息
            </Button>
          </Box>

          <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, mt: 3 }}>
            状态徽章
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 3 }}>
            <Chip
              icon={<PlayArrow />}
              label="运行中"
              sx={{ bgcolor: 'rgba(46, 229, 172, 0.2)', color: theme.brand.primary }}
            />
            <Chip
              icon={<Pause />}
              label="已暂停"
              sx={{ bgcolor: 'rgba(255, 167, 38, 0.2)', color: theme.status.warning }}
            />
            <Chip
              icon={<CheckCircle />}
              label="已完成"
              sx={{ bgcolor: 'rgba(41, 182, 246, 0.2)', color: theme.status.info }}
            />
            <Chip
              icon={<Error />}
              label="失败"
              sx={{ bgcolor: 'rgba(244, 67, 54, 0.2)', color: theme.status.error }}
            />
            <Chip label="买入" color="success" />
            <Chip label="卖出" color="error" />
          </Box>

          <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, mt: 3 }}>
            输入框
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 2, flexWrap: 'wrap' }}>
            <TextField label="标准输入" variant="outlined" fullWidth={isMobile} />
            <TextField label="密码" type="password" variant="outlined" fullWidth={isMobile} />
            <TextField label="禁用状态" disabled variant="outlined" fullWidth={isMobile} />
          </Box>
        </CardContent>
      </Card>

      {/* 交易记录表格 */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
            交易记录（无缝线设计）
          </Typography>
          <TableContainer component={Paper} elevation={0} sx={{ overflowX: 'auto' }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>交易对</TableCell>
                  <TableCell>方向</TableCell>
                  <TableCell align="right">价格</TableCell>
                  <TableCell align="right">数量</TableCell>
                  <TableCell align="right">盈亏</TableCell>
                  <TableCell>状态</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tradesData.map((row, index) => (
                  <TableRow key={index}>
                    <TableCell sx={{ fontWeight: 600 }}>{row.symbol}</TableCell>
                    <TableCell>
                      <Chip
                        label={row.side === 'buy' ? '买入' : '卖出'}
                        size="small"
                        color={row.side === 'buy' ? 'success' : 'error'}
                      />
                    </TableCell>
                    <TableCell align="right">${row.price}</TableCell>
                    <TableCell align="right">{row.amount}</TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        color: row.profit.startsWith('+') ? theme.trading.profit : theme.trading.loss,
                        fontWeight: 600,
                      }}
                    >
                      {row.profit}
                    </TableCell>
                    <TableCell>
                      {row.status === 'completed' && (
                        <Chip
                          label="已完成"
                          size="small"
                          sx={{ bgcolor: 'rgba(41, 182, 246, 0.2)', color: theme.status.info }}
                        />
                      )}
                      {row.status === 'running' && (
                        <Chip
                          label="运行中"
                          size="small"
                          sx={{ bgcolor: 'rgba(46, 229, 172, 0.2)', color: theme.brand.primary }}
                        />
                      )}
                      {row.status === 'paused' && (
                        <Chip
                          label="已暂停"
                          size="small"
                          sx={{ bgcolor: 'rgba(255, 167, 38, 0.2)', color: theme.status.warning }}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* 提示信息 */}
      <Box sx={{ mt: 4 }}>
        <Alert severity="success" sx={{ mb: 2 }}>
          成功消息 - 使用品牌青绿色 #{theme.brand.primary.replace('#', '')}
        </Alert>
        <Alert severity="info" sx={{ mb: 2 }}>
          信息提示 - 蓝色系统消息
        </Alert>
        <Alert severity="warning" sx={{ mb: 2 }}>
          警告消息 - 橙色警告提示
        </Alert>
        <Alert severity="error">
          错误消息 - 红色错误提示
        </Alert>
      </Box>
    </Box>
  );
}
