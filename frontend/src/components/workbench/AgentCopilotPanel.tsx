import React from 'react';
import { CheckCircle2, Send, Terminal } from 'lucide-react';
import { AgentToolCallTrace } from '../../types';

export interface CopilotMessageItem {
  role: 'user' | 'assistant';
  text: string;
  providerUsed?: string;
  modelUsed?: string;
  toolCalls?: AgentToolCallTrace[];
  actionsTaken?: string[];
  suggestions?: string[];
}

export interface AgentCopilotPanelProps {
  messages: CopilotMessageItem[];
  copilotInput: string;
  copilotLoading: boolean;
  llmProvider: string;
  llmModel: string;
  openRouterKey: string;
  llmKeyConfigured: boolean;
  showLlmSettings: boolean;
  onToggleLlmSettings: () => void;
  onChangeProvider: (v: string) => void;
  onChangeModel: (v: string) => void;
  onChangeApiKey: (v: string) => void;
  onSaveLlmConfig: () => void;
  onChangeInput: (v: string) => void;
  onSendQuery: (query?: string) => void;
}

export const AgentCopilotPanel: React.FC<AgentCopilotPanelProps> = ({
  messages,
  copilotInput,
  copilotLoading,
  llmProvider,
  llmModel,
  openRouterKey,
  llmKeyConfigured,
  showLlmSettings,
  onToggleLlmSettings,
  onChangeProvider,
  onChangeModel,
  onChangeApiKey,
  onSaveLlmConfig,
  onChangeInput,
  onSendQuery,
}) => {
  return (
    <div className="flex flex-col h-full min-h-[500px] justify-between space-y-3">
      {/* Live OpenRouter / LLM API Key & Model Configurator */}
      <div className="bg-slate-900/95 border border-slate-800 rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded font-bold border ${
                llmKeyConfigured
                  ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/60'
                  : 'bg-amber-950/90 text-amber-300 border-amber-500/60'
              }`}
            >
              {llmKeyConfigured
                ? `LIVE LLM: ${llmModel.split('/').pop()}`
                : 'OPENROUTER KEY READY TO CONNECT'}
            </span>
          </div>
          <button
            onClick={onToggleLlmSettings}
            className="text-[11px] font-mono text-cyan-400 hover:underline"
          >
            {showLlmSettings ? 'Hide LLM Key ▲' : 'Configure OpenRouter / Model ▼'}
          </button>
        </div>

        {showLlmSettings && (
          <div className="space-y-2 pt-1 border-t border-slate-800 text-xs">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] font-mono uppercase text-slate-400">Provider</label>
                <select
                  value={llmProvider}
                  onChange={(e) => onChangeProvider(e.target.value)}
                  className="w-full mt-0.5 bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-[11px] text-white"
                >
                  <option value="openrouter">OpenRouter</option>
                  <option value="openai">OpenAI Direct</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-[10px] font-mono uppercase text-slate-400">
                  OpenRouter Model ID (Tool-Calling)
                </label>
                <input
                  type="text"
                  list="openrouter-models"
                  value={llmModel}
                  onChange={(e) => onChangeModel(e.target.value)}
                  className="w-full mt-0.5 bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-[11px] text-white"
                />
                <datalist id="openrouter-models">
                  <option value="anthropic/claude-3.7-sonnet" />
                  <option value="google/gemini-2.5-pro-preview" />
                  <option value="google/gemini-2.5-flash" />
                  <option value="openai/gpt-4o" />
                  <option value="openai/gpt-4o-mini" />
                  <option value="deepseek/deepseek-chat-v3-0324" />
                  <option value="meta-llama/llama-3.3-70b-instruct" />
                </datalist>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="password"
                value={openRouterKey}
                onChange={(e) => onChangeApiKey(e.target.value)}
                placeholder="Paste OpenRouter API Key (sk-or-v1-...)"
                className="flex-1 bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 font-mono text-[11px] text-white focus:outline-none focus:border-cyan-400"
              />
              <button
                type="button"
                onClick={onSaveLlmConfig}
                className="px-3 py-1.5 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shrink-0"
              >
                Save Key
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {messages.map((m, idx) => (
          <div key={idx} className="space-y-2">
            {m.toolCalls && m.toolCalls.length > 0 && (
              <div className="bg-slate-950/90 border border-indigo-500/40 rounded-xl p-2.5 space-y-1.5">
                <div className="flex items-center justify-between text-[10px] font-mono uppercase text-indigo-300 font-semibold">
                  <span className="flex items-center gap-1.5">
                    <Terminal className="w-3 h-3 text-indigo-400" />
                    Agent Tool Trace ({m.toolCalls.length} tools)
                  </span>
                  {m.modelUsed && <span className="text-cyan-300">{m.modelUsed}</span>}
                </div>
                {m.toolCalls.map((tc) => (
                  <div
                    key={tc.step}
                    className="bg-slate-900/90 border border-slate-800 rounded-lg p-2 text-[10px] font-mono space-y-0.5"
                  >
                    <div className="flex items-center justify-between text-cyan-300">
                      <span className="font-bold">
                        #{tc.step} {tc.tool_name}({JSON.stringify(tc.arguments)})
                      </span>
                      <span className="text-slate-500">{tc.duration_ms}ms</span>
                    </div>
                    <div className="text-emerald-300 flex items-start gap-1">
                      <CheckCircle2 className="w-3 h-3 shrink-0 mt-0.5 text-emerald-400" />
                      <span>{tc.result_summary}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div
              className={`p-3 rounded-xl text-xs leading-relaxed whitespace-pre-line ${
                m.role === 'user'
                  ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-100 ml-6'
                  : 'bg-slate-900/95 border border-slate-800 text-slate-200'
              }`}
            >
              {m.text}
            </div>

            {m.suggestions && m.suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {m.suggestions.map((sug, sIdx) => (
                  <button
                    key={sIdx}
                    onClick={() => onSendQuery(sug)}
                    className="text-left text-[10px] px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-300 transition-all"
                  >
                    {sug}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {copilotLoading && (
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs font-mono text-cyan-300 animate-pulse">
            Executing agent tool calls against live Digital Twin & DuckDB...
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSendQuery();
        }}
        className="flex items-center gap-2 pt-2 border-t border-slate-800"
      >
        <input
          type="text"
          value={copilotInput}
          onChange={(e) => onChangeInput(e.target.value)}
          placeholder="Ask Agent to inspect cooling loops, query DuckDB, or execute BACnet setpoints..."
          className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400"
        />
        <button
          type="submit"
          disabled={copilotLoading}
          className="p-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
