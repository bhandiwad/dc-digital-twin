import React from 'react';
import { CheckCircle2, Send, Settings, Terminal } from 'lucide-react';
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

function renderInlineTokens(line: string): React.ReactNode[] {
  const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={idx} className="font-semibold text-white">
          {part.slice(2, -2).replace(/`/g, '')}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <span
          key={idx}
          className="px-1.5 py-0.5 rounded bg-slate-800/90 text-sky-300 font-mono text-[11px]"
        >
          {part.slice(1, -1)}
        </span>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

function renderFormattedMessage(text: string): React.ReactNode {
  const lines = text.split('\n');
  return (
    <div className="space-y-1.5">
      {lines.map((raw, i) => {
        const line = raw.trimEnd();
        if (!line.trim()) return <div key={i} className="h-1" />;
        if (/^#{1,3}\s+/.test(line)) {
          const heading = line.replace(/^#{1,3}\s+/, '');
          return (
            <div key={i} className="font-semibold text-white text-[13px] pt-0.5">
              {renderInlineTokens(heading)}
            </div>
          );
        }
        if (/^[-*]\s+/.test(line)) {
          const item = line.replace(/^[-*]\s+/, '');
          return (
            <div key={i} className="flex items-start gap-2">
              <span className="text-sky-400 mt-0.5">•</span>
              <span className="flex-1">{renderInlineTokens(item)}</span>
            </div>
          );
        }
        return <div key={i}>{renderInlineTokens(line)}</div>;
      })}
    </div>
  );
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
    <div className="flex flex-col h-full min-h-[520px] justify-between space-y-3">
      {/* Compact Header Bar with Optional Model Settings Popover */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-0.5">
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`w-2 h-2 rounded-full ${
                llmKeyConfigured ? 'bg-emerald-400' : 'bg-sky-400'
              }`}
            />
            <span className="font-medium text-slate-200">
              {llmKeyConfigured ? llmModel.split('/').pop() : 'Built-in Physics Assistant'}
            </span>
          </div>
          <button
            onClick={onToggleLlmSettings}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 px-2 py-1 rounded-md hover:bg-slate-900"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>{showLlmSettings ? 'Close' : 'LLM Key'}</span>
          </button>
        </div>

        {showLlmSettings && (
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 space-y-2.5 text-xs">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[11px] text-slate-400">Provider</label>
                <select
                  value={llmProvider}
                  onChange={(e) => onChangeProvider(e.target.value)}
                  className="w-full mt-1 bg-slate-950 border border-slate-700/80 rounded-lg px-2 py-1.5 text-xs text-white"
                >
                  <option value="openrouter">OpenRouter</option>
                  <option value="openai">OpenAI</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-[11px] text-slate-400">Model</label>
                <input
                  type="text"
                  list="openrouter-models"
                  value={llmModel}
                  onChange={(e) => onChangeModel(e.target.value)}
                  className="w-full mt-1 bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
                <datalist id="openrouter-models">
                  <option value="anthropic/claude-3.7-sonnet" />
                  <option value="google/gemini-2.5-pro-preview" />
                  <option value="google/gemini-2.5-flash" />
                  <option value="openai/gpt-4o" />
                </datalist>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="password"
                value={openRouterKey}
                onChange={(e) => onChangeApiKey(e.target.value)}
                placeholder="Paste API key (optional)..."
                className="flex-1 bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500"
              />
              <button
                type="button"
                onClick={onSaveLlmConfig}
                className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs shrink-0"
              >
                Save
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Chat Stream */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {messages.map((m, idx) => (
          <div key={idx} className="space-y-2">
            {m.toolCalls && m.toolCalls.length > 0 && (
              <details className="bg-slate-900/50 border border-slate-800 rounded-xl px-3 py-2 text-xs">
                <summary className="cursor-pointer text-[11px] font-medium text-sky-400 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Ran {m.toolCalls.length} facility inspection tools</span>
                </summary>
                <div className="space-y-1.5 mt-2 pt-2 border-t border-slate-800/80">
                  {m.toolCalls.map((tc) => (
                    <div key={tc.step} className="text-[11px] space-y-0.5">
                      <div className="flex justify-between text-slate-300 font-medium">
                        <span>{tc.tool_name}</span>
                        <span className="text-slate-500 tabular-nums">{tc.duration_ms}ms</span>
                      </div>
                      <div className="text-emerald-400 flex items-start gap-1">
                        <CheckCircle2 className="w-3 h-3 shrink-0 mt-0.5" />
                        <span>{tc.result_summary}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}

            <div
              className={`p-3.5 rounded-xl text-xs leading-relaxed ${
                m.role === 'user'
                  ? 'bg-sky-500/15 border border-sky-500/30 text-sky-100 ml-8 whitespace-pre-line'
                  : 'bg-slate-900/60 border border-slate-800 text-slate-200'
              }`}
            >
              {m.role === 'assistant' ? renderFormattedMessage(m.text) : m.text}
            </div>

            {m.suggestions && m.suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {m.suggestions.map((sug, sIdx) => (
                  <button
                    key={sIdx}
                    onClick={() => onSendQuery(sug)}
                    className="text-left text-[11px] px-2.5 py-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-colors"
                  >
                    {sug}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {copilotLoading && (
          <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-800 text-xs text-slate-400 animate-pulse">
            Checking facility telemetry...
          </div>
        )}
      </div>

      {/* Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSendQuery();
        }}
        className="flex items-center gap-2 pt-2 border-t border-slate-800/80"
      >
        <input
          type="text"
          value={copilotInput}
          onChange={(e) => onChangeInput(e.target.value)}
          placeholder="Ask about hot spots, savings, or maintenance..."
          className="flex-1 bg-slate-900/80 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
        />
        <button
          type="submit"
          disabled={copilotLoading}
          className="p-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
