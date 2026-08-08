import React, { useEffect, useMemo, useRef, useState } from 'react';
import { APPLICATION_RECORD_STATUSES } from '../shared/applicationRecords.ts';
import { MessageService } from '../shared/message.ts';
import type { ApplicationRecord, ApplicationRecordStatus } from '../shared/types.ts';

interface ApplicationRecordsSectionProps {
  initialMode?: 'list' | 'new';
  initialRecords?: ApplicationRecord[];
}

type NoticeState = {
  type: 'success' | 'error' | 'info';
  text: string;
} | null;

function sortRecords(records: ApplicationRecord[]): ApplicationRecord[] {
  return [...records].sort((left, right) => {
    const leftValue = left.appliedAt || left.updatedAt || left.createdAt;
    const rightValue = right.appliedAt || right.updatedAt || right.createdAt;
    return rightValue.localeCompare(leftValue);
  });
}

function cloneRecord(record: ApplicationRecord): ApplicationRecord {
  return { ...record };
}

function normalizeKeyword(value: string): string {
  return value.trim().toLowerCase();
}

function matchesKeyword(value: string, keyword: string): boolean {
  if (!keyword) {
    return true;
  }

  return value.toLowerCase().includes(keyword);
}

function trimRecord(record: ApplicationRecord): ApplicationRecord {
  return {
    ...record,
    companyName: record.companyName.trim(),
    jobTitle: record.jobTitle.trim(),
    sourceSite: record.sourceSite.trim(),
    sourceUrl: record.sourceUrl.trim(),
    notes: record.notes.trim(),
    appliedAt: record.appliedAt.trim(),
    location: record.location.trim(),
  };
}

function formatUpdatedAt(value: string): string {
  if (!value) {
    return '未更新';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function EditIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.75 13.75V16.25H6.25L14.8 7.7L12.3 5.2L3.75 13.75Z" />
      <path d="M10.95 6.55L13.45 9.05" />
      <path d="M11.95 4.2L14.45 6.7" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.75 6.25H15.25" />
      <path d="M7.25 6.25V4.75H12.75V6.25" />
      <path d="M6.5 6.25V14.5C6.5 15.05 6.95 15.5 7.5 15.5H12.5C13.05 15.5 13.5 15.05 13.5 14.5V6.25" />
      <path d="M8.5 8.75V13" />
      <path d="M11.5 8.75V13" />
    </svg>
  );
}

