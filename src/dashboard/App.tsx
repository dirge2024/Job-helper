import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { APPLICATION_RECORD_STATUSES, normalizeApplicationRecord } from '../shared/applicationRecords.ts';
import { MessageService } from '../shared/message.ts';
import type { ApplicationRecord, ApplicationRecordStatus } from '../shared/types.ts';

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
  { id: 'applications', label: '投递管理', eyebrow: 'APPLICATIONS', title: '投递管理', description: '全部投递占据完整一行，进度和下一步行动一目了然。' },
  { id: 'schedule', label: '面试日程', eyebrow: 'INTERVIEW SCHEDULE', title: '面试日程', description: '一面、二面、三面和 HR 面将在更新进度后自动加入日程。' },
  { id: 'reviews', label: '面经复盘', eyebrow: 'INTERVIEW NOTES', title: '面经复盘', description: '保留左侧编辑、右侧面经列表的工作方式，并在记录完成后支持 AI 整理。' },
  { id: 'profiles', label: '简历资料库', eyebrow: 'RESUME LIBRARY', title: '简历资料库', description: '个人信息、教育经历、项目经历和简历配置会继续保留在资料库中。', legacyTab: 'resume' },
  { id: 'insights', label: '数据洞察', eyebrow: 'DATA INSIGHTS', title: '数据洞察', description: '投递统计将从投递列表拆出，避免占用管理页面的主要空间。' },
  { id: 'backup', label: '备份与同步', eyebrow: 'BACKUP & SYNC', title: '备份与同步', description: '导入、完整导出和 WebDAV 同步能力保留在这里。', legacyTab: 'data-sync' },
];

const STATUS_CLASS_NAMES: Record<ApplicationRecordStatus, string> = {
  已投递: 'applied',
  测评: 'assessment',
  笔试: 'assessment',
  一面: 'first-interview',
  二面: 'second-interview',
  三面: 'third-interview',
  HR面: 'hr-interview',
  Offer: 'offer',
  中止: 'stopped',
};

function getInitialPage(): DashboardPage {
  const value = new URLSearchParams(window.location.search).get('page');
  return NAVIGATION_ITEMS.some(item => item.id === value) ? value as DashboardPage : 'applications';
}

function getRuntimeUrl(path: string): string {
  return chrome.runtime.getURL(path);
}

function openLegacySettings(tab: string): void {
  window.location.href = getRuntimeUrl(`src/options/index.html?tab=${tab}`);
}

