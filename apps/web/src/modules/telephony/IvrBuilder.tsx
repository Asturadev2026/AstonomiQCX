import { useEffect, useState } from 'react';
import {
  useAddIvrNode,
  useDeleteIvrNode,
  useIvrFlow,
  useMoveIvrNode,
  usePublishIvrFlow,
  useSetIvrBranch,
  useSetIvrNext,
  useUpdateIvrNode,
} from '../../lib/api/hooks';
import { ErrorState, LoadingState } from '../../components/states';
import { useToast } from '../../components/Toast';
import type { IvrNode, IvrNodeConfig, IvrNodeType } from '../../lib/api/types';

/**
 * Call flow (IVR) builder — same shape as Agent Builder (AgentBuilder.tsx):
 * real persistence to the AgentFlow table (kind: 'ivr'), same drag-and-drop
 * canvas, same afterNodeId-based add/move API. Node types are phone-menu
 * primitives instead of chat ones; `menu` additionally exposes a DTMF
 * digit->node branch editor, since a phone menu can fan out to more than one
 * next step (a chat flow's single "on success, go to" isn't enough for that).
 *
 * This flow is real and saved regardless of whether Exotel is connected —
 * the moment a virtual number is mapped to this flow's name and Exotel
 * credentials are added, ExotelWebhookService drives calls through exactly
 * this definition.
 */

const PALETTE: { type: IvrNodeType; icon: string; badge: string; label: string }[] = [
  { type: 'play', icon: '🔊', badge: 'b-blue', label: 'Play message' },
  { type: 'menu', icon: '🔢', badge: 'b-amber', label: 'Menu (DTMF)' },
  { type: 'forward', icon: '📞', badge: 'b-green', label: 'Forward call' },
  { type: 'voicemail', icon: '📼', badge: 'b-indigo', label: 'Voicemail' },
  { type: 'hangup', icon: '📴', badge: 'b-pink', label: 'Hang up' },
];

const NEW_NODE_TYPE = 'application/x-new-ivr-node-type';
const MOVE_NODE_ID = 'application/x-move-ivr-node-id';

function explanation(node: IvrNode): string {
  switch (node.type) {
    case 'play':
      return 'Speaks this message to the caller, then continues to the next step.';
    case 'menu':
      return 'Speaks the message, then waits for a single keypress and routes to whichever node that digit is wired to below.';
    case 'forward':
      return 'Routes the call to a queue, agent, or phone number — ends the IVR flow for this call.';
    case 'voicemail':
      return 'Speaks the greeting, then records the caller\'s message — ends the IVR flow for this call.';
    case 'hangup':
      return 'Ends the call.';
  }
}

