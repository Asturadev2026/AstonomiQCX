import type { ReactNode } from 'react';

/**
 * A tiny, safe markdown subset for Knowledge Base article bodies (and
 * anywhere else that wants to render them) — bold (**text**), italic
 * (*text* or _text_), "- " bullet lists, "1. " numbered lists. Builds
 * React elements directly
 * instead of dangerouslySetInnerHTML, so there's no HTML-injection surface
 * regardless of what an author (or, eventually, a customer-influenced
 * source) puts in the body.
 */

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    if (match[1] !== undefined) parts.push(<strong key={`${keyPrefix}-${i++}`}>{match[1]}</strong>);
    else parts.push(<em key={`${keyPrefix}-${i++}`}>{match[2] ?? match[3]}</em>);
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

const BULLET_RE = /^[-*]\s+/;
const NUMBERED_RE = /^\d+\.\s+/;

export function renderMarkdownLite(body: string): ReactNode {
  const lines = body.split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line: string = lines[i] ?? '';

    if (BULLET_RE.test(line)) {
      const items: string[] = [];
      let next: string | undefined;
      while (i < lines.length && BULLET_RE.test((next = lines[i]) ?? '')) {
        items.push((next ?? '').replace(BULLET_RE, ''));
        i++;
      }
      blocks.push(
        <ul key={`ul-${key}`} style={{ margin: '4px 0 10px', paddingLeft: 20 }}>
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item, `ul-${key}-${idx}`)}</li>
          ))}
        </ul>,
      );
      key++;
      continue;
    }

    if (NUMBERED_RE.test(line)) {
      const items: string[] = [];
      let next: string | undefined;
      while (i < lines.length && NUMBERED_RE.test((next = lines[i]) ?? '')) {
        items.push((next ?? '').replace(NUMBERED_RE, ''));
        i++;
      }
      blocks.push(
        <ol key={`ol-${key}`} style={{ margin: '4px 0 10px', paddingLeft: 20 }}>
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item, `ol-${key}-${idx}`)}</li>
          ))}
        </ol>,
      );
      key++;
      continue;
    }

    if (line.trim() === '') {
      blocks.push(<div key={`sp-${key++}`} style={{ height: 8 }} />);
      i++;
      continue;
    }

    blocks.push(
      <p key={`p-${key}`} style={{ margin: '0 0 6px' }}>
        {renderInline(line, `p-${key}`)}
      </p>,
    );
    key++;
    i++;
  }

  return blocks;
}

/** Plain-text approximation for previews (list rows, etc.) — strips markers rather than rendering them. */
export function stripMarkdownLite(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/^[-*]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\n+/g, ' ');
}

export type MarkdownFormatAction = 'bold' | 'italic' | 'ul' | 'ol';

/**
 * Applies a formatting action to a textarea's current selection (or current
 * line, for list actions) and returns the new full text plus where the
 * selection should land afterward — the caller re-focuses the textarea and
 * restores that selection so typing continues naturally.
 */
export function applyMarkdownFormat(
  body: string,
  selectionStart: number,
  selectionEnd: number,
  action: MarkdownFormatAction,
): { text: string; selectionStart: number; selectionEnd: number } {
  if (action === 'bold' || action === 'italic') {
    const marker = action === 'bold' ? '**' : '*';
    const selected = body.slice(selectionStart, selectionEnd);
    const inner = selected || (action === 'bold' ? 'bold text' : 'italic text');
    const text = body.slice(0, selectionStart) + marker + inner + marker + body.slice(selectionEnd);
    return { text, selectionStart: selectionStart + marker.length, selectionEnd: selectionStart + marker.length + inner.length };
  }

  // List actions apply per-line, over every line the selection touches (or just the current line).
  const lineStart = body.lastIndexOf('\n', selectionStart - 1) + 1;
  const nextBreak = body.indexOf('\n', selectionEnd);
  const lineEnd = nextBreak === -1 ? body.length : nextBreak;
  const block = body.slice(lineStart, lineEnd);
  const lines = block.split('\n');
  const prefixed = lines
    .map((line, idx) =>
      action === 'ul' ? `- ${line.replace(BULLET_RE, '')}` : `${idx + 1}. ${line.replace(NUMBERED_RE, '')}`,
    )
    .join('\n');
  const text = body.slice(0, lineStart) + prefixed + body.slice(lineEnd);
  return { text, selectionStart: lineStart, selectionEnd: lineStart + prefixed.length };
}
