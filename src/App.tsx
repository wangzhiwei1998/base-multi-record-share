import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { bitable, FieldType } from '@lark-base-open/js-sdk';
import type { ITable } from '@lark-base-open/js-sdk';
import { useI18n, resolveLang, setLang } from './i18n';
import type { BaseContext, RecordItem, ShareResultItem, SharingStatusInfo, Theme, ToastItem } from './types';
import {
  Checkbox,
  ConfirmModal,
  EmptyState,
  IconClose,
  IconCopy,
  IconSearch,
  IconShare,
  IconTable,
  IconView,
  Notice,
  Select,
  MultiSelect,
  ToastViewport,
} from './components';

/** 分页加载记录时每页大小（SDK 单次上限 5000） */
const PAGE_SIZE = 1000;
/** 生成分享链接时的并发数 */
const SHARE_CONCURRENCY = 5;

let toastSeq = 0;

/** 预览模式示例数据：仅在非多维表格环境下用于界面展示 */
const MOCK_RECORDS: RecordItem[] = [
  '官网改版需求评审',
  '双十一大促活动方案',
  'Q4 产品路线图',
  '客户拜访纪要 - 云启科技',
  '新增成员入职清单',
  '数据看板迭代排期',
  '供应商合同续签审批',
  '用户调研报告 V2',
  '市场投放预算表',
  '迭代回顾会议纪要',
  '竞品分析 - 协作赛道',
  '品牌视觉规范更新',
].map((title, i) => ({ recordId: `mock_rec_${i + 1}`, title }));

function mockContext(): BaseContext {
  return {
    tableId: 'tblMock',
    tableName: '项目跟进表',
    viewName: '全部任务',
    viewId: 'vewMock',
  };
}

/** 将单元格取值转为可读的纯文本（以首字段作为记录标题） */
function cellValueToText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map(cellValueToText).filter(Boolean).join('、');
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.text === 'string') return obj.text;
    if (Array.isArray(obj.text)) return cellValueToText(obj.text);
    if (typeof obj.name === 'string') return obj.name;
    // 自动编号等「计算值」结构：{ value: 'A-001', status }
    if (typeof obj.value === 'string' || typeof obj.value === 'number') return String(obj.value);
  }
  return '';
}

/** 日期类字段（时间戳）格式化为本地时间 */
const DATE_LIKE_FIELD_TYPES = new Set<number>([
  FieldType.DateTime,
  FieldType.CreatedTime,
  FieldType.ModifiedTime,
]);

