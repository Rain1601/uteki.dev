import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../api/admin';
import type {
  CreateAPIKeyRequest,
  UpdateAPIKeyRequest,
  CreateLLMProviderWithKeyRequest,
  UpdateLLMProviderRequest,
  CreateExchangeConfigRequest,
  CreateDataSourceConfigRequest,
} from '../types/admin';

// ==================== API Keys ====================
export const useAPIKeys = () => {
  return useQuery({
    queryKey: ['apiKeys'],
    queryFn: () => adminApi.apiKeys.list(),
  });
};

export const useCreateAPIKey = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateAPIKeyRequest) => adminApi.apiKeys.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] });
    },
  });
};

export const useUpdateAPIKey = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAPIKeyRequest }) =>
      adminApi.apiKeys.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] });
    },
  });
};

export const useDeleteAPIKey = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminApi.apiKeys.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] });
    },
  });
};

// ==================== LLM Providers ====================
export const useLLMProviders = () => {
  return useQuery({
    queryKey: ['llmProviders'],
    queryFn: () => adminApi.llmProviders.list(),
  });
};

export const useCreateLLMProviderWithKey = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateLLMProviderWithKeyRequest) =>
      adminApi.llmProviders.createWithKey(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['llmProviders'] });
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] });
    },
  });
};

export const useUpdateLLMProvider = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateLLMProviderRequest }) =>
      adminApi.llmProviders.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['llmProviders'] });
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] });
    },
  });
};

export const useDeleteLLMProvider = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminApi.llmProviders.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['llmProviders'] });
    },
  });
};

// ==================== Exchange Configs ====================
export const useExchangeConfigs = () => {
  return useQuery({
    queryKey: ['exchangeConfigs'],
    queryFn: () => adminApi.exchanges.list(),
  });
};

export const useCreateExchangeConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateExchangeConfigRequest) =>
      adminApi.exchanges.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exchangeConfigs'] });
    },
  });
};

export const useUpdateExchangeConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateExchangeConfigRequest> }) =>
      adminApi.exchanges.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exchangeConfigs'] });
    },
  });
};

export const useDeleteExchangeConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminApi.exchanges.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exchangeConfigs'] });
    },
  });
};

// ==================== Data Source Configs ====================
export const useDataSourceConfigs = () => {
  return useQuery({
    queryKey: ['dataSourceConfigs'],
    queryFn: () => adminApi.dataSources.list(),
  });
};

export const useCreateDataSourceConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateDataSourceConfigRequest) =>
      adminApi.dataSources.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dataSourceConfigs'] });
    },
  });
};

// ==================== System Health ====================
export const useSystemHealth = () => {
  return useQuery({
    queryKey: ['systemHealth'],
    queryFn: () => adminApi.system.health(),
    refetchInterval: 30000,
  });
};
