import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { FolderOpen, Pencil, Trash2 } from 'lucide-react';
import type { Collection } from '../../shared/types.js';
import { useCollectionMutations, useCollections } from '../api/hooks';
import { Confirm } from '../components/Confirm';
import { EmptyState } from '../components/EmptyState';
import { plural } from '../lib/format';
import { toast, errorMessage } from '../lib/toast';
import { phrases, react, setAmbient } from '../mascot/store';

export function CollectionsPage() {
  const collections = useCollections();
  const { create, update, remove } = useCollectionMutations();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [editing, setEditing] = useState<Collection | null>(null);
  const [deleting, setDeleting] = useState<Collection | null>(null);

  useEffect(() => {
    setAmbient('idle', null);
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate(
      { name, description },
      {
        onSuccess: (c) => {
          setName('');
          setDescription('');
          react('happy', phrases.collectionCreated(c.name), 3000);
        },
        onError: (err) => toast('error', errorMessage(err)),
      },
    );
  };

  const saveEdit = (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    update.mutate(
      { id: editing.id, patch: { name: editing.name, description: editing.description } },
      { onSuccess: () => setEditing(null), onError: (err) => toast('error', errorMessage(err)) },
    );
  };

  return (
    <main className="page">
      <div className="lib-head">
        <div>
          <div className="sheet-label">
            <b>Лист 02</b>
            <span>·</span>
            <span>тематические полки</span>
          </div>
          <h1 className="display lib-title">Коллекции</h1>
          <div className="lib-sub">Тематические полки: «инструменты для CLI», «идеи для пет-проекта», «посмотреть на выходных».</div>
        </div>
      </div>

      <form className="coll-form" onSubmit={submit}>
        <input className="input" placeholder="Название новой коллекции" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        <input className="input" placeholder="Описание (необязательно)" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
        <button type="submit" className="btn btn-primary" disabled={!name.trim() || create.isPending}>
          Создать
        </button>
      </form>

      {collections.isPending && <div className="skeleton" />}
      {collections.isError && <div className="error-box">{errorMessage(collections.error)}</div>}

      {collections.isSuccess && collections.data.length === 0 && (
        <EmptyState mood="idle" title="Коллекций пока нет" text="Создайте первую: это способ собрать проекты по задаче, а не по технологии." />
      )}

      {collections.isSuccess && collections.data.length > 0 && (
        <div className="coll-grid">
          {collections.data.map((c) => (
            <div key={c.id} className="card coll-card">
              {editing?.id === c.id ? (
                <form onSubmit={saveEdit} className="topics-editor">
                  <input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} autoFocus maxLength={120} />
                  <input className="input" value={editing.description} placeholder="Описание" onChange={(e) => setEditing({ ...editing, description: e.target.value })} maxLength={2000} />
                  <div className="row">
                    <button type="submit" className="btn btn-sm btn-primary" disabled={!editing.name.trim() || update.isPending}>
                      Сохранить
                    </button>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditing(null)}>
                      Отмена
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <Link to={`/?collection=${c.id}`} className="coll-name">
                    {c.name}
                  </Link>
                  <div className="coll-count">{plural(c.repoIds.length, ['проект', 'проекта', 'проектов'])}</div>
                  {c.description && <p style={{ margin: 0, color: 'var(--ink-2)', fontSize: 14 }}>{c.description}</p>}
                  <div className="coll-actions">
                    <Link to={`/?collection=${c.id}`} className="btn btn-sm">
                      <FolderOpen size={14} /> Открыть
                    </Link>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditing(c)}>
                      <Pencil size={14} /> Переименовать
                    </button>
                    <button type="button" className="btn btn-sm btn-ghost btn-danger" style={{ marginLeft: 'auto' }} onClick={() => setDeleting(c)} title="Удалить коллекцию">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {deleting && (
        <Confirm
          title={`Удалить коллекцию «${deleting.name}»?`}
          text="Сами репозитории останутся в библиотеке — исчезнет только полка."
          confirmLabel="Удалить"
          danger
          busy={remove.isPending}
          onConfirm={() =>
            remove.mutate(deleting.id, {
              onSuccess: () => setDeleting(null),
              onError: (err) => {
                setDeleting(null);
                toast('error', errorMessage(err));
              },
            })
          }
          onCancel={() => setDeleting(null)}
        />
      )}
    </main>
  );
}
