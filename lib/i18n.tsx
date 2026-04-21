'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type Locale = 'ko' | 'en';

const translations: Record<Locale, Record<string, string>> = {
  ko: {
    'nav.overview': '대시보드',
    'nav.users': '사용자',
    'nav.trends': '트렌드',
    'nav.credits': '크레딧',
    'nav.engagement': '참여도',
    'header.overview': '대시보드',
    'header.overview.sub': 'Kiro 전체 사용자 분석 현황',
    'header.users': '사용자',
    'header.users.sub': '사용자 활동 및 리더보드',
    'header.trends': '트렌드',
    'header.trends.sub': '일별 활동 추이 및 패턴',
    'header.credits': '크레딧',
    'header.credits.sub': '크레딧 사용 분석 및 내역',
    'header.engagement': '참여도',
    'header.engagement.sub': '사용자 참여도 세그먼트 및 전환',
    'metric.totalUsers': '전체 사용자',
    'metric.messages': '메시지',
    'metric.conversations': '대화',
    'metric.creditsUsed': '사용 크레딧',
    'metric.overage': '초과 크레딧',
    'metric.unique': '명',
    'metric.total': '건',
    'metric.sessions': '세션',
    'metric.credits': '크레딧',
    'metric.overage.label': '초과',
    'metric.activeAccounts': '활성 계정',
    'metric.chatMessages': '총 메시지 (프롬프트+응답+툴콜)',
    'metric.chatSessions': '채팅 세션',
    'metric.baseCreditUsage': '기본 크레딧 사용량',
    'metric.overageCreditUsage': '초과 크레딧 사용량',
    'metric.vsPrevious': '전기 대비',
    'metric.last30days': '최근 30일',
    'section.usage': '사용 현황',
    'section.trends': '일별 트렌드 및 분포',
    'section.users': '사용자 및 참여도',
    'insights.title': '실시간 인사이트',
    'insights.activeUsers': '활성 사용자',
    'insights.powerUsers': '파워 유저',
    'insights.overageTrending': '초과 크레딧 상승 추세',
    'insights.creditNormal': '크레딧 사용 정상',
    'chart.dailyActivity': '일별 활동',
    'chart.clientDist': '클라이언트 분포',
    'chart.topUsers': '메시지 기준 상위 사용자',
    'chart.funnel': '참여도 퍼널',
    'common.refresh': '새로고침',
    'common.last30days': '최근 30일',
    'common.signIn': 'Cognito로 로그인',
    'common.signInTitle': 'Kiro 분석 대시보드',
    'common.signInSub': '대시보드에 접근하려면 로그인하세요',
  },
  en: {
    'nav.overview': 'Overview',
    'nav.users': 'Users',
    'nav.trends': 'Trends',
    'nav.credits': 'Credits',
    'nav.engagement': 'Engagement',
    'header.overview': 'Overview',
    'header.overview.sub': 'Kiro usage analytics across all users',
    'header.users': 'Users',
    'header.users.sub': 'User activity and leaderboard',
    'header.trends': 'Trends',
    'header.trends.sub': 'Daily activity trends and patterns',
    'header.credits': 'Credits',
    'header.credits.sub': 'Credit usage analysis and breakdown',
    'header.engagement': 'Engagement',
    'header.engagement.sub': 'User engagement segmentation and conversion',
    'metric.totalUsers': 'Total Users',
    'metric.messages': 'Messages',
    'metric.conversations': 'Conversations',
    'metric.creditsUsed': 'Credits Used',
    'metric.overage': 'Overage',
    'metric.unique': 'unique',
    'metric.total': 'total',
    'metric.sessions': 'sessions',
    'metric.credits': 'credits',
    'metric.overage.label': 'overage',
    'metric.activeAccounts': 'Active accounts',
    'metric.chatMessages': 'Total messages (prompts+responses+tools)',
    'metric.chatSessions': 'Chat sessions',
    'metric.baseCreditUsage': 'Base credit usage',
    'metric.overageCreditUsage': 'Overage credit usage',
    'metric.vsPrevious': 'vs Previous Period',
    'metric.last30days': 'Last 30 days',
    'section.usage': 'Usage & Activity',
    'section.trends': 'Daily Trends & Distribution',
    'section.users': 'Users & Engagement',
    'insights.title': 'Active Insights',
    'insights.activeUsers': 'active users',
    'insights.powerUsers': 'power users',
    'insights.overageTrending': 'Overage credits trending up',
    'insights.creditNormal': 'Credit usage normal',
    'chart.dailyActivity': 'Daily Activity',
    'chart.clientDist': 'Client Distribution',
    'chart.topUsers': 'Top Users by Messages',
    'chart.funnel': 'Engagement Funnel',
    'common.refresh': 'Refresh',
    'common.last30days': 'Last 30 days',
    'common.signIn': 'Sign in with Cognito',
    'common.signInTitle': 'Kiro Analytics',
    'common.signInSub': 'Sign in to access the dashboard',
  },
};

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'ko',
  setLocale: () => {},
  t: (key) => key,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>('ko');
  const t = useCallback(
    (key: string) => translations[locale][key] || key,
    [locale],
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
