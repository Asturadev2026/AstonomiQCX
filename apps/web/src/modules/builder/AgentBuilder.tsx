import { useEffect, useState } from 'react';
import { useAgentFlow, usePublishFlow, useUpdateFlowNode } from '../../lib/api/hooks';
import { ErrorState, LoadingState } from '../../components/states';
import { useToast } from '../../components/Toast';
import type { FlowNode, FlowNodeConfig } from '../../lib/api/types';

/**
 * Agent Builder — exact port of the prototype's #builder section
 * (markup/classes verbatim from docs/AstronomiQ-CX_1.html, styles from
 * styles/prototype.css). Scoped to "UI port + save/load + real execution
 * engine": the flow shown here is the exact same AgentFlow the real
 * FlowExecutionService walks node-by-node for every channel (Chatbot,
 * WhatsApp, Voice) — editing and publishing a block here changes Astra's
 * actual replies, not just a mock.
 *
 * The "Test" button stays a toast (Guide scope note): real end-to-end
 * testing of this flow already happens live via the Chatbot/WhatsApp/Voice
 * screens, which all run through this same published flow.
 */

function parseList(text: string): string[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function explanation(node: FlowNode): string {
  switch (node.type) {
    case 'trigger':
      return 'This agent starts whenever a customer sends a message on WhatsApp, chat or voice.';
    case 'detect_intent':
      return "Astra classifies the customer's message into one of the intents below, using whichever LLM provider is configured.";
    case 'fetch_data':
      return "Pulls the customer's most recent order (status, amount, delivery date) when the contact is known.";
    case 'ask_question':
      return 'Sent to the customer as this turn\'s reply when the intent is ambiguous — their next message is classified fresh.';
    case 'send_reply':
      return 'Astra replies grounded in the Knowledge Base and any fetched order context, then raises a real ticket automatically if it needs to escalate.';
    case 'human_handoff':
      return 'When Astra escalates, a real ticket is raised so a human agent can take over with full context.';
  }
}

export function AgentBuilder() {
  const { data, isLoading, error, refetch } = useAgentFlow();
  const updateNode = useUpdateFlowNode();
  const publishFlow = usePublishFlow();
  const toast = useToast();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [intentsText, setIntentsText] = useState('');
  const [question, setQuestion] = useState('');
  const [optionsText, setOptionsText] = useState('');
  const [condition, setCondition] = useState('');

  const nodes = data?.definition.nodes ?? [];
  const selected = nodes.find((n) => n.id === selectedId) ?? nodes[1] ?? nodes[0] ?? null;

  useEffect(() => {
    if (!selected) return;
    setIntentsText((selected.config.intents ?? []).join(', '));
    setQuestion(selected.config.question ?? '');
    setOptionsText((selected.config.options ?? []).join(', '));
    setCondition(selected.config.condition ?? '');
  }, [selected?.id]);

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} retry={() => void refetch()} />;

  function saveBlock() {
    if (!data || !selected) return;
    const config: FlowNodeConfig = {};
    if (selected.type === 'detect_intent') config.intents = parseList(intentsText);
    if (selected.type === 'ask_question') {
      config.question = question;
      config.options = parseList(optionsText);
    }
    if (selected.type === 'human_handoff') config.condition = condition;

    updateNode.mutate(
      { flowId: data.id, nodeId: selected.id, config },
      {
        onSuccess: () => toast('Block saved ✓'),
        onError: (err) => toast(err instanceof Error ? err.message : 'Could not save block'),
      },
    );
  }

  function publish() {
    if (!data) return;
    publishFlow.mutate(
      { flowId: data.id },
      {
        onSuccess: () => toast('Agent published live ✓'),
        onError: (err) => toast(err instanceof Error ? err.message : 'Could not publish'),
      },
    );
  }

  const selectedIndex = selected ? nodes.findIndex((n) => n.id === selected.id) : -1;
  const nextNode = selectedIndex >= 0 ? nodes[selectedIndex + 1] : undefined;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 15 }}>{data.name}</h3>
          <div className="cap" style={{ margin: '2px 0 0' }}>
            No-code flow · click a node to configure it on the right ·{' '}
            {data.status === 'published' ? 'live' : 'draft'}
          </div>
        </div>
        <button className="btn btn-o" style={{ marginLeft: 'auto', marginRight: 8 }} onClick={() => toast('Test conversation started ✓')}>
          ▶ Test
        </button>
        <button className="btn btn-g" onClick={publish} disabled={publishFlow.isPending}>
          Publish
        </button>
      </div>
      <div className="builder">
        <div className="palette card">
          <div className="cap" style={{ marginBottom: 12 }}>
            Drag a block →
          </div>
          <div className="pnode">
            <span className="pn-ic b-blue">⚡</span> Trigger
          </div>
          <div className="pnode">
            <span className="pn-ic b-indigo">🧠</span> Detect intent
          </div>
          <div className="pnode">
            <span className="pn-ic b-sky">🔗</span> Fetch data
          </div>
          <div className="pnode">
            <span className="pn-ic b-amber">❓</span> Ask question
          </div>
          <div className="pnode">
            <span className="pn-ic b-green">💬</span> Send reply
          </div>
          <div className="pnode">
            <span className="pn-ic b-pink">🙋</span> Human handoff
          </div>
        </div>
        <div className="canvas" id="canvas">
          {nodes.map((n, i) => (
            <div key={n.id}>
              <div className={`flow-node ${selected?.id === n.id ? 'sel' : ''}`} onClick={() => setSelectedId(n.id)}>
                <div className="fn-h">
                  <span className={`fn-ic ${n.badge}`}>{n.icon}</span>
                  {n.title}
                </div>
                <div className="fn-d">{n.subtitle}</div>
              </div>
              {i < nodes.length - 1 && <div className="flow-link" />}
            </div>
          ))}
        </div>
        <div className="card cfg" id="nodeCfg">
          {selected && (
            <>
              <div className="cop-h" style={{ marginBottom: 14 }}>
                <span className={`fn-ic ${selected.badge}`}>{selected.icon}</span> {selected.title}
              </div>
              <div className="cfg-row">
                <label>Block type</label>
                <input value={selected.subtitle} readOnly />
              </div>
              <div className="cfg-row">
                <label>What it does</label>
                <textarea style={{ height: 96 }} readOnly value={explanation(selected)} />
              </div>

              {selected.type === 'detect_intent' && (
                <div className="cfg-row">
                  <label>Intents (comma separated)</label>
                  <input value={intentsText} onChange={(e) => setIntentsText(e.target.value)} />
                </div>
              )}

              {selected.type === 'ask_question' && (
                <>
                  <div className="cfg-row">
                    <label>Clarifying question</label>
                    <input value={question} onChange={(e) => setQuestion(e.target.value)} />
                  </div>
                  <div className="cfg-row">
                    <label>Quick-reply options (comma separated)</label>
                    <input value={optionsText} onChange={(e) => setOptionsText(e.target.value)} />
                  </div>
                </>
              )}

              {selected.type === 'human_handoff' && (
                <div className="cfg-row">
                  <label>Escalate when</label>
                  <input value={condition} onChange={(e) => setCondition(e.target.value)} />
                </div>
              )}

              <div className="cfg-row">
                <label>On success, go to</label>
                <select disabled value={nextNode ? nextNode.title : ''}>
                  <option>{nextNode ? nextNode.title : '— end of flow —'}</option>
                </select>
              </div>

              <button className="btn btn-g" style={{ width: '100%', justifyContent: 'center' }} onClick={saveBlock} disabled={updateNode.isPending}>
                Save block
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
