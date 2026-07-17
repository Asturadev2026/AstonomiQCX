import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/**
 * Global toast — same markup/classes as the prototype (`.toast.show`).
 * The prototype only ever shows success confirmations, so its CSS hardcodes a
 * green checkmark (`.toast svg{color:var(--green)}`). Real API calls can also
 * fail (e.g. a 401 before login is wired up), so this adds an error variant —
 * inline style override, not a prototype.css change, per the porting rule
 * that the CSS stays verbatim.
 */

type ToastKind = 'success' | 'error';

const ToastCtx = createContext<(msg: string, kind?: ToastKind) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState('');
  const [kind, setKind] = useState<ToastKind>('success');
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const toast = useCallback((m: string, k: ToastKind = 'success') => {
    setMsg(m);
    setKind(k);
    setShow(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setShow(false), 2600);
  }, []);

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className={show ? 'toast show' : 'toast'}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{ color: kind === 'error' ? 'var(--red)' : 'var(--green)' }}
        >
          {kind === 'error' ? <path d="M18 6L6 18M6 6l12 12" /> : <path d="M20 6L9 17l-5-5" />}
        </svg>
        <span>{msg}</span>
      </div>
    </ToastCtx.Provider>
  );
}
