import type { ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { ToastItem, ToastType } from './types';

/* ---------- 基础图标（24 视口、2px 线宽，遵循设计规范） ---------- */

interface IconProps {
  size?: number;
  className?: string;
}

function baseSvg(props: IconProps, children: ReactElement) {
  return (
    <svg
      width={props.size ?? 16}
      height={props.size ?? 16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function IconSearch(props: IconProps) {
  return baseSvg(props, (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ));
}

export function IconClose(props: IconProps) {
  return baseSvg(props, <path d="M6 6l12 12M18 6L6 18" />);
}

export function IconInfo(props: IconProps) {
  return baseSvg(props, (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </>
  ));
}

export function IconSuccess(props: IconProps) {
  return baseSvg(props, (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </>
  ));
}

export function IconWarning(props: IconProps) {
  return baseSvg(props, (
    <>
      <path d="M12 3 2.5 20h19L12 3Z" />
      <path d="M12 10v4" />
      <path d="M12 17h.01" />
    </>
  ));
}

export function IconError(props: IconProps) {
  return baseSvg(props, (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </>
  ));
}

export function IconTable(props: IconProps) {
  return baseSvg(props, (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M9 10v10" />
    </>
  ));
}

export function IconView(props: IconProps) {
  return baseSvg(props, (
    <>
      <path d="M4 6h16M4 12h10M4 18h7" />
    </>
  ));
}

export function IconCopy(props: IconProps) {
  return baseSvg(props, (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </>
  ));
}

export function IconShare(props: IconProps) {
  return baseSvg(props, (
    <>
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="17" cy="6" r="2.5" />
      <circle cx="17" cy="18" r="2.5" />
      <path d="m8.2 10.8 6.6-3.6M8.2 13.2l6.6 3.6" />
    </>
  ));
}

export function IconChevronDown(props: IconProps) {
  return baseSvg(props, <path d="m6 9 6 6 6-6" />);
}

/* ---------- 下拉选择器 ---------- */

export function Select(props: {
  value: string;
  options: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const current = props.options.find((opt) => opt.value === props.value);

  return (
    <div className="select" ref={ref}>
      <button
        type="button"
        className="select-trigger"
        disabled={props.disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="select-trigger-text">{current?.label ?? ''}</span>
        <IconChevronDown size={16} />
      </button>
      {open && (
        <div className="select-menu" role="listbox">
          {props.options.map((opt) => (
            <div
              key={opt.value}
              role="option"
              aria-selected={opt.value === props.value}
              className={`select-option${opt.value === props.value ? ' selected' : ''}`}
              onClick={() => {
                props.onChange(opt.value);
                setOpen(false);
              }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- 多选下拉选择器 ---------- */

export function MultiSelect(props: {
  values: string[];
  options: Array<{ label: string; value: string }>;
  onChange: (values: string[]) => void;
  disabled?: boolean;
  selectAllText: string;
  clearText: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (value: string) => {
    props.onChange(
      props.values.includes(value)
        ? props.values.filter((v) => v !== value)
        : [...props.values, value],
    );
  };

  const labels = props.options
    .filter((opt) => props.values.includes(opt.value))
    .map((opt) => opt.label);

  return (
    <div className="select" ref={ref}>
      <button
        type="button"
        className="select-trigger"
        disabled={props.disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="select-trigger-text">{labels.join('、')}</span>
        <IconChevronDown size={16} />
      </button>
      {open && (
        <div className="select-menu" role="listbox" aria-multiselectable>
          <div className="select-menu-tools">
            <button type="button" className="btn-text" onClick={() => props.onChange(props.options.map((o) => o.value))}>
              {props.selectAllText}
            </button>
            <button type="button" className="btn-text plain" onClick={() => props.onChange([])}>
              {props.clearText}
            </button>
          </div>
          {props.options.map((opt) => (
            <div
              key={opt.value}
              role="option"
              aria-selected={props.values.includes(opt.value)}
              className="select-option with-checkbox"
              onClick={() => toggle(opt.value)}
            >
              <Checkbox checked={props.values.includes(opt.value)} onChange={() => toggle(opt.value)} label={opt.label} />
              <span className="select-option-text">{opt.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const toastIcon: Record<ToastType, (props: IconProps) => ReactElement> = {
  info: IconInfo,
  success: IconSuccess,
  warning: IconWarning,
  error: IconError,
};

/* ---------- Toast ---------- */

export function ToastViewport({ items }: { items: ToastItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="toast-viewport">
      {items.map((item) => {
        const Icon = toastIcon[item.type];
        return (
          <div key={item.id} className={`toast ${item.type}`} role="status">
            <Icon size={16} />
            <span>{item.text}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- 常驻提示 Notice ---------- */

export function Notice(props: {
  type: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  desc?: string;
  actionText?: string;
  onAction?: () => void;
}) {
  const Icon = toastIcon[props.type];
  return (
    <div className={`notice ${props.type}`} role="note">
      <Icon size={16} />
      <div className="notice-body">
        {props.title && <div className="notice-title">{props.title}</div>}
        {props.desc && <div className="notice-desc">{props.desc}</div>}
      </div>
      {props.actionText && (
        <button className="notice-action" onClick={props.onAction}>
          {props.actionText}
        </button>
      )}
    </div>
  );
}

/* ---------- 确认弹窗 ---------- */

export function ConfirmModal(props: {
  title: string;
  desc: string;
  okText: string;
  cancelText: string;
  okDisabled?: boolean;
  onOk: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-mask" onClick={props.onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{props.title}</h3>
        <p>{props.desc}</p>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={props.onCancel}>
            {props.cancelText}
          </button>
          <button className="btn btn-primary" style={{ flex: 'none' }} disabled={props.okDisabled} onClick={props.onOk}>
            {props.okText}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- 复选框 ---------- */

export function Checkbox(props: {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  label?: string;
  onChange?: () => void;
}) {
  const cls = props.indeterminate && !props.checked ? 'indeterminate' : props.checked ? 'checked' : '';
  return (
    <button
      type="button"
      className={`checkbox ${cls}`}
      disabled={props.disabled}
      aria-checked={props.checked}
      aria-label={props.label}
      onClick={(e) => {
        e.stopPropagation();
        props.onChange?.();
      }}
    />
  );
}

/* ---------- 空状态 ---------- */

export function EmptyState(props: { title: string; desc: string }) {
  return (
    <div className="empty-state">
      <svg className="empty-illustration" viewBox="0 0 120 120" fill="none" aria-hidden>
        <rect x="18" y="24" width="84" height="72" rx="6" stroke="currentColor" strokeWidth="2.5" />
        <path d="M18 44h84" stroke="currentColor" strokeWidth="2.5" />
        <path d="M34 62h52M34 76h36" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="88" cy="84" r="16" fill="var(--bg-container)" stroke="currentColor" strokeWidth="2.5" />
        <path d="m82 84 4 4 8-8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="empty-title">{props.title}</div>
      <div className="empty-desc">{props.desc}</div>
    </div>
  );
}
