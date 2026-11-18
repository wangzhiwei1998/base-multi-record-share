/** 记录项：recordId + 展示标题（首字段文本） */
export interface RecordItem {
  recordId: string;
  title: string;
}

/** 视图分享状态 */
export type SharingStatusInfo = 'unknown' | 'enabled' | 'disabled' | 'unsupported';

/** 生成链接的结果项 */
export interface ShareResultItem {
  recordId: string;
  title: string;
  link?: string;
  error?: boolean;
}

/** 当前数据表 / 视图上下文 */
export interface BaseContext {
  tableId: string;
  tableName: string;
  viewId: string;
  viewName: string;
  tableUrl?: string;
}

export type Theme = 'LIGHT' | 'DARK';

export type ToastType = 'info' | 'success' | 'error' | 'warning';

export interface ToastItem {
  id: number;
  type: ToastType;
  text: string;
}