function formatTitle(fieldType: number | undefined, raw: unknown): string {
  if (
    raw !== null &&
    typeof raw === 'number' &&
    fieldType !== undefined &&
    DATE_LIKE_FIELD_TYPES.has(fieldType)
  ) {
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
        date.getDate(),
      ).padStart(2, '0')}`;
    }
  }
  return cellValueToText(raw);
}

/**
 * 从记录中取标题：按顺序拼接所选多个字段的文本（空值跳过，用 - 连接）。
 * 注意：不同环境下 getRecords 返回的 fields 键可能是字段 id 或字段名，两种都尝试；
 * 全部为空时兜底取第一条非空字段。
 */
function extractTitle(fields: Record<string, unknown>, titleFields: FieldInfo[]): string {
  const parts: string[] = [];
  for (const field of titleFields) {
    let raw: unknown = fields[field.id];
    if (raw === undefined) raw = fields[field.name];
    const text = formatTitle(field.type, raw);
    if (text) parts.push(text);
  }
  if (parts.length > 0) return parts.join('-');
  for (const value of Object.values(fields)) {
    const fallback = formatTitle(titleFields[0]?.type, value);
    if (fallback) return fallback;
  }
  return '';
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  }
}

/** 字段摘要（用于标题字段选择器） */
export interface FieldInfo {
  id: string;
  name: string;
  type: number;
  isPrimary: boolean;
}

export default function App() {
  const { t } = useI18n();

  const [theme, setTheme] = useState<Theme>('LIGHT');
  const [previewMode, setPreviewMode] = useState(false);
  const [context, setContext] = useState<BaseContext | null>(null);
  const [sharingStatus, setSharingStatus] = useState<SharingStatusInfo>('unknown');
  const [fieldList, setFieldList] = useState<FieldInfo[]>([]);
  const [titleFieldIds, setTitleFieldIds] = useState<string[]>([]);
  const [rawRecords, setRawRecords] = useState<Array<{ recordId: string; fields: Record<string, unknown> }>>([]);
  const [recordTotal, setRecordTotal] = useState(0);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<ShareResultItem[] | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmSharing, setConfirmSharing] = useState(false);
  const [enablingSharing, setEnablingSharing] = useState(false);

  const tableRef = useRef<ITable | null>(null);
  const loadTokenRef = useRef(0);
  const cancelledRef = useRef(false);
  const recordEventOffsRef = useRef<Array<() => void>>([]);

  /* ---------- Toast ---------- */
  const pushToast = useCallback((type: ToastItem['type'], text: string, duration = 3000) => {
    const id = ++toastSeq;
    setToasts((list) => [...list.slice(-1), { id, type, text }]);
    window.setTimeout(() => {
      setToasts((list) => list.filter((item) => item.id !== id));
    }, duration);
  }, []);

  /* ---------- 数据加载 ---------- */

  const loadRecords = useCallback(async (table: ITable, viewId: string | null) => {
    const token = ++loadTokenRef.current;
    setLoadingRecords(true);
    setLoadError(false);
    setRawRecords([]);
    setRecordTotal(0);
    try {
      // 优先按视图顺序取字段列表，取不到再退回表级字段列表
      let fieldMetaList: FieldInfo[] = [];
      try {
        const view = await table.getActiveView();
        const viewFields = (await view.getFieldMetaList()) as Array<{ id: string; name: string; type: number; isPrimary: boolean }>;
        if (Array.isArray(viewFields) && viewFields.length > 0) fieldMetaList = viewFields;
      } catch {
        fieldMetaList = [];
      }
      if (fieldMetaList.length === 0) {
        const tableFields = await table.getFieldMetaList();
        fieldMetaList = tableFields.map((meta) => ({
          id: meta.id,
          name: meta.name,
          type: meta.type as number,
          isPrimary: meta.isPrimary,
        }));
      }
      const primaryField = fieldMetaList.find((meta) => meta.isPrimary);
      setFieldList(fieldMetaList);
      setTitleFieldIds(primaryField?.id ? [primaryField.id] : []);

      const collected: Array<{ recordId: string; fields: Record<string, unknown> }> = [];
      let pageToken: string | undefined;
      let total = 0;
      do {
        const resp = await table.getRecords({
          pageSize: PAGE_SIZE,
          pageToken,
          viewId: viewId ?? undefined,
        } as Parameters<ITable['getRecords']>[0]);
        if (token !== loadTokenRef.current) return; // 已切换到其他表/视图
        total = resp.total ?? collected.length + resp.records.length;
        if (primaryField && collected.length === 0) {
          // 调试辅助：打印首条记录的字段键，便于排查取值问题
          console.log('[multi-record-share] fields keys sample', Object.keys(resp.records[0]?.fields ?? {}), 'primaryField', primaryField);
        }
        for (const record of resp.records) {
          collected.push({ recordId: record.recordId, fields: (record.fields ?? {}) as Record<string, unknown> });
        }
        setRawRecords([...collected]);
        setRecordTotal(total);
        pageToken = resp.hasMore ? resp.pageToken : undefined;
      } while (pageToken);
    } catch (e) {
      console.error('[multi-record-share] load records failed', e);
      if (token === loadTokenRef.current) setLoadError(true);
    } finally {
      if (token === loadTokenRef.current) setLoadingRecords(false);
    }
  }, []);

  /** 初始化 / 切换数据表或视图 */
  const setupContext = useCallback(async () => {
    const selection = await bitable.base.getSelection();
    const table = await bitable.base.getActiveTable();
    tableRef.current = table;
    // 重新订阅当前表的记录增删事件
    recordEventOffsRef.current.forEach((off) => off());
    recordEventOffsRef.current = [
      table.onRecordAdd(() => void setupContext()),
      table.onRecordDelete(() => void setupContext()),
    ];

    const tableMeta = await table.getMeta();
    let viewName = '';
    if (selection.viewId) {
      try {
        const viewMeta = await table.getViewMetaById(selection.viewId);
        viewName = viewMeta?.name ?? '';
      } catch {
        viewName = '';
      }
    }

    let tableUrl: string | undefined;
    try {
      tableUrl = await bitable.bridge.getBitableUrl({
        tableId: tableMeta.id,
        viewId: selection.viewId ?? undefined,
      } as Parameters<typeof bitable.bridge.getBitableUrl>[0]);
    } catch {
      tableUrl = undefined;
    }

    setContext({
      tableId: tableMeta.id,
      tableName: tableMeta.name,
      viewId: selection.viewId ?? '',
      viewName,
      tableUrl,
    });
    setSelected(new Set());
    setResults(null);
    await loadRecords(table, selection.viewId);

    // 视图分享状态
    try {
      const view = await table.getActiveView();
      const status = (await view.getSharingStatus()) as unknown as string;
      setSharingStatus(status === 'Enabled' ? 'enabled' : 'disabled');
    } catch {
      setSharingStatus('unsupported');
    }
  }, [loadRecords]);

  /* ---------- 初始化 ---------- */
  useEffect(() => {
    let disposed = false;
    /** SDK 桥接调用在非多维表格环境中可能一直挂起，加超时兜底进入预览模式 */
    const withTimeout = <T,>(promise: Promise<T>, ms: number) =>
      Promise.race<T>([
        promise,
        new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error('bridge timeout')), ms)),
      ]);
    const init = async () => {
      try {
        const [language, themeMode] = await Promise.all([
          withTimeout(bitable.bridge.getLanguage(), 3000),
          withTimeout(bitable.bridge.getTheme(), 3000),
        ]);
        if (disposed) return;
        setLang(resolveLang(language));
        setTheme(themeMode);
        bitable.bridge.onThemeChange((event) => {
          setTheme(event.data.theme);
        });
        await setupContext();
      } catch (e) {
        // 不在多维表格环境中运行：进入预览模式
        console.warn('[multi-record-share] not running in Base, fallback to preview mode', e);
        if (disposed) return;
        setPreviewMode(true);
        setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'DARK' : 'LIGHT');
        setContext(mockContext());
        setFieldList([
          { id: 'fldNo', name: '编号', type: 2, isPrimary: false },
          { id: 'fldTitle', name: '任务名称', type: 1, isPrimary: true },
          { id: 'fldOwner', name: '负责人', type: 1001, isPrimary: false },
        ]);
        setTitleFieldIds(['fldNo', 'fldTitle']);
        setRawRecords(
          MOCK_RECORDS.map((r, i) => ({
            recordId: r.recordId,
            fields: { fldNo: 1921 + i, fldTitle: r.title },
          })),
        );
        setRecordTotal(MOCK_RECORDS.length);
        setLoadingRecords(false);
        setSharingStatus('disabled');
      }
    };
    void init();

    return () => {
      disposed = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- 事件监听：切换表 / 视图 ---------- */
  useEffect(() => {
    if (previewMode) return;
    const offSelection = bitable.base.onSelectionChange(() => {
      void setupContext();
    });
    return () => offSelection();
  }, [previewMode, setupContext]);

  /* ---------- 标题字段与记录派生 ---------- */
  const titleFields = useMemo(
    () => fieldList.filter((f) => titleFieldIds.includes(f.id)),
    [fieldList, titleFieldIds],
  );

  const records = useMemo<RecordItem[]>(
    () =>
      rawRecords.map((record) => ({
        recordId: record.recordId,
        title: extractTitle(record.fields, titleFields),
      })),
    [rawRecords, titleFields],
  );

  /* ---------- 搜索过滤 ---------- */
  const filteredRecords = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return records;
    return records.filter((item) => item.title.toLowerCase().includes(kw));
  }, [records, keyword]);

  const allFilteredSelected =
    filteredRecords.length > 0 && filteredRecords.every((item) => selected.has(item.recordId));
  const someFilteredSelected = filteredRecords.some((item) => selected.has(item.recordId));

  const toggleRecord = useCallback((recordId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(recordId)) next.delete(recordId);
      else next.add(recordId);
      return next;
    });
  }, []);

  const toggleSelectAllFiltered = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredRecords.forEach((item) => next.delete(item.recordId));
      } else {
        filteredRecords.forEach((item) => next.add(item.recordId));
      }
      return next;
    });
  }, [allFilteredSelected, filteredRecords]);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  /* ---------- 开启视图分享 ---------- */
  const enableSharing = useCallback(async () => {
    setEnablingSharing(true);
    try {
      const table = tableRef.current;
      if (!table) throw new Error('no table');
      const view = await table.getActiveView();
      const ok = await view.enableSharing();
      if (!ok) throw new Error('enable sharing returned false');
      setSharingStatus('enabled');
      pushToast('success', t('toast.enableSharing.success'));
    } catch (e) {
      console.error('[multi-record-share] enable sharing failed', e);
      pushToast('error', t('toast.enableSharing.fail'), 4000);
    } finally {
      setEnablingSharing(false);
      setConfirmSharing(false);
    }
  }, [pushToast, t]);

  /* ---------- 生成分享链接 ---------- */
  const generateLinks = useCallback(async () => {
    const table = tableRef.current;
    const ids = [...selected];
    if ((!table && !previewMode) || ids.length === 0) return;

    cancelledRef.current = false;
    setGenerating(true);
    setProgress({ done: 0, total: ids.length });
    setResults(null);

    const recordMap = new Map(records.map((item) => [item.recordId, item]));
    const output: ShareResultItem[] = [];
    let cursor = 0;
    let done = 0;

    /** 预览模式下模拟链接生成，便于在多维表格外体验完整流程 */
    const mockGetLink = async (recordId: string) => {
      await new Promise((resolve) => window.setTimeout(resolve, 250));
      return `https://example.feishu.cn/base/mock?table=tblMock&view=vewMock&record=${recordId}`;
    };

    const worker = async () => {
      while (cursor < ids.length) {
        if (cancelledRef.current) return;
        const recordId = ids[cursor++];
        const title = recordMap.get(recordId)?.title || recordId;
        try {
          const link = previewMode
            ? await mockGetLink(recordId)
            : await table!.getRecordShareLink(recordId);
          output.push({ recordId, title, link });
        } catch (e) {
          console.error('[multi-record-share] getRecordShareLink failed', recordId, e);
          output.push({ recordId, title, error: true });
        }
        done += 1;
        setProgress({ done, total: ids.length });
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(SHARE_CONCURRENCY, ids.length) }, () => worker()),
    );

    if (cancelledRef.current) {
      setGenerating(false);
      pushToast('info', t('toast.cancelled'));
      return;
    }

    // 按原始选择顺序排序，保证结果稳定
    const order = new Map(ids.map((id, index) => [id, index]));
    output.sort((a, b) => (order.get(a.recordId) ?? 0) - (order.get(b.recordId) ?? 0));
    setResults(output);
    setGenerating(false);

    const failed = output.filter((item) => item.error).length;
    if (failed > 0) {
      pushToast('warning', t('toast.share.fail', { count: failed }), 4000);
    }
  }, [records, selected, previewMode, pushToast, t]);

  const cancelGenerate = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  /* ---------- 复制 ---------- */

  const buildPlainText = useCallback(
    (items: ShareResultItem[]) => {
      const lines: string[] = [];
      if (context) {
        lines.push(t('msg.header', { table: context.tableName, count: items.length }));
      }
      items.forEach((item, index) => {
        if (item.error) return;
        lines.push(`${index + 1}. ${item.title}`);
        lines.push(item.link ?? '');
      });
      if (context?.tableUrl) {
        lines.push('');
        lines.push(`${t('msg.table')}：${context.tableName}`);
        lines.push(context.tableUrl);
      }
      return lines.join('\n');
    },
    [context, t],
  );

  const buildMarkdown = useCallback(
    (items: ShareResultItem[]) => {
      const lines: string[] = [];
      if (context) {
        lines.push(`**${t('msg.header', { table: context.tableName, count: items.length })}**`);
        lines.push('');
      }
      items.forEach((item) => {
        if (item.error) return;
        lines.push(`- [${item.title}](${item.link})`);
      });
      if (context?.tableUrl) {
        lines.push('');
        lines.push(`${t('msg.table')}：[${context.tableName}](${context.tableUrl})`);
      }
      return lines.join('\n');
    },
    [context, t],
  );

  const buildLinksOnly = useCallback(
    (items: ShareResultItem[]) =>
      items
        .filter((item) => !item.error && item.link)
        .map((item) => item.link)
        .join('\n'),
    [],
  );

  const handleCopy = useCallback(
    async (text: string) => {
      const ok = await copyText(text);
      pushToast(ok ? 'success' : 'error', t(ok ? 'toast.copied' : 'toast.copyFail'));
    },
    [pushToast, t],
  );

  /* ---------- 渲染 ---------- */

  const themeName = theme === 'DARK' ? 'dark' : 'light';
  const failedCount = results?.filter((item) => item.error).length ?? 0;

  return (
    <div className="app" data-theme={themeName}>
      <header className="header">
        <div className="header-title">{t('app.title')}</div>
        {context && (
          <div className="meta-row">
            <span className="meta-tag">
              <IconTable size={14} />
              <span className="meta-text">{context.tableName}</span>
            </span>
            {context.viewName && (
              <span className="meta-tag">
                <IconView size={14} />
                <span className="meta-text">{context.viewName}</span>
              </span>
            )}
          </div>
        )}
        {previewMode && <Notice type="warning" title={t('notice.preview.title')} desc={t('notice.preview.desc')} />}
        {!previewMode && sharingStatus === 'disabled' && (
          <Notice
            type="warning"
            title={t('notice.sharingDisabled.title')}
            desc={t('notice.sharingDisabled.desc')}
            actionText={t('notice.sharingDisabled.action')}
            onAction={() => setConfirmSharing(true)}
          />
        )}
        {!previewMode && sharingStatus === 'enabled' && (
          <Notice type="success" desc={t('notice.sharingEnabled.desc')} />
        )}
      </header>

      {results === null ? (
        <>
          {fieldList.length > 0 && (
            <div className="field-row">
              <span className="field-label">{t('field.title')}</span>
              <MultiSelect
                values={titleFieldIds}
                options={fieldList.map((f) => ({ label: f.name, value: f.id }))}
                onChange={setTitleFieldIds}
                disabled={loadingRecords}
                selectAllText={t('selection.selectAll')}
                clearText={t('selection.clear')}
              />
            </div>
          )}
          <div className="toolbar">
            <div className="search-box">
              <IconSearch size={16} />
              <input
                className="search-input"
                placeholder={t('search.placeholder')}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
              {keyword && (
                <button className="search-clear" onClick={() => setKeyword('')} aria-label="clear">
                  <IconClose size={14} />
                </button>
              )}
            </div>
            <span className="selection-info">{t('selection.selected', { count: selected.size })}</span>
            <button className="btn-text" onClick={toggleSelectAllFiltered} disabled={filteredRecords.length === 0}>
              {t('selection.selectAll')}
            </button>
            <button className="btn-text plain" onClick={clearSelection} disabled={selected.size === 0}>
              {t('selection.clear')}
            </button>
          </div>

          <div className="record-list">
            {!loadingRecords && !loadError && records.length > 0 && (
              <div className="list-head">
                <Checkbox
                  checked={allFilteredSelected}
                  indeterminate={!allFilteredSelected && someFilteredSelected}
                  onChange={toggleSelectAllFiltered}
                  label={t('selection.selectAll')}
                />
                <span>
                  {keyword
                    ? `${filteredRecords.length} / ${t('list.total', { count: recordTotal })}`
                    : t('list.total', { count: recordTotal })}
                </span>
                <span className="spacer" />
              </div>
            )}

            {loadingRecords && (
              <div className="loading-row">
                <div className="spin small" />
                <span>{t('list.loading')}</span>
              </div>
            )}

            {!loadingRecords && loadError && (
              <EmptyState title={t('toast.permission')} desc={t('list.empty.desc')} />
            )}

            {!loadingRecords && !loadError && records.length === 0 && (
              <EmptyState title={t('list.empty.title')} desc={t('list.empty.desc')} />
            )}

            {!loadingRecords && !loadError && records.length > 0 && filteredRecords.length === 0 && (
              <EmptyState title={t('list.noMatch.title')} desc={t('list.noMatch.desc')} />
            )}

            {!loadingRecords &&
              filteredRecords.map((item, index) => (
                <div
                  key={item.recordId}
                  className="record-row"
                  onClick={() => !generating && toggleRecord(item.recordId)}
                >
                  <Checkbox
                    checked={selected.has(item.recordId)}
                    disabled={generating}
                    onChange={() => toggleRecord(item.recordId)}
                    label={item.title}
                  />
                  <span className="record-title">{item.title || t('list.untitled')}</span>
                  <span className="record-index">{index + 1}</span>
                </div>
              ))}

            {!loadingRecords && records.length > 0 && recordTotal > records.length && (
              <div className="list-foot">{t('list.loaded', { loaded: records.length, total: recordTotal })}</div>
            )}
          </div>

          <footer className="footer">
            {generating && (
              <>
                <div className="progress-track">
                  <div
                    className="progress-bar"
                    style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                  />
                </div>
                <div className="footer-row">
                  <span className="selection-info" style={{ flex: 1 }}>
                    {t('action.generating', { done: progress.done, total: progress.total })}
                  </span>
                  <button className="btn btn-secondary" onClick={cancelGenerate}>
                    {t('action.cancel')}
                  </button>
                </div>
              </>
            )}
            {!generating && (
              <button
                className="btn btn-primary"
                disabled={selected.size === 0}
                onClick={() => void generateLinks()}
              >
                <IconShare size={16} />
                {selected.size > 0
                  ? t('action.share.count', { count: selected.size })
                  : t('action.share')}
              </button>
            )}
          </footer>
        </>
      ) : (
        <div className="result">
          <div className="result-header">
            <h2>{t('result.title')}</h2>
            <p>{t('result.desc')}</p>
            {failedCount > 0 && (
              <div className="result-failed">
                <Notice type="error" desc={t('result.failed', { count: failedCount })} />
              </div>
            )}
          </div>
          <div className="result-body">
            <div className="result-list">
              {results.map((item) => (
                <div key={item.recordId} className={`result-item${item.error ? ' error' : ''}`}>
                  <div className="result-item-main">
                    <div className="result-item-title">{item.title || t('list.untitled')}</div>
                    <div className="result-item-link">{item.error ? t('result.failed', { count: 1 }) : item.link}</div>
                  </div>
                  {!item.error && (
                    <button className="btn-text" onClick={() => void handleCopy(item.link ?? '')}>
                      <IconCopy size={14} />
                      <span style={{ marginLeft: 4 }}>{t('result.item.copy')}</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
          <footer className="footer">
            <div className="footer-row">
              <button className="btn btn-secondary" onClick={() => setResults(null)}>
                {t('result.back')}
              </button>
              <button className="btn btn-primary" onClick={() => void handleCopy(buildPlainText(results))}>
                {t('result.copyAll')}
              </button>
            </div>
            <div className="footer-row" style={{ justifyContent: 'center' }}>
              <button className="btn-text" onClick={() => void handleCopy(buildMarkdown(results))}>
                {t('result.copyMarkdown')}
              </button>
              <button className="btn-text" onClick={() => void handleCopy(buildLinksOnly(results))}>
                {t('result.copyLinks')}
              </button>
            </div>
          </footer>
        </div>
      )}

      <ToastViewport items={toasts} />

      {confirmSharing && (
        <ConfirmModal
          title={t('confirm.enableSharing.title')}
          desc={t('confirm.enableSharing.desc')}
          okText={t('confirm.ok')}
          cancelText={t('confirm.cancel')}
          okDisabled={enablingSharing}
          onOk={() => void enableSharing()}
          onCancel={() => !enablingSharing && setConfirmSharing(false)}
        />
      )}
    </div>
  );
}