function createRecordId(): string {
  return crypto.randomUUID?.() ?? `record_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function sortByRecent(records: ApplicationRecord[]): ApplicationRecord[] {
  return [...records].map(normalizeApplicationRecord).sort((left, right) => {
    const leftDate = left.updatedAt || left.appliedAt || left.createdAt;
    const rightDate = right.updatedAt || right.appliedAt || right.createdAt;
    return rightDate.localeCompare(leftDate);
  });
}

function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(objectUrl);
}

function ProgressSelect({ value, disabled, onChange }: { value: ApplicationRecordStatus; disabled?: boolean; onChange: (value: ApplicationRecordStatus) => void }) {
  return (
    <span className={`progress-select progress-${STATUS_CLASS_NAMES[value]}`}>
      <select aria-label="选择进度" value={value} disabled={disabled} onChange={event => onChange(event.target.value as ApplicationRecordStatus)}>
        {APPLICATION_RECORD_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
      </select>
    </span>
  );
}

function ApplicationForm({ record, onClose, onSaved }: { record?: ApplicationRecord; onClose: () => void; onSaved: (record: ApplicationRecord) => void }) {
  const [form, setForm] = useState<ApplicationRecord>(() => record ?? {
    id: createRecordId(), companyName: '', jobTitle: '', sourceSite: '', sourceUrl: '', status: '已投递', notes: '',
    appliedAt: new Date().toISOString().slice(0, 10), location: '', createdAt: '', updatedAt: '',
  });
  const [errorText, setErrorText] = useState('');
  const [saving, setSaving] = useState(false);

  const setField = <K extends keyof ApplicationRecord>(field: K, value: ApplicationRecord[K]) => setForm(current => ({ ...current, [field]: value }));
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.companyName.trim() || !form.jobTitle.trim()) {
      setErrorText('请填写公司名称和岗位。');
      return;
    }
    setSaving(true);
    setErrorText('');
    const now = new Date().toISOString();
    const payload: ApplicationRecord = {
      ...form, companyName: form.companyName.trim(), jobTitle: form.jobTitle.trim(), location: form.location.trim(), notes: form.notes.trim(),
      sourceSite: form.sourceSite.trim(), sourceUrl: form.sourceUrl.trim(), createdAt: form.createdAt || now, updatedAt: now,
    };
    const response = await MessageService.sendMessage({ type: record ? 'UPDATE_APPLICATION_RECORD' : 'CREATE_APPLICATION_RECORD', payload });
    if (!response.success) {
      setErrorText(response.error || '保存投递记录失败');
      setSaving(false);
      return;
    }
    onSaved(payload);
  };

  return (
    <div className="dashboard-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="dashboard-modal" aria-modal="true" aria-labelledby="record-form-title" role="dialog" onMouseDown={event => event.stopPropagation()}>
        <header><div><p>{record ? 'EDIT APPLICATION' : 'NEW APPLICATION'}</p><h2 id="record-form-title">{record ? '编辑投递' : '新增投递'}</h2></div><button type="button" className="modal-close" aria-label="关闭" onClick={onClose}>×</button></header>
        <form onSubmit={event => void submit(event)}>
          <div className="record-form-grid">
            <label>公司名称<input value={form.companyName} onChange={event => setField('companyName', event.target.value)} placeholder="例如：联想集团" /></label>
            <label>岗位<input value={form.jobTitle} onChange={event => setField('jobTitle', event.target.value)} placeholder="例如：Java 开发工程师" /></label>
            <label>城市<input value={form.location} onChange={event => setField('location', event.target.value)} placeholder="例如：北京" /></label>
            <label>投递日期<input type="date" value={form.appliedAt} onChange={event => setField('appliedAt', event.target.value)} /></label>
            <label>进度<ProgressSelect value={form.status} onChange={status => setField('status', status)} /></label>
            <label>来源站点<input value={form.sourceSite} onChange={event => setField('sourceSite', event.target.value)} placeholder="可选" /></label>
          </div>
          <label>职位链接<input value={form.sourceUrl} onChange={event => setField('sourceUrl', event.target.value)} placeholder="可选" /></label>
          <label>最近安排 / 下一步行动<textarea value={form.notes} onChange={event => setField('notes', event.target.value)} placeholder="例如：关注招聘动态与邮件通知" /></label>
          {errorText && <p className="dashboard-form-error" role="alert">{errorText}</p>}
          <footer><button type="button" className="dashboard-secondary-action" onClick={onClose}>取消</button><button type="submit" className="dashboard-primary-action" disabled={saving}>{saving ? '保存中...' : '保存投递'}</button></footer>
        </form>
      </section>
    </div>
  );
}

function ApplicationsPage() {
  const [records, setRecords] = useState<ApplicationRecord[]>([]);
  const [keyword, setKeyword] = useState('');
  const deferredKeyword = useDeferredValue(keyword.trim().toLowerCase());
  const [statusFilter, setStatusFilter] = useState<ApplicationRecordStatus | 'all'>('all');
  const [sortDirection, setSortDirection] = useState<'recent' | 'oldest'>('recent');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [errorText, setErrorText] = useState('');
  const [editingRecord, setEditingRecord] = useState<ApplicationRecord | null | undefined>(undefined);
  const importInputRef = useRef<HTMLInputElement>(null);

  const loadRecords = async () => {
    setLoading(true);
    const response = await MessageService.sendMessage<ApplicationRecord[]>({ type: 'GET_APPLICATION_RECORDS' });
    if (!response.success) setErrorText(response.error || '读取投递记录失败');
    else setRecords(sortByRecent(response.data ?? []));
    setLoading(false);
  };

  useEffect(() => { void loadRecords(); }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const visibleRecords = records.filter(record => {
    const matchesStatus = statusFilter === 'all' || record.status === statusFilter;
    const haystack = `${record.companyName} ${record.jobTitle} ${record.location} ${record.notes}`.toLowerCase();
    return matchesStatus && (!deferredKeyword || haystack.includes(deferredKeyword));
  }).sort((left, right) => {
    const leftDate = left.appliedAt || left.updatedAt;
    const rightDate = right.appliedAt || right.updatedAt;
    return sortDirection === 'recent' ? rightDate.localeCompare(leftDate) : leftDate.localeCompare(rightDate);
  });

  const updateProgress = async (record: ApplicationRecord, status: ApplicationRecordStatus) => {
    const payload = { ...record, status, updatedAt: new Date().toISOString() };
    const response = await MessageService.sendMessage({ type: 'UPDATE_APPLICATION_RECORD', payload });
    if (!response.success) { setErrorText(response.error || '更新进度失败'); return; }
    setRecords(current => current.map(item => item.id === record.id ? payload : item));
    setNotice(`${record.companyName || '投递记录'}已更新为${status}`);
  };

  const removeRecord = async (record: ApplicationRecord) => {
    if (!window.confirm(`确定删除 ${record.companyName || '该条'} 投递记录吗？`)) return;
    const response = await MessageService.sendMessage({ type: 'DELETE_APPLICATION_RECORD', payload: { id: record.id } });
    if (!response.success) { setErrorText(response.error || '删除投递记录失败'); return; }
    setRecords(current => current.filter(item => item.id !== record.id));
    setNotice('投递记录已删除');
  };

  const exportRecords = async () => {
    const response = await MessageService.sendMessage<{ csv: string; filename: string }>({ type: 'EXPORT_APPLICATION_RECORDS_CSV' });
    if (!response.success || !response.data) { setErrorText(response.error || '导出 CSV 失败'); return; }
    downloadCsv(response.data.csv, response.data.filename);
    setNotice('投递记录已导出');
  };

  const importRecords = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const response = await MessageService.sendMessage<{ imported: number; warnings: string[] }>({ type: 'IMPORT_APPLICATION_RECORDS_CSV', payload: { csv: await file.text() } });
    event.target.value = '';
    if (!response.success) { setErrorText(response.error || '导入 CSV 失败'); return; }
    await loadRecords();
    setNotice(response.data?.warnings.length ? `已导入 ${response.data.imported} 条，存在 ${response.data.warnings.length} 条提示` : `已导入 ${response.data?.imported ?? 0} 条投递记录`);
  };

  const savedRecord = (record: ApplicationRecord) => {
    setRecords(current => sortByRecent(current.some(item => item.id === record.id) ? current.map(item => item.id === record.id ? record : item) : [...current, record]));
    setEditingRecord(undefined);
    setNotice('投递记录已保存');
  };

  return (
    <>
      <div className="application-toolbar">
        <label className="dashboard-search"><span aria-hidden="true">⌕</span><input value={keyword} onChange={event => setKeyword(event.target.value)} placeholder="搜索公司、岗位、城市或下一步行动" /></label>
        <select className="dashboard-filter" aria-label="筛选进度" value={statusFilter} onChange={event => setStatusFilter(event.target.value as ApplicationRecordStatus | 'all')}><option value="all">全部进度</option>{APPLICATION_RECORD_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}</select>
        <select className="dashboard-filter" aria-label="排序方式" value={sortDirection} onChange={event => setSortDirection(event.target.value as 'recent' | 'oldest')}><option value="recent">最近更新优先</option><option value="oldest">投递日期最早</option></select>
        <input ref={importInputRef} className="visually-hidden" type="file" accept=".csv,text/csv" onChange={event => void importRecords(event)} />
        <button type="button" className="dashboard-tertiary-action" onClick={() => importInputRef.current?.click()}>导入</button>
        <button type="button" className="dashboard-tertiary-action" onClick={() => void exportRecords()}>导出备份</button>
        <button type="button" className="dashboard-primary-action" onClick={() => setEditingRecord(null)}>+ 新增投递</button>
      </div>
      {notice && <p className="dashboard-notice" role="status">{notice}</p>}
      {errorText && <p className="dashboard-form-error" role="alert">{errorText}</p>}
      <div className="application-table-card">
        {loading ? <p className="application-empty">正在读取投递记录...</p> : visibleRecords.length === 0 ? <p className="application-empty">暂无符合条件的投递记录。点击“新增投递”开始记录。</p> : (
          <table className="application-table"><thead><tr><th>公司与岗位</th><th>城市</th><th>投递日期</th><th>进度</th><th>最近安排 / 下一步行动</th><th>操作</th></tr></thead><tbody>
            {visibleRecords.map(record => <tr key={record.id}>
              <td><strong>{record.companyName || '未填写公司'}</strong><span>{record.jobTitle || '未填写岗位'}</span></td>
              <td>{record.location || '未填写'}</td><td>{record.appliedAt || '未填写'}</td>
              <td><ProgressSelect value={record.status} onChange={status => void updateProgress(record, status)} /></td>
              <td className="application-next-action">{record.notes || '暂未设置下一步行动'}</td>
              <td><div className="application-row-actions"><button type="button" onClick={() => setEditingRecord(record)}>编辑</button><button type="button" className="danger" onClick={() => void removeRecord(record)}>删除</button></div></td>
            </tr>)}
          </tbody></table>
        )}
      </div>
      {editingRecord !== undefined && <ApplicationForm record={editingRecord ?? undefined} onClose={() => setEditingRecord(undefined)} onSaved={savedRecord} />}
    </>
  );
}

function PlaceholderPage({ item }: { item: NavigationItem }) {
  return <div className="dashboard-stage-card"><div className="dashboard-stage-icon" aria-hidden="true">NEXT</div><h2>{item.title}将在下一阶段接入</h2><p>{item.description}。已有功能没有删除，迁移前仍可通过下方入口使用。</p>{item.legacyTab ? <button type="button" className="dashboard-primary-action" onClick={() => openLegacySettings(item.legacyTab!)}>打开现有功能</button> : <span className="dashboard-status-note">投递管理已可正常使用；其余页面会按需求依次实现。</span>}</div>;
}

function App() {
  const [activePage, setActivePage] = useState<DashboardPage>(getInitialPage);
  const activeItem = NAVIGATION_ITEMS.find(item => item.id === activePage)!;
  return <main className="dashboard-shell"><header className="dashboard-header"><a className="dashboard-brand" href={getRuntimeUrl('src/dashboard/index.html')}><span className="dashboard-brand-mark" aria-hidden="true">J</span><span>求职助手</span></a><nav className="dashboard-nav" aria-label="主导航">{NAVIGATION_ITEMS.map(item => <button key={item.id} type="button" className={item.id === activePage ? 'dashboard-nav-item is-active' : 'dashboard-nav-item'} onClick={() => setActivePage(item.id)}>{item.label}</button>)}</nav></header><section className="dashboard-workspace" aria-labelledby="page-title"><div className="dashboard-page-heading"><div><p>{activeItem.eyebrow}</p><h1 id="page-title">{activeItem.title}</h1><span>{activeItem.description}</span></div></div>{activePage === 'applications' ? <ApplicationsPage /> : <PlaceholderPage item={activeItem} />}</section></main>;
}

export default App;
