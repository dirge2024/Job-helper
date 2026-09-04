import { useState } from 'react';

type DashboardPage = 'applications' | 'schedule' | 'reviews' | 'profiles' | 'insights' | 'backup';

type NavigationItem = {
  id: DashboardPage;
  label: string;
  eyebrow: string;
  title: string;
  description: string;
  legacyTab?: string;
};

const NAVIGATION_ITEMS: NavigationItem[] = [
  { id: 'applications', label: '投递管理', eyebrow: 'APPLICATIONS', title: '投递管理', description: '集中查看全部投递，后续将在这里完成进度更新、筛选和导入导出。', legacyTab: 'application-records' },
  { id: 'schedule', label: '面试日程', eyebrow: 'INTERVIEW SCHEDULE', title: '面试日程', description: '一面、二面、三面和 HR 面将在更新进度后自动加入日程，不提供独立手动创建。' },
  { id: 'reviews', label: '面经复盘', eyebrow: 'INTERVIEW NOTES', title: '面经复盘', description: '保留左侧编辑、右侧面经列表的工作方式，并在记录完成后支持 AI 整理。' },
  { id: 'profiles', label: '简历资料库', eyebrow: 'RESUME LIBRARY', title: '简历资料库', description: '个人信息、教育经历、项目经历和简历配置会继续保留在资料库中。', legacyTab: 'resume' },
  { id: 'insights', label: '数据洞察', eyebrow: 'DATA INSIGHTS', title: '数据洞察', description: '投递统计将从投递列表拆出，避免占用管理页面的主要空间。' },
  { id: 'backup', label: '备份与同步', eyebrow: 'BACKUP & SYNC', title: '备份与同步', description: '导入、导出和 WebDAV 同步能力保留在这里；AI 配置也会作为可选设置保留。', legacyTab: 'data-sync' },
];

function getInitialPage(): DashboardPage {
  const value = new URLSearchParams(window.location.search).get('page');
  return NAVIGATION_ITEMS.some(item => item.id === value) ? value as DashboardPage : 'applications';
}

function openLegacySettings(tab: string): void {
  window.location.href = chrome.runtime.getURL(`src/options/index.html?tab=${tab}`);
}

function App() {
  const [activePage, setActivePage] = useState<DashboardPage>(getInitialPage);
  const activeItem = NAVIGATION_ITEMS.find(item => item.id === activePage)!;

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <a className="dashboard-brand" href={chrome.runtime.getURL('src/dashboard/index.html')}>
          <span className="dashboard-brand-mark" aria-hidden="true">J</span>
          <span>求职助手</span>
        </a>
        <nav className="dashboard-nav" aria-label="主导航">
          {NAVIGATION_ITEMS.map(item => (
            <button key={item.id} type="button" className={item.id === activePage ? 'dashboard-nav-item is-active' : 'dashboard-nav-item'} onClick={() => setActivePage(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      <section className="dashboard-workspace" aria-labelledby="page-title">
        <div className="dashboard-page-heading">
          <div>
            <p>{activeItem.eyebrow}</p>
            <h1 id="page-title">{activeItem.title}</h1>
            <span>{activeItem.description}</span>
          </div>
          {activeItem.legacyTab && <button type="button" className="dashboard-secondary-action" onClick={() => openLegacySettings(activeItem.legacyTab!)}>打开现有功能</button>}
        </div>

        <div className="dashboard-stage-card">
          <div className="dashboard-stage-icon" aria-hidden="true">{activePage === 'applications' ? '01' : '00'}</div>
          <h2>{activeItem.title}正在迁移到新工作台</h2>
          <p>这是新版横向导航的第一阶段。现有数据和功能没有删除；下一阶段会先完成完整宽度的投递列表，再依次接入日程、面经、资料库、洞察和备份页面。</p>
          {activeItem.legacyTab ? (
            <button type="button" className="dashboard-primary-action" onClick={() => openLegacySettings(activeItem.legacyTab!)}>前往现有{activeItem.label}</button>
          ) : <span className="dashboard-status-note">该页面将在后续阶段启用，不影响已有投递数据。</span>}
        </div>
      </section>
    </main>
  );
}

export default App;
