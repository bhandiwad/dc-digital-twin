import {
  AgentCopilotResponse,
  TwinStateSnapshot,
  WhatIfRequest,
  WhatIfResponse,
} from '../types';

export interface LLMConfigStatus {
  active_provider: string;
  active_model: string;
  live_llm_ready: boolean;
}

export async function fetchTwinState(): Promise<TwinStateSnapshot> {
  const res = await fetch('/api/state');
  if (!res.ok) throw new Error(`Failed to fetch /api/state: ${res.status}`);
  return res.json();
}

export async function triggerTwinScenario(scenarioId: string): Promise<TwinStateSnapshot> {
  const res = await fetch('/api/scenario', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario_id: scenarioId }),
  });
  if (!res.ok) throw new Error(`Failed to trigger scenario: ${res.status}`);
  return res.json();
}

export async function applyOptimizationSetpoints(): Promise<TwinStateSnapshot> {
  const res = await fetch('/api/apply-optimization', { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to apply optimization: ${res.status}`);
  return res.json();
}

export async function postCoolingControl(payload: Record<string, unknown>): Promise<TwinStateSnapshot> {
  const res = await fetch('/api/controls', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to update controls: ${res.status}`);
  return res.json();
}

export async function runCounterfactualWhatIf(payload: WhatIfRequest): Promise<WhatIfResponse> {
  const res = await fetch('/api/what-if', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to run what-if simulation: ${res.status}`);
  return res.json();
}

export async function fetchLlmConfig(): Promise<LLMConfigStatus> {
  const res = await fetch('/api/llm/config');
  if (!res.ok) throw new Error(`Failed to fetch LLM config: ${res.status}`);
  return res.json();
}

export async function updateLlmConfig(params: {
  provider: string;
  model: string;
  api_key?: string;
}): Promise<LLMConfigStatus> {
  const res = await fetch('/api/llm/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Failed to save LLM config: ${res.status}`);
  return res.json();
}

export async function postCopilotQuery(params: {
  question: string;
  llm_provider: string;
  llm_model: string;
  api_key?: string;
}): Promise<AgentCopilotResponse> {
  const res = await fetch('/api/copilot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: params.question,
      auto_execute_tools: true,
      llm_provider: params.llm_provider,
      llm_model: params.llm_model,
      api_key: params.api_key,
    }),
  });
  if (!res.ok) throw new Error(`Failed to run Copilot query: ${res.status}`);
  return res.json();
}
