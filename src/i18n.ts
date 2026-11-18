import { useCallback, useEffect, useState } from 'react';
import zhCN from './locales/zh-CN.json';
import enUS from './locales/en-US.json';
import jaJP from './locales/ja-JP.json';

export type Lang = 'zh' | 'en' | 'ja';

const messages: Record<Lang, Record<string, string>> = {
  zh: zhCN,
  en: enUS,
  ja: jaJP,
};

let currentLang: Lang = 'zh';
const listeners = new Set<() => void>();

/** 根据 Base 返回的语言标识解析插件语言 */
export function resolveLang(input?: string | null): Lang {
  if (!input) return 'zh';
  if (input.startsWith('ja')) return 'ja';
  if (input.startsWith('zh')) return 'zh';
  return 'en';
}

export function setLang(lang: Lang) {
  if (currentLang === lang) return;
  currentLang = lang;
  listeners.forEach((listener) => listener());
}

export function getLang(): Lang {
  return currentLang;
}

export function t(key: string, vars?: Record<string, string | number>): string {
  const template = messages[currentLang][key] ?? messages.zh[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars[name] !== undefined ? String(vars[name]) : `{${name}}`,
  );
}

/** 订阅语言变化的 hook */
export function useI18n() {
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const listener = () => forceUpdate((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  const translate = useCallback((key: string, vars?: Record<string, string | number>) => t(key, vars), []);
  return { t: translate, lang: currentLang };
}