export function IvrBuilder() {
  const { data, isLoading, error, refetch } = useIvrFlow();
  const updateNode = useUpdateIvrNode();
  const publishFlow = usePublishIvrFlow();
  const addNode = useAddIvrNode();
  const deleteNode = useDeleteIvrNode();
  const moveNode = useMoveIvrNode();
  const setNextNode = useSetIvrNext();
  const setBranch = useSetIvrBranch();
  const toast = useToast();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [forwardTo, setForwardTo] = useState('');
  const [dragOverGap, setDragOverGap] = useState<string | null>(null);
  const [newDigit, setNewDigit] = useState('');
  const [newDigitTarget, setNewDigitTarget] = useState('');

  const nodes = data?.definition.nodes ?? [];
  const selected = nodes.find((n) => n.id === selectedId) ?? nodes[0] ?? null;

  useEffect(() => {
    if (!selected) return;
    setMessage(selected.config.message ?? '');
    setForwardTo(selected.config.forwardTo ?? '');
    setNewDigit('');
    setNewDigitTarget('');
  }, [selected?.id]);

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} retry={() => void refetch()} />;

  function saveBlock() {
    if (!data || !selected) return;
    const config: IvrNodeConfig = { ...selected.config };
    if (selected.type === 'play' || selected.type === 'menu' || selected.type === 'voicemail') config.message = message;
    if (selected.type === 'forward') config.forwardTo = forwardTo;

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
        onSuccess: () => toast('Call flow published ✓'),
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

  function addBranch() {
    if (!data || !selected) return;
    const digit = newDigit.trim();
    if (!digit || !/^[0-9*#]$/.test(digit)) {
      toast('Digit must be 0-9, * or #');
      return;
    }
    if (!newDigitTarget) {
      toast('Choose a node for this digit to go to');
      return;
    }
    setBranch.mutate(
      { flowId: data.id, nodeId: selected.id, digit, nextId: newDigitTarget },
      {
        onSuccess: () => {
          toast('Branch added ✓');
          setNewDigit('');
          setNewDigitTarget('');
        },
        onError: (err) => toast(err instanceof Error ? err.message : 'Could not add branch'),
      },
    );
  }

  function removeBranch(digit: string) {
    if (!data || !selected) return;
    setBranch.mutate(
      { flowId: data.id, nodeId: selected.id, digit, nextId: null },
      {
        onError: (err) => toast(err instanceof Error ? err.message : 'Could not remove branch'),
      },
    );
  }

  function handleDrop(e: React.DragEvent, afterNodeId: string | null) {
    e.preventDefault();
    setDragOverGap(null);
    if (!data) return;

    const newType = e.dataTransfer.getData(NEW_NODE_TYPE) as IvrNodeType | '';
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
      if (movedId === afterNodeId) return;
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
  const branches = selected?.type === 'menu' ? selected.config.branches ?? {} : {};

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 15 }}>{data.name ?? 'Call flow'}</h3>
          <div className="cap" style={{ margin: '2px 0 0' }}>
            No-code phone menu builder · drag a block from the left, or click one to configure it on the right ·{' '}
            {data.status === 'published' ? 'published' : 'draft'}
          </div>
        </div>
        <button className="btn btn-g" style={{ marginLeft: 'auto' }} onClick={publish} disabled={publishFlow.isPending}>
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
        <div className="canvas" id="ivr-canvas">
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
        <div className="card cfg" id="ivrNodeCfg">
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
                <textarea style={{ height: 80 }} readOnly value={explanation(selected)} />
              </div>

              {(selected.type === 'play' || selected.type === 'menu' || selected.type === 'voicemail') && (
                <div className="cfg-row">
                  <label>{selected.type === 'voicemail' ? 'Greeting' : 'Message'}</label>
                  <textarea style={{ height: 72 }} value={message} onChange={(e) => setMessage(e.target.value)} />
                </div>
              )}

              {selected.type === 'forward' && (
                <div className="cfg-row">
                  <label>Forward to (queue, agent, or number)</label>
                  <input value={forwardTo} onChange={(e) => setForwardTo(e.target.value)} placeholder="e.g. Orders &amp; delivery, or +91..." />
                </div>
              )}

              {selected.type === 'menu' && (
                <div className="cfg-row">
                  <label>Digit branches</label>
                  {Object.entries(branches).length === 0 && (
                    <div className="cap" style={{ marginBottom: 6 }}>
                      No digits wired yet — callers pressing a key will fall through to "fallback" below.
                    </div>
                  )}
                  {Object.entries(branches).map(([digit, targetId]) => {
                    const target = nodes.find((n) => n.id === targetId);
                    return (
                      <div key={digit} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span className="mono" style={{ minWidth: 24, textAlign: 'center', fontWeight: 700 }}>
                          {digit}
                        </span>
                        <span style={{ flex: 1, fontSize: 12.5 }}>→ {target?.title ?? '(deleted node)'}</span>
                        <button className="btn btn-o" style={{ padding: '2px 8px', fontSize: 11.5 }} onClick={() => removeBranch(digit)}>
                          Remove
                        </button>
                      </div>
                    );
                  })}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <input
                      value={newDigit}
                      onChange={(e) => setNewDigit(e.target.value.slice(0, 1))}
                      placeholder="Digit"
                      style={{ width: 56, textAlign: 'center' }}
                      maxLength={1}
                    />
                    <select value={newDigitTarget} onChange={(e) => setNewDigitTarget(e.target.value)} style={{ flex: 1 }}>
                      <option value="">— choose target node —</option>
                      {nodes
                        .filter((n) => n.id !== selected.id)
                        .map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.title}
                          </option>
                        ))}
                    </select>
                    <button className="btn btn-g" style={{ padding: '4px 10px', fontSize: 12 }} onClick={addBranch} disabled={setBranch.isPending}>
                      Add
                    </button>
                  </div>
                </div>
              )}

              {selected.type !== 'hangup' && selected.type !== 'forward' && selected.type !== 'voicemail' && (
                <div className="cfg-row">
                  <label>{selected.type === 'menu' ? 'Fallback (timeout / invalid digit), go to' : 'On success, go to'}</label>
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
              )}

              <button className="btn btn-g" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} onClick={saveBlock} disabled={updateNode.isPending}>
                Save block
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
