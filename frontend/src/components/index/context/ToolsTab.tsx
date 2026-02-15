import { useState, useEffect } from 'react';
import {
  Box, Typography, Button, TextField, Chip, MenuItem,
} from '@mui/material';
import { PlayArrow as RunIcon } from '@mui/icons-material';
import LoadingDots from '../../LoadingDots';
import {
  ToolDefinition,
  fetchToolDefinitions,
  testTool,
} from '../../../api/index';

interface Props {
  theme: any;
  isDark: boolean;
  showToast: any;
}

export default function ToolsTab({ theme, isDark }: Props) {
  const [tools, setTools] = useState<Record<string, ToolDefinition>>({});
  const [loading, setLoading] = useState(true);
  const [toolArgs, setToolArgs] = useState<Record<string, Record<string, string>>>({});
  const [results, setResults] = useState<Record<string, any>>({});
  const [running, setRunning] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchToolDefinitions();
        if (res.success && res.data) setTools(res.data);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, []);

  const handleArgChange = (toolName: string, paramName: string, value: string) => {
    setToolArgs((prev) => ({
      ...prev,
      [toolName]: { ...(prev[toolName] || {}), [paramName]: value },
    }));
  };

  const handleRun = async (toolName: string) => {
    setRunning((prev) => ({ ...prev, [toolName]: true }));
    try {
      const args = toolArgs[toolName] || {};
      // Convert numeric strings
      const parsedArgs: Record<string, any> = {};
      const tool = tools[toolName];
      for (const [key, val] of Object.entries(args)) {
        const paramDef = tool?.parameters?.properties?.[key];
        if (paramDef?.type === 'number' && val) {
          parsedArgs[key] = Number(val);
        } else {
          parsedArgs[key] = val;
        }
      }
      const res = await testTool(toolName, parsedArgs);
      if (res.success) {
        setResults((prev) => ({ ...prev, [toolName]: res.data }));
      } else {
        setResults((prev) => ({ ...prev, [toolName]: { error: res.error } }));
      }
    } catch (e: any) {
      setResults((prev) => ({ ...prev, [toolName]: { error: e.message } }));
    } finally {
      setRunning((prev) => ({ ...prev, [toolName]: false }));
    }
  };

  if (loading) return <LoadingDots text="Loading tools" fontSize={13} />;

  const toolList = Object.values(tools);

  if (toolList.length === 0) {
    return (
      <Typography sx={{ py: 4, textAlign: 'center', color: theme.text.muted, fontSize: 13 }}>
        No tools defined
      </Typography>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {toolList.map((tool) => {
        const params = tool.parameters?.properties || {};
        const required = tool.parameters?.required || [];
        const result = results[tool.name];

        return (
          <Box
            key={tool.name}
            sx={{
              p: 2, borderRadius: 2,
              bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
              border: `1px solid ${theme.border.default}`,
            }}
          >
            {/* Tool header */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: theme.text.primary }}>
                {tool.name}
              </Typography>
              {required.length > 0 && (
                <Chip label={`${Object.keys(params).length} params`} size="small" sx={{ fontSize: 10, height: 18 }} />
              )}
            </Box>
            <Typography sx={{ fontSize: 12, color: theme.text.muted, mb: 1.5 }}>
              {tool.description}
            </Typography>

            {/* Parameters */}
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
              {Object.entries(params).map(([paramName, paramDef]) => {
                const isRequired = required.includes(paramName);
                const currentValue = toolArgs[tool.name]?.[paramName] || '';

                if (paramDef.enum) {
                  return (
                    <TextField
                      key={paramName}
                      select
                      size="small"
                      label={`${paramName}${isRequired ? ' *' : ''}`}
                      value={currentValue}
                      onChange={(e) => handleArgChange(tool.name, paramName, e.target.value)}
                      InputProps={{ sx: { color: theme.text.primary, fontSize: 12 } }}
                      InputLabelProps={{ sx: { color: theme.text.muted, fontSize: 12 } }}
                      sx={{ minWidth: 140 }}
                    >
                      {paramDef.enum.map((v) => (
                        <MenuItem key={v} value={v}>{v}</MenuItem>
                      ))}
                    </TextField>
                  );
                }

                return (
                  <TextField
                    key={paramName}
                    size="small"
                    label={`${paramName}${isRequired ? ' *' : ''}`}
                    placeholder={paramDef.description || ''}
                    type={paramDef.type === 'number' ? 'number' : 'text'}
                    value={currentValue}
                    onChange={(e) => handleArgChange(tool.name, paramName, e.target.value)}
                    InputProps={{ sx: { color: theme.text.primary, fontSize: 12, fontFamily: 'monospace' } }}
                    InputLabelProps={{ sx: { color: theme.text.muted, fontSize: 12 } }}
                    sx={{ minWidth: 160 }}
                  />
                );
              })}
              <Button
                size="small"
                startIcon={running[tool.name] ? undefined : <RunIcon />}
                onClick={() => handleRun(tool.name)}
                disabled={running[tool.name]}
                sx={{
                  bgcolor: theme.brand.primary, color: '#fff', textTransform: 'none',
                  fontWeight: 600, fontSize: 12, borderRadius: 2, px: 2, alignSelf: 'flex-end',
                  '&:hover': { bgcolor: theme.brand.hover },
                }}
              >
                {running[tool.name] ? <LoadingDots text="Running" fontSize={11} color="#fff" /> : 'Run'}
              </Button>
            </Box>

            {/* Result */}
            {result !== undefined && (
              <Box sx={{
                mt: 1, p: 1.5, borderRadius: 1.5,
                bgcolor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.04)',
                border: `1px solid ${theme.border.subtle}`,
                maxHeight: 300, overflow: 'auto',
              }}>
                <Typography sx={{
                  fontSize: 11, fontFamily: 'monospace', color: theme.text.primary,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6,
                }}>
                  {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
                </Typography>
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
