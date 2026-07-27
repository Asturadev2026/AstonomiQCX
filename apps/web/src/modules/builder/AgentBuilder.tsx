import { useEffect, useState } from 'react';
import {
  useAddFlowNode,
  useAgentFlow,
  useDeleteFlowNode,
  useMoveFlowNode,
  usePublishFlow,
  useSetNextFlowNode,
  useUpdateFlowNode,
} from '../../lib/api/hooks';
import { ErrorState, LoadingState } from '../../components/states';
import { useToast } from '../../components/Toast';
import type { FlowNode, FlowNodeConfig, FlowNodeType } from '../../lib/api/types';

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
 *
 * Drag-and-drop uses the native HTML5 DnD API (no library) — palette blocks
 * carry a 'x-new-node-type' payload, canvas blocks carry 'x-move-node-id';
 * every gap between blocks (rendered on the existing .flow-link connector)
 * is a drop target that knows the node id it comes after (null = the very
 * front), so both "insert a new block here" and "move this block here" are
 * the same afterNodeId-based backend call.
 */

const PALETTE: { type: FlowNodeType; icon: string; badge: string; label: string }[] = [
  { type: 'trigger', icon: '⚡', badge: 'b-blue', label: 'Trigger' },
  { type: 'detect_intent', icon: '🧠', badge: 'b-indigo', label: 'Detect intent' },
  { type: 'fetch_data', icon: '🔗', badge: 'b-sky', label: 'Fetch data' },
  { type: 'ask_question', icon: '❓', badge: 'b-amber', label: 'Ask question' },
  { type: 'send_reply', icon: '💬', badge: 'b-green', label: 'Send reply' },
  { type: 'human_handoff', icon: '🙋', badge: 'b-pink', label: 'Human handoff' },
];

const NEW_NODE_TYPE = 'application/x-new-node-type';
const MOVE_NODE_ID = 'application/x-move-node-id';

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
  const addNode = useAddFlowNode();
  const deleteNode = useDeleteFlowNode();
  const moveNode = useMoveFlowNode();
  const setNextNode = useSetNextFlowNode();
  const toast = useToast();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [intentsText, setIntentsText] = useState('');
  const [question, setQuestion] = useState('');
  const [optionsText, setOptionsText] = useState('');
  const [condition, setCondition] = useState('');
  const [dragOverGap, setDragOverGap] = useState<string | null>(null);

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

  function deleteSelected() {
    if (!data || !selected) return;
    if (nodes.length <= 1) {
      toast('Cannot delete the only remaining block');
      return;
    }
    deleteNode.mutate(
      { flowId: data.id, nodeId: selected.id },
      {
        onSuccess: () => {
          setSelectedId(null);
          toast('Block deleted ✓');
        },
        onError: (err) => toast(err instanceof Error ? err.message : 'Could not delete block'),
      },
    );
  }

  function handleDrop(e: React.DragEvent, afterNodeId: string | null) {
    e.preventDefault();
    setDragOverGap(null);
    if (!data) return;

    const newType = e.dataTransfer.getData(NEW_NODE_TYPE) as FlowNodeType | '';
    const movedId = e.dataTransfer.getData(MOVE_NODE_ID);

    if (newType) {
      const oldIds = new Set(nodes.map((n) => n.id));
      addNode.mutate(
        { flowId: data.id, type: newType, afterNodeId },
        {
          onSuccess: (updated) => {
            toast('Block added ✓');
            const added = updated.definition.nodes.find((n) => !oldIds.has(n.id));
            if (added) setSelectedId(added.id);
          },
          onError: (err) => toast(err instanceof Error ? err.message : 'Could not add block'),
        },
      );
    } else if (movedId) {
      if (movedId === afterNodeId) return; // dropped right after itself — no-op
      moveNode.mutate(
        { flowId: data.id, nodeId: movedId, afterNodeId },
        {
          onSuccess: () => toast('Block moved ✓'),
          onError: (err) => toast(err instanceof Error ? err.message : 'Could not move block'),
        },
      );
    }
  }

  function renderGap(afterNodeId: string | null, key: string) {
    const isOver = dragOverGap === key;
    return (
      <div
        key={key}
        className="flow-link"
        onDragOver={(e) => {
          e.preventDefault();
          if (dragOverGap !== key) setDragOverGap(key);
        }}
        onDragLeave={() => setDragOverGap((cur) => (cur === key ? null : cur))}
        onDrop={(e) => handleDrop(e, afterNodeId)}
        style={isOver ? { background: 'var(--blue)', width: 4, borderRadius: 2 } : undefined}
      />
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
            No-code flow · drag a block from the left, or click one to configure it on the right ·{' '}
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
          {PALETTE.map((p) => (
            <div
              key={p.type}
              className="pnode"
              draggable
              onDragStart={(e) => e.dataTransfer.setData(NEW_NODE_TYPE, p.type)}
            >
              <span className={`pn-ic ${p.badge}`}>{p.icon}</span> {p.label}
            </div>
          ))}
        </div>
        <div className="canvas" id="canvas">
          {renderGap(null, 'gap-start')}
          {nodes.map((n) => (
            <div key={n.id}>
              <div
                className={`flow-node ${selected?.id === n.id ? 'sel' : ''}`}
                draggable
                onDragStart={(e) => e.dataTransfer.setData(MOVE_NODE_ID, n.id)}
                onClick={() => setSelectedId(n.id)}
              >
                <div className="fn-h">
                  <span className={`fn-ic ${n.badge}`}>{n.icon}</span>
                  {n.title}
                </div>
                <div className="fn-d">{n.subtitle}</div>
              </div>
              {renderGap(n.id, `gap-${n.id}`)}
            </div>
          ))}
        </div>
        <div className="card cfg" id="nodeCfg">
          {selected && (
            <>
              <div className="cop-h" style={{ marginBottom: 14, display: 'flex', alignItems: 'center' }}>
                <span className={`fn-ic ${selected.badge}`}>{selected.icon}</span> {selected.title}
                <button
                  className="btn btn-o"
                  style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: 12 }}
                  onClick={deleteSelected}
                  disabled={deleteNode.isPending || nodes.length <= 1}
                  title={nodes.length <= 1 ? 'Cannot delete the only remaining block' : 'Delete block'}
                >
                  Delete
                </button>
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
                <select
                  value={selected.nextId ?? ''}
                  onChange={(e) => {
                    if (!data) return;
                    const nextId = e.target.value || null;
                    setNextNode.mutate(
                      { flowId: data.id, nodeId: selected.id, nextId },
                      {
                        onSuccess: () => toast('Branch updated ✓'),
                        onError: (err) => toast(err instanceof Error ? err.message : 'Could not update branch'),
                      },
                    );
                  }}
                >
                  <option value="">{nextNode ? `— next in order (${nextNode.title}) —` : '— end of flow —'}</option>
                  {nodes
                    .filter((n) => n.id !== selected.id)
                    .map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.title}
                      </option>
                    ))}
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
