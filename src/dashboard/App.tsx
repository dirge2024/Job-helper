import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { APPLICATION_RECORD_STATUSES, normalizeApplicationRecord, parseLegacyApplicationRecordsJson } from '../shared/applicationRecords.ts';
import { MessageService } from '../shared/message.ts';
import type { ActiveResumeContext, ApplicationRecord, ApplicationRecordStatus, InterviewReview, InterviewSchedule, InterviewStage, SyncMetadata, WebDAVConfig } from '../shared/types.ts';

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

const INTERVIEW_STAGES: InterviewStage[] = ['一面', '二面', '三面', 'HR面'];
const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

function isInterviewStage(status: ApplicationRecordStatus): status is InterviewStage {
  return INTERVIEW_STAGES.includes(status as InterviewStage);
}

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

function localDateTimeValue(value?: string): string {
  if (value) return value.slice(0, 16);
  const nextHour = new Date();
  nextHour.setMinutes(0, 0, 0);
  nextHour.setHours(nextHour.getHours() + 1);
  const offset = nextHour.getTimezoneOffset();
  return new Date(nextHour.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function formatScheduleDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
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

function InterviewScheduleModal({ record, stage, schedule, onClose, onSave, onCancelSchedule }: {
  record: ApplicationRecord;
  stage: InterviewStage;
  schedule?: InterviewSchedule;
  onClose: () => void;
  onSave: (record: ApplicationRecord) => Promise<boolean>;
  onCancelSchedule?: () => void;
}) {
  const [scheduledAt, setScheduledAt] = useState(() => localDateTimeValue(schedule?.scheduledAt));
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState('');
  const save = async (includeSchedule: boolean) => {
    setSaving(true);
    setErrorText('');
    const now = new Date().toISOString();
    const interviews = record.interviews ?? [];
    const reviews = record.interviewReviews ?? [];
    const nextInterviews = includeSchedule ? (
      schedule
        ? interviews.map(item => item.id === schedule.id ? { ...item, scheduledAt, format: 'online' as const, updatedAt: now } : item)
        : [...interviews, { id: createRecordId(), stage, scheduledAt, format: 'online' as const, createdAt: now, updatedAt: now }]
    ) : interviews;
    const nextReviews: InterviewReview[] = reviews.some(review => review.stage === stage)
      ? reviews
      : [...reviews, { id: createRecordId(), stage, content: '', status: 'pending', createdAt: now, updatedAt: now }];
    const updated = { ...record, status: stage, interviews: nextInterviews, interviewReviews: nextReviews, updatedAt: now };
    if (await onSave(updated)) onClose();
    else setErrorText('保存日程失败，请稍后重试。');
    setSaving(false);
  };

  return <div className="dashboard-modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="dashboard-modal interview-schedule-modal" aria-modal="true" aria-labelledby="schedule-form-title" role="dialog" onMouseDown={event => event.stopPropagation()}>
      <header><div><p>INTERVIEW SCHEDULE</p><h2 id="schedule-form-title">安排{stage}</h2></div><button type="button" className="modal-close" aria-label="关闭" onClick={onClose}>×</button></header>
      <p className="schedule-modal-context">{record.companyName || '未填写公司'} · {record.jobTitle || '未填写岗位'}</p>
      <label className="schedule-date-field">日期与时间<input type="datetime-local" value={scheduledAt} onChange={event => setScheduledAt(event.target.value)} /></label>
      <p className="schedule-online-note">线上面试（默认）。无需填写地点或会议链接。</p>
      {errorText && <p className="dashboard-form-error" role="alert">{errorText}</p>}
      <footer>{onCancelSchedule && <button type="button" className="schedule-cancel-action" disabled={saving} onClick={onCancelSchedule}>取消当前日程</button>}<button type="button" className="dashboard-secondary-action" disabled={saving} onClick={() => void save(false)}>暂不安排</button><button type="button" className="dashboard-primary-action" disabled={saving || !scheduledAt} onClick={() => void save(true)}>{saving ? '保存中...' : '保存并加入日程'}</button></footer>
    </section>
  </div>;
}

type ScheduledInterview = { record: ApplicationRecord; schedule: InterviewSchedule };

function SchedulePage() {
  const [records, setRecords] = useState<ApplicationRecord[]>([]);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState('');
  const [editing, setEditing] = useState<ScheduledInterview | null>(null);

  useEffect(() => {
    void (async () => {
      const response = await MessageService.sendMessage<ApplicationRecord[]>({ type: 'GET_APPLICATION_RECORDS' });
      if (!response.success) setErrorText(response.error || '读取面试日程失败');
      else setRecords((response.data ?? []).map(normalizeApplicationRecord));
      setLoading(false);
    })();
  }, []);

  const interviews = records.flatMap(record => (record.interviews ?? []).map(schedule => ({ record, schedule }))).sort((left, right) => left.schedule.scheduledAt.localeCompare(right.schedule.scheduledAt));
  const [year, monthIndex] = month.split('-').map(Number);
  const firstDay = new Date(year, monthIndex - 1, 1);
  const daysInMonth = new Date(year, monthIndex, 0).getDate();
  const startOffset = (firstDay.getDay() + 6) % 7;
  const cellCount = Math.ceil((startOffset + daysInMonth) / 7) * 7;
  const previousMonth = () => setMonth(current => { const date = new Date(`${current}-01T00:00:00`); date.setMonth(date.getMonth() - 1); return date.toISOString().slice(0, 7); });
  const nextMonth = () => setMonth(current => { const date = new Date(`${current}-01T00:00:00`); date.setMonth(date.getMonth() + 1); return date.toISOString().slice(0, 7); });
  const updateRecord = async (updated: ApplicationRecord): Promise<boolean> => {
    const response = await MessageService.sendMessage({ type: 'UPDATE_APPLICATION_RECORD', payload: updated });
    if (!response.success) { setErrorText(response.error || '更新日程失败'); return false; }
    setRecords(current => current.map(record => record.id === updated.id ? updated : record));
    return true;
  };
  const cancelSchedule = async (item: ScheduledInterview) => {
    if (!window.confirm(`确定取消${item.record.companyName || '该公司'}的${item.schedule.stage}日程吗？`)) return;
    const saved = await updateRecord({ ...item.record, interviews: (item.record.interviews ?? []).filter(schedule => schedule.id !== item.schedule.id), updatedAt: new Date().toISOString() });
    if (saved) setEditing(null);
  };

  return <>
    <div className="calendar-toolbar"><div className="month-picker"><button type="button" aria-label="上一个月" onClick={previousMonth}>‹</button><input type="month" aria-label="选择月份" value={month} onChange={event => setMonth(event.target.value)} /><button type="button" aria-label="下一个月" onClick={nextMonth}>›</button></div><span>面试进度更新后自动加入，默认线上</span></div>
    {errorText && <p className="dashboard-form-error" role="alert">{errorText}</p>}
    <div className="calendar-card">{loading ? <p className="application-empty">正在读取面试日程...</p> : <><div className="calendar-weekdays">{WEEKDAYS.map(day => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{Array.from({ length: cellCount }, (_, index) => {
      const day = index - startOffset + 1;
      const dateKey = day > 0 && day <= daysInMonth ? `${month}-${String(day).padStart(2, '0')}` : '';
      const events = interviews.filter(item => item.schedule.scheduledAt.slice(0, 10) === dateKey);
      return <div key={index} className={dateKey ? 'calendar-day' : 'calendar-day is-empty'}>{dateKey && <time dateTime={dateKey}>{day}</time>}{events.map(item => <button type="button" key={item.schedule.id} className={`calendar-event progress-${STATUS_CLASS_NAMES[item.schedule.stage]}`} onClick={() => setEditing(item)}><b>{item.schedule.stage}</b><span>{item.record.companyName || '未填写公司'}</span><small>{formatScheduleDate(item.schedule.scheduledAt).split(' ')[1] || ''}</small></button>)}</div>;
    })}</div></>}</div>
    {!loading && interviews.length === 0 && <p className="calendar-empty-note">还没有面试日程。将投递进度修改为一面、二面、三面或 HR 面时，会自动询问安排时间。</p>}
    {editing && <InterviewScheduleModal record={editing.record} stage={editing.schedule.stage} schedule={editing.schedule} onClose={() => setEditing(null)} onSave={updateRecord} onCancelSchedule={() => void cancelSchedule(editing)} />}
  </>;
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
  const [scheduleRequest, setScheduleRequest] = useState<{ record: ApplicationRecord; stage: InterviewStage } | null>(null);
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

  const persistRecord = async (payload: ApplicationRecord, noticeText?: string): Promise<boolean> => {
    const response = await MessageService.sendMessage({ type: 'UPDATE_APPLICATION_RECORD', payload });
    if (!response.success) { setErrorText(response.error || '更新投递记录失败'); return false; }
    setRecords(current => current.map(item => item.id === payload.id ? payload : item));
    if (noticeText) setNotice(noticeText);
    return true;
  };

  const updateProgress = async (record: ApplicationRecord, status: ApplicationRecordStatus) => {
    if (isInterviewStage(status)) {
      setScheduleRequest({ record, stage: status });
      return;
    }
    const payload = { ...record, status, updatedAt: new Date().toISOString() };
    await persistRecord(payload, `${record.companyName || '投递记录'}已更新为${status}`);
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
    const content = await file.text();
    const isJson = file.name.toLowerCase().endsWith('.json') || content.trim().startsWith('{');
    const legacy = isJson ? parseLegacyApplicationRecordsJson(content) : null;
    if (legacy?.error) {
      event.target.value = '';
      setErrorText(legacy.error);
      return;
    }
    const response = await MessageService.sendMessage<{ imported: number; warnings: string[] }>(
      legacy
        ? { type: 'IMPORT_APPLICATION_RECORDS', payload: { records: legacy.records } }
        : { type: 'IMPORT_APPLICATION_RECORDS_CSV', payload: { csv: content } },
    );
    event.target.value = '';
    if (!response.success) { setErrorText(response.error || '导入投递记录失败'); return; }
    await loadRecords();
    const warningCount = (legacy?.warnings.length ?? 0) + (response.data?.warnings.length ?? 0);
    setNotice(warningCount ? `已导入 ${response.data?.imported ?? 0} 条，存在 ${warningCount} 条提示` : `已导入 ${response.data?.imported ?? 0} 条投递记录`);
  };

  const savedRecord = (record: ApplicationRecord) => {
    setRecords(current => sortByRecent(current.some(item => item.id === record.id) ? current.map(item => item.id === record.id ? record : item) : [...current, record]));
    setEditingRecord(undefined);
    if (isInterviewStage(record.status) && !(record.interviews ?? []).some(schedule => schedule.stage === record.status)) {
      setScheduleRequest({ record, stage: record.status });
    } else setNotice('投递记录已保存');
  };

  return (
    <>
      {notice && <p className="dashboard-notice" role="status">{notice}</p>}
      {errorText && <p className="dashboard-form-error" role="alert">{errorText}</p>}
      <div className="application-table-card">
        <div className="application-toolbar">
          <label className="dashboard-search"><span aria-hidden="true">⌕</span><input value={keyword} onChange={event => setKeyword(event.target.value)} placeholder="搜索公司、岗位、城市或下一步行动" /></label>
          <select className="dashboard-filter" aria-label="筛选进度" value={statusFilter} onChange={event => setStatusFilter(event.target.value as ApplicationRecordStatus | 'all')}><option value="all">全部进度</option>{APPLICATION_RECORD_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}</select>
          <select className="dashboard-filter" aria-label="排序方式" value={sortDirection} onChange={event => setSortDirection(event.target.value as 'recent' | 'oldest')}><option value="recent">最近更新优先</option><option value="oldest">投递日期最早</option></select>
          <input ref={importInputRef} className="visually-hidden" type="file" accept=".csv,text/csv,.json,application/json" onChange={event => void importRecords(event)} />
          <button type="button" className="dashboard-tertiary-action" onClick={() => importInputRef.current?.click()}>导入 CSV / 旧版 JSON</button>
          <button type="button" className="dashboard-tertiary-action" onClick={() => void exportRecords()}>导出备份</button>
          <button type="button" className="dashboard-primary-action" onClick={() => setEditingRecord(null)}>+ 新增投递</button>
        </div>
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
      {scheduleRequest && <InterviewScheduleModal record={scheduleRequest.record} stage={scheduleRequest.stage} onClose={() => setScheduleRequest(null)} onSave={async record => {
        const saved = await persistRecord(record, `${record.companyName || '投递记录'}已更新并加入${record.status}日程`);
        if (saved) setScheduleRequest(null);
        return saved;
      }} />}
    </>
  );
}

type ReviewItem = { record: ApplicationRecord; review: InterviewReview };

function AddReviewModal({ records, onClose, onSave }: { records: ApplicationRecord[]; onClose: () => void; onSave: (item: ReviewItem) => void }) {
  const [recordId, setRecordId] = useState(records[0]?.id ?? '');
  const [stage, setStage] = useState<InterviewStage>('一面');
  const [errorText, setErrorText] = useState('');
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const record = records.find(item => item.id === recordId);
    if (!record) { setErrorText('请先选择关联的投递记录。'); return; }
    const now = new Date().toISOString();
    const review: InterviewReview = { id: createRecordId(), stage, content: '', status: 'pending', createdAt: now, updatedAt: now };
    const updated = { ...record, interviewReviews: [...(record.interviewReviews ?? []), review], updatedAt: now };
    const response = await MessageService.sendMessage({ type: 'UPDATE_APPLICATION_RECORD', payload: updated });
    if (!response.success) { setErrorText(response.error || '添加面经失败'); return; }
    onSave({ record: updated, review });
  };
  return <div className="dashboard-modal-backdrop" role="presentation" onMouseDown={onClose}><section className="dashboard-modal add-review-modal" aria-modal="true" aria-labelledby="add-review-title" role="dialog" onMouseDown={event => event.stopPropagation()}><header><div><p>ADD INTERVIEW NOTE</p><h2 id="add-review-title">添加面经</h2></div><button type="button" className="modal-close" aria-label="关闭" onClick={onClose}>×</button></header><form onSubmit={event => void submit(event)}><label>关联投递<select value={recordId} onChange={event => setRecordId(event.target.value)}>{records.map(record => <option key={record.id} value={record.id}>{record.companyName || '未填写公司'} · {record.jobTitle || '未填写岗位'}</option>)}</select></label><label>面试轮次<select value={stage} onChange={event => setStage(event.target.value as InterviewStage)}>{INTERVIEW_STAGES.map(item => <option key={item} value={item}>{item}</option>)}</select></label>{errorText && <p className="dashboard-form-error" role="alert">{errorText}</p>}<footer><button type="button" className="dashboard-secondary-action" onClick={onClose}>取消</button><button type="submit" className="dashboard-primary-action">添加待复盘</button></footer></form></section></div>;
}

function ReviewsPage() {
  const [records, setRecords] = useState<ApplicationRecord[]>([]);
  const [selected, setSelected] = useState<{ recordId: string; reviewId: string } | null>(null);
  const [content, setContent] = useState('');
  const [keyword, setKeyword] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [errorText, setErrorText] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => { void (async () => {
    const response = await MessageService.sendMessage<ApplicationRecord[]>({ type: 'GET_APPLICATION_RECORDS' });
    if (!response.success) setErrorText(response.error || '读取面经记录失败');
    else setRecords((response.data ?? []).map(normalizeApplicationRecord));
    setLoading(false);
  })(); }, []);

  const reviewItems = records.flatMap(record => (record.interviewReviews ?? []).map(review => ({ record, review }))).filter(item => {
    const matchesFilter = filter === 'all' || item.review.status === filter;
    const text = `${item.record.companyName} ${item.record.jobTitle} ${item.review.stage} ${item.review.content}`.toLowerCase();
    return matchesFilter && text.includes(keyword.trim().toLowerCase());
  }).sort((left, right) => right.review.updatedAt.localeCompare(left.review.updatedAt));
  const selectedItem = selected ? reviewItems.find(item => item.record.id === selected.recordId && item.review.id === selected.reviewId) ?? null : null;

  useEffect(() => { if (!selected && reviewItems[0]) setSelected({ recordId: reviewItems[0].record.id, reviewId: reviewItems[0].review.id }); }, [reviewItems, selected]);
  useEffect(() => { setContent(selectedItem?.review.content ?? ''); }, [selectedItem?.review.id, selectedItem?.review.content]);

  const saveReview = async () => {
    if (!selectedItem) return;
    setSaving(true);
    const now = new Date().toISOString();
    const updatedReview: InterviewReview = { ...selectedItem.review, content: content.trim(), status: content.trim() ? 'completed' : 'pending', updatedAt: now };
    const updatedRecord = { ...selectedItem.record, interviewReviews: (selectedItem.record.interviewReviews ?? []).map(review => review.id === updatedReview.id ? updatedReview : review), updatedAt: now };
    const response = await MessageService.sendMessage({ type: 'UPDATE_APPLICATION_RECORD', payload: updatedRecord });
    if (!response.success) setErrorText(response.error || '保存复盘失败');
    else { setRecords(current => current.map(record => record.id === updatedRecord.id ? updatedRecord : record)); setNotice('复盘已保存'); }
    setSaving(false);
  };

  const addReview = (item: ReviewItem) => {
    setRecords(current => current.map(record => record.id === item.record.id ? item.record : record));
    setSelected({ recordId: item.record.id, reviewId: item.review.id });
    setAdding(false);
    setNotice('已添加待复盘记录');
  };

  return <>
    {notice && <p className="dashboard-notice" role="status">{notice}</p>}{errorText && <p className="dashboard-form-error" role="alert">{errorText}</p>}
    <div className="reviews-layout">
      <section className="review-editor-card">{loading ? <p className="application-empty">正在读取面经记录...</p> : selectedItem ? <><header className="review-editor-heading"><div><p>INTERVIEW NOTES</p><h2>{selectedItem.record.companyName || '未填写公司'} · {selectedItem.review.stage}</h2><span>{selectedItem.record.jobTitle || '未填写岗位'} · {selectedItem.review.status === 'pending' ? '待复盘' : '已记录'}</span></div></header><label className="review-textarea-label">面试复盘<textarea value={content} onChange={event => setContent(event.target.value)} placeholder="记录本次面试的详细过程、问题、回答、感受……\n\n也可以直接粘贴会议纪要或零散笔记；配置 AI 后可整理为结构化复盘。" /></label><footer className="review-editor-actions"><button type="button" className="dashboard-secondary-action" onClick={() => setNotice('AI 总结需要先在简历资料库配置 AI 服务。')}>✦ AI 总结</button><button type="button" className="dashboard-primary-action" disabled={saving} onClick={() => void saveReview()}>{saving ? '保存中...' : '保存复盘'}</button></footer></> : <div className="review-empty-editor"><h2>选择一条面经记录</h2><p>从右侧选择待复盘记录，或添加一条历史面经。</p></div>}</section>
      <aside className="review-list-card"><div className="review-list-tools"><input value={keyword} onChange={event => setKeyword(event.target.value)} placeholder="搜索面经..." /><select aria-label="筛选面经状态" value={filter} onChange={event => setFilter(event.target.value as 'all' | 'pending' | 'completed')}><option value="all">全部</option><option value="pending">待复盘</option><option value="completed">已记录</option></select><button type="button" className="dashboard-primary-action" onClick={() => setAdding(true)}>+ 添加面经</button></div><div className="review-list">{reviewItems.length === 0 ? <p>暂无面经记录</p> : reviewItems.map(item => <button type="button" key={item.review.id} className={selected?.reviewId === item.review.id ? 'review-list-item is-active' : 'review-list-item'} onClick={() => setSelected({ recordId: item.record.id, reviewId: item.review.id })}><b>{item.record.companyName || '未填写公司'} · {item.review.stage}</b><span>{item.record.jobTitle || '未填写岗位'}</span><small>{item.review.status === 'pending' ? '待复盘' : '已记录'} · {item.review.updatedAt.slice(0, 10)}</small></button>)}</div></aside>
    </div>
    {adding && <AddReviewModal records={records} onClose={() => setAdding(false)} onSave={addReview} />}
  </>;
}

function ProfilesPage() {
  const [context, setContext] = useState<ActiveResumeContext | null>(null);
  const [errorText, setErrorText] = useState('');

  useEffect(() => {
    void (async () => {
      const response = await MessageService.sendMessage<ActiveResumeContext>({ type: 'GET_ACTIVE_RESUME_CONTEXT' });
      if (!response.success) setErrorText(response.error || '读取简历资料失败');
      else setContext(response.data ?? null);
    })();
  }, []);

  const profile = context?.profile;
  return <>
    {errorText && <p className="dashboard-form-error" role="alert">{errorText}</p>}
    <div className="dashboard-overview-grid">
      <section className="dashboard-overview-card profile-overview-card">
        <p className="dashboard-card-eyebrow">ACTIVE RESUME</p>
        <h2>{context?.profiles.find(item => item.id === context.activeProfileId)?.name || '默认简历'}</h2>
        <p>当前投递和自动填充使用这份简历资料。编辑、切换、新建和导入简历等完整功能仍在原资料编辑器中保留。</p>
        <div className="dashboard-card-actions"><button type="button" className="dashboard-primary-action" onClick={() => openLegacySettings('resume')}>管理简历资料</button><button type="button" className="dashboard-secondary-action" onClick={() => openLegacySettings('ai')}>配置 AI（可选）</button></div>
      </section>
      <section className="dashboard-overview-card profile-facts-card">
        <p className="dashboard-card-eyebrow">PROFILE SNAPSHOT</p>
        <dl className="profile-facts">
          <div><dt>个人信息</dt><dd>{profile?.personal.name || '未填写'}</dd></div>
          <div><dt>教育经历</dt><dd>{profile?.education.length ?? 0} 条</dd></div>
          <div><dt>工作 / 实习</dt><dd>{profile?.experience.length ?? 0} 条</dd></div>
          <div><dt>项目经历</dt><dd>{profile?.projects.length ?? 0} 条</dd></div>
        </dl>
      </section>
    </div>
  </>;
}

function InsightsPage() {
  const [records, setRecords] = useState<ApplicationRecord[]>([]);
  const [errorText, setErrorText] = useState('');
  useEffect(() => {
    void (async () => {
      const response = await MessageService.sendMessage<ApplicationRecord[]>({ type: 'GET_APPLICATION_RECORDS' });
      if (!response.success) setErrorText(response.error || '读取投递数据失败');
      else setRecords((response.data ?? []).map(normalizeApplicationRecord));
    })();
  }, []);
  const activeRecords = records.filter(item => item.status !== '中止');
  const interviewCount = records.filter(item => isInterviewStage(item.status)).length;
  const offerCount = records.filter(item => item.status === 'Offer').length;
  return <>
    {errorText && <p className="dashboard-form-error" role="alert">{errorText}</p>}
    <div className="insights-summary">
      <section><span>总投递</span><strong>{records.length}</strong></section>
      <section><span>进行中</span><strong>{activeRecords.length}</strong></section>
      <section><span>面试阶段</span><strong>{interviewCount}</strong></section>
      <section><span>已获 Offer</span><strong>{offerCount}</strong></section>
    </div>
    <section className="insights-card"><div><p className="dashboard-card-eyebrow">PROGRESS DISTRIBUTION</p><h2>投递进度分布</h2></div><div className="insight-status-grid">{APPLICATION_RECORD_STATUSES.map(status => { const count = records.filter(item => item.status === status).length; return <div key={status} className={`insight-status-item progress-${STATUS_CLASS_NAMES[status]}`}><span>{status}</span><strong>{count}</strong></div>; })}</div></section>
  </>;
}

function BackupPage() {
  const [metadata, setMetadata] = useState<SyncMetadata>({ status: 'idle' });
  const [config, setConfig] = useState<WebDAVConfig | null>(null);
  const [errorText, setErrorText] = useState('');
  useEffect(() => {
    void Promise.all([
      MessageService.sendMessage<SyncMetadata>({ type: 'GET_SYNC_STATUS' }),
      MessageService.sendMessage<WebDAVConfig>({ type: 'GET_WEBDAV_CONFIG' }),
    ]).then(([syncResponse, configResponse]) => {
      if (!syncResponse.success) setErrorText(syncResponse.error || '读取同步状态失败');
      else if (syncResponse.data) setMetadata(syncResponse.data);
      if (configResponse.success && configResponse.data) setConfig(configResponse.data);
    });
  }, []);
  const syncLabel: Record<SyncMetadata['status'], string> = { idle: '尚未同步', syncing: '同步中', synced: '已同步', conflict: '需要处理冲突', error: '同步失败' };
  return <>
    {errorText && <p className="dashboard-form-error" role="alert">{errorText}</p>}
    <div className="dashboard-overview-grid">
      <section className="dashboard-overview-card backup-status-card"><p className="dashboard-card-eyebrow">SYNC STATUS</p><h2>{syncLabel[metadata.status]}</h2><p>{config?.enabled ? 'WebDAV 自动同步已启用。' : 'WebDAV 自动同步尚未启用。'} 最近成功同步：{metadata.lastSyncedAt ? new Date(metadata.lastSyncedAt).toLocaleString() : '暂无'}。</p><span className={`backup-status-pill status-${metadata.status}`}>{syncLabel[metadata.status]}</span></section>
      <section className="dashboard-overview-card"><p className="dashboard-card-eyebrow">SAFE DATA CONTROL</p><h2>导入、导出与同步</h2><p>完整 JSON 备份、导入预检、冲突处理和 WebDAV 凭据都保留在专用设置中；备份可能含个人资料和密钥，请勿分享。</p><div className="dashboard-card-actions"><button type="button" className="dashboard-primary-action" onClick={() => openLegacySettings('data-sync')}>打开备份与同步</button></div></section>
    </div>
  </>;
}

function App() {
  const [activePage, setActivePage] = useState<DashboardPage>(getInitialPage);
  const activeItem = NAVIGATION_ITEMS.find(item => item.id === activePage)!;
  return <main className="dashboard-shell"><header className="dashboard-header"><a className="dashboard-brand" href={getRuntimeUrl('src/dashboard/index.html')}><span className="dashboard-brand-mark" aria-hidden="true">J</span><span>求职助手</span></a><nav className="dashboard-nav" aria-label="主导航">{NAVIGATION_ITEMS.map(item => <button key={item.id} type="button" className={item.id === activePage ? 'dashboard-nav-item is-active' : 'dashboard-nav-item'} onClick={() => setActivePage(item.id)}>{item.label}</button>)}</nav></header><section className="dashboard-workspace" aria-labelledby="page-title"><div className="dashboard-page-heading"><div><p>{activeItem.eyebrow}</p><h1 id="page-title">{activeItem.title}</h1><span>{activeItem.description}</span></div></div>{activePage === 'applications' ? <ApplicationsPage /> : activePage === 'schedule' ? <SchedulePage /> : activePage === 'reviews' ? <ReviewsPage /> : activePage === 'profiles' ? <ProfilesPage /> : activePage === 'insights' ? <InsightsPage /> : <BackupPage />}</section></main>;
}

export default App;