export function ApplicationRecordsSection({
  initialRecords = [],
}: ApplicationRecordsSectionProps): React.JSX.Element {
  const [records, setRecords] = useState<ApplicationRecord[]>(() => sortRecords(initialRecords));
  const [loading, setLoading] = useState(initialRecords.length === 0);
  const [busyAction, setBusyAction] = useState<'import' | 'export' | 'save' | 'delete' | null>(null);
  const [errorText, setErrorText] = useState('');
  const [notice, setNotice] = useState<NoticeState>(null);
  const [companyKeyword, setCompanyKeyword] = useState('');
  const [jobKeyword, setJobKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftRecord, setDraftRecord] = useState<ApplicationRecord | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadRecords = async () => {
    setLoading(true);
    setErrorText('');
    const response = await MessageService.sendMessage<ApplicationRecord[]>({
      type: 'GET_APPLICATION_RECORDS',
    });

    if (!response.success) {
      setErrorText(response.error || '读取投递记录失败');
      setLoading(false);
      return;
    }

    setRecords(sortRecords(response.data ?? []));
    setLoading(false);
  };

  useEffect(() => {
    if (initialRecords.length > 0) {
      return;
    }

    void loadRecords();
  }, [initialRecords.length]);

  const filteredRecords = useMemo(() => {
    const normalizedCompanyKeyword = normalizeKeyword(companyKeyword);
    const normalizedJobKeyword = normalizeKeyword(jobKeyword);

    return records.filter(record =>
      matchesKeyword(record.companyName, normalizedCompanyKeyword)
      && matchesKeyword(record.jobTitle, normalizedJobKeyword)
      && (statusFilter ? record.status === statusFilter : true),
    );
  }, [companyKeyword, jobKeyword, records, statusFilter]);

  const beginEdit = (record: ApplicationRecord) => {
    setEditingId(record.id);
    setDraftRecord(cloneRecord(record));
    setErrorText('');
    setNotice(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraftRecord(null);
  };

  const updateDraftField = <K extends keyof ApplicationRecord>(
    field: K,
    value: ApplicationRecord[K],
  ) => {
    setDraftRecord(current => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        [field]: value,
      };
    });
  };

  const handleSave = async () => {
    if (!draftRecord) {
      return;
    }

    setBusyAction('save');
    setErrorText('');
    const payload = trimRecord({
      ...draftRecord,
      updatedAt: new Date().toISOString(),
    });
    const response = await MessageService.sendMessage({
      type: 'UPDATE_APPLICATION_RECORD',
      payload,
    });

    if (!response.success) {
      setErrorText(response.error || '保存投递记录失败');
      setBusyAction(null);
      return;
    }

    setRecords(current => sortRecords(current.map(record => (
      record.id === payload.id ? payload : record
    ))));
    setEditingId(null);
    setDraftRecord(null);
    setBusyAction(null);
    setNotice({ type: 'success', text: '投递记录已更新' });
  };

  const handleDelete = async (record: ApplicationRecord) => {
    if (
      typeof window !== 'undefined'
      && typeof window.confirm === 'function'
      && !window.confirm(`确定删除 ${record.companyName || '该条'} 投递记录吗？`)
    ) {
      return;
    }

    setBusyAction('delete');
    setErrorText('');
    const response = await MessageService.sendMessage({
      type: 'DELETE_APPLICATION_RECORD',
      payload: { id: record.id },
    });

    if (!response.success) {
      setErrorText(response.error || '删除投递记录失败');
      setBusyAction(null);
      return;
    }

    setRecords(current => current.filter(item => item.id !== record.id));
    if (editingId === record.id) {
      cancelEdit();
    }
    setBusyAction(null);
    setNotice({ type: 'success', text: '投递记录已删除' });
  };

  const handleExport = async () => {
    setBusyAction('export');
    setErrorText('');
    const response = await MessageService.sendMessage<{ csv: string; filename: string }>({
      type: 'EXPORT_APPLICATION_RECORDS_CSV',
    });

    if (!response.success || !response.data) {
      setErrorText(response.error || '导出 CSV 失败');
      setBusyAction(null);
      return;
    }

    if (typeof document !== 'undefined') {
      const blob = new Blob([response.data.csv], { type: 'text/csv;charset=utf-8' });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = response.data.filename;
      link.click();
      URL.revokeObjectURL(objectUrl);
    }

    setBusyAction(null);
    setNotice({ type: 'success', text: `CSV 已导出：${response.data.filename}` });
  };

  const handleImportChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setBusyAction('import');
    setErrorText('');

    try {
      const csv = await file.text();
      const response = await MessageService.sendMessage<{ imported: number; warnings: string[] }>({
        type: 'IMPORT_APPLICATION_RECORDS_CSV',
        payload: { csv },
      });

      if (!response.success) {
        setErrorText(response.error || '导入 CSV 失败');
        return;
      }

      await loadRecords();
      const warnings = response.data?.warnings ?? [];
      const importedCount = response.data?.imported ?? 0;
      setNotice({
        type: warnings.length > 0 ? 'info' : 'success',
        text: warnings.length > 0
          ? `已导入 ${importedCount} 条记录；${warnings.join('；')}`
          : `已导入 ${importedCount} 条记录`,
      });
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '读取 CSV 文件失败');
    } finally {
      setBusyAction(null);
      event.target.value = '';
    }
  };

  return (
    <section className="application-records-section">
      <div className="application-records-header">
        <div>
          <h2 className="section-title">投递记录</h2>
          <p className="application-records-description">
            在设置页统一筛选、编辑、删除，并支持 CSV 导入导出已有投递记录。
          </p>
        </div>
        <div className="application-records-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="visually-hidden"
            onChange={event => void handleImportChange(event)}
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={busyAction !== null}
          >
            导入 CSV
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void handleExport()}
            disabled={busyAction !== null}
          >
            导出 CSV
          </button>
        </div>
      </div>

      <div className="application-records-toolbar">
        <label className="application-records-filter">
          <span>公司名</span>
          <input
            aria-label="公司名"
            value={companyKeyword}
            onChange={event => setCompanyKeyword(event.target.value)}
            placeholder="按公司筛选"
          />
        </label>
        <label className="application-records-filter">
          <span>岗位名</span>
          <input
            aria-label="岗位名"
            value={jobKeyword}
            onChange={event => setJobKeyword(event.target.value)}
            placeholder="按岗位筛选"
          />
        </label>
        <label className="application-records-filter">
          <span>状态</span>
          <select
            aria-label="状态"
            value={statusFilter}
            onChange={event => setStatusFilter(event.target.value)}
          >
            <option value="">全部状态</option>
            {APPLICATION_RECORD_STATUSES.map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </label>
      </div>

      {notice && (
        <div
          className={`application-records-notice application-records-notice-${notice.type}`}
          role="status"
          aria-live="polite"
        >
          {notice.text}
        </div>
      )}

      {errorText && (
        <div className="application-records-error" role="alert">
          {errorText}
        </div>
      )}

      <div className="application-records-list" aria-live="polite">
          {loading ? (
            <div className="application-records-empty">正在加载投递记录...</div>
          ) : filteredRecords.length === 0 ? (
            <div className="application-records-empty">暂无符合条件的投递记录</div>
          ) : (
            filteredRecords.map(record => {
              const isEditing = editingId === record.id && draftRecord;
              return (
                <div
                  key={record.id}
                  className={`application-record-row${editingId === record.id ? ' is-active' : ''}`}
                >
                  <button
                    type="button"
                    className="application-record-row-main"
                    onClick={() => beginEdit(record)}
                  >
                    <span className="application-record-row-company">{record.companyName || '未填写公司名'}</span>
                    <span className="application-record-row-job">{record.jobTitle || '未填写岗位名'}</span>
                    <span className="application-record-row-status">{record.status}</span>
                    <span className="application-record-row-site">{record.sourceSite || '未填写'}</span>
                    <span className="application-record-row-date">{record.appliedAt || '未填写'}</span>
                  </button>
                  <div className="application-record-row-actions">
                    <a
                      className="application-record-link-button"
                      href={record.sourceUrl || '#'}
                      target="_blank"
                      rel="noreferrer"
                      aria-disabled={!record.sourceUrl}
                      onClick={event => {
                        if (!record.sourceUrl) {
                          event.preventDefault();
                        }
                      }}
                    >
                      打开链接
                    </a>
                    <button
                      type="button"
                      className="application-record-icon-button"
                      aria-label="编辑"
                      onClick={() => beginEdit(record)}
                      disabled={busyAction !== null}
                    >
                      <EditIcon />
                    </button>
                    <button
                      type="button"
                      className="application-record-icon-button application-record-icon-button-danger"
                      aria-label="删除"
                      onClick={() => void handleDelete(record)}
                      disabled={busyAction !== null}
                    >
                      <DeleteIcon />
                    </button>
                  </div>

                  {isEditing && (
                    <div className="application-record-inline-editor">
                      <div className="application-record-inline-grid">
                        <label>
                          <span>公司名</span>
                          <input
                            type="text"
                            value={draftRecord.companyName}
                            onChange={event => updateDraftField('companyName', event.target.value)}
                            disabled={busyAction !== null}
                          />
                        </label>
                        <label>
                          <span>岗位名</span>
                          <input
                            type="text"
                            value={draftRecord.jobTitle}
                            onChange={event => updateDraftField('jobTitle', event.target.value)}
                            disabled={busyAction !== null}
                          />
                        </label>
                        <label>
                          <span>来源站点</span>
                          <input
                            type="text"
                            value={draftRecord.sourceSite}
                            onChange={event => updateDraftField('sourceSite', event.target.value)}
                            disabled={busyAction !== null}
                          />
                        </label>
                        <label>
                          <span>状态</span>
                          <select
                            value={draftRecord.status}
                            onChange={event => updateDraftField('status', event.target.value as ApplicationRecordStatus)}
                            disabled={busyAction !== null}
                          >
                            {APPLICATION_RECORD_STATUSES.map(status => (
                              <option key={status} value={status}>{status}</option>
                            ))}
                          </select>
                        </label>
                        <label className="application-record-inline-wide">
                          <span>来源链接</span>
                          <input
                            type="url"
                            value={draftRecord.sourceUrl}
                            onChange={event => updateDraftField('sourceUrl', event.target.value)}
                            disabled={busyAction !== null}
                          />
                        </label>
                        <label>
                          <span>投递日期</span>
                          <input
                            type="date"
                            value={draftRecord.appliedAt}
                            onChange={event => updateDraftField('appliedAt', event.target.value)}
                            disabled={busyAction !== null}
                          />
                        </label>
                        <label>
                          <span>工作地点</span>
                          <input
                            type="text"
                            value={draftRecord.location}
                            onChange={event => updateDraftField('location', event.target.value)}
                            disabled={busyAction !== null}
                          />
                        </label>
                        <label className="application-record-inline-wide">
                          <span>备注</span>
                          <textarea
                            rows={4}
                            value={draftRecord.notes}
                            onChange={event => updateDraftField('notes', event.target.value)}
                            disabled={busyAction !== null}
                          />
                        </label>
                      </div>
                      <div className="application-record-inline-actions">
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={cancelEdit}
                          disabled={busyAction !== null}
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => void handleSave()}
                          disabled={busyAction !== null}
                        >
                          保存修改
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
      </div>
    </section>
  );
}

export default ApplicationRecordsSection;
