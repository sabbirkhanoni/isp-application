import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateUserInput, GrantablePermission, UserDto } from '@isp/contracts';
import { Fragment, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/features/auth/auth-context';
import { useI18n } from '@/i18n/i18n-context';
import { ApiError } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { PermissionsEditor } from './permissions-editor';
import { CreateUserForm } from './create-user-form';
import { createUser, fetchUsers, resetUserPassword, updateUser, usersKeys } from './users-api';
import { Loading } from '@/components/ui/page';

export function UsersPage() {
  const { t, language } = useI18n();
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState<'created' | 'updated' | 'resetDone' | 'rightsSaved' | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [editingRights, setEditingRights] = useState<string | null>(null);

  const list = useQuery({ queryKey: usersKeys.list(page), queryFn: () => fetchUsers(page) });

  const refresh = () => queryClient.invalidateQueries({ queryKey: usersKeys.all });
  const report = (e: unknown) =>
    setError(e instanceof ApiError && e.status === 409 ? t.users.conflict : t.common.genericError);

  const create = useMutation({ mutationFn: createUser, onSuccess: refresh });
  const toggle = useMutation({
    mutationFn: (u: UserDto) =>
      updateUser(u.id, { status: u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' }),
    onSuccess: refresh,
  });
  const saveRights = useMutation({
    mutationFn: ({ id, permissions }: { id: string; permissions: GrantablePermission[] }) =>
      updateUser(id, { extraPermissions: permissions }),
    onSuccess: refresh,
  });
  const reset = useMutation({
    mutationFn: ({ id, temporaryPassword }: { id: string; temporaryPassword: string }) =>
      resetUserPassword(id, { temporaryPassword }),
  });

  const handleCreate = async (input: CreateUserInput) => {
    await create.mutateAsync(input);
    setShowForm(false);
    setNotice('created');
  };

  const handleRights = (u: UserDto, permissions: GrantablePermission[]) => {
    setError(null);
    saveRights.mutate(
      { id: u.id, permissions },
      {
        onSuccess: () => {
          setEditingRights(null);
          setNotice('rightsSaved');
        },
        onError: report,
      },
    );
  };

  const handleToggle = (u: UserDto) => {
    setError(null);
    toggle.mutate(u, { onSuccess: () => setNotice('updated'), onError: report });
  };

  const handleReset = (u: UserDto) => {
    const temporaryPassword = window.prompt(t.users.temporaryPassword);
    if (!temporaryPassword) return;
    setError(null);
    reset.mutate(
      { id: u.id, temporaryPassword },
      { onSuccess: () => setNotice('resetDone'), onError: report },
    );
  };

  const pagination = list.data?.pagination;
  const lastPage = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.limit)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t.users.title}</h1>
        {!showForm && <Button onClick={() => setShowForm(true)}>{t.users.add}</Button>}
      </div>

      {notice && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice === 'rightsSaved' ? t.admin.extraSaved : t.users[notice]}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {showForm && <CreateUserForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />}

      <Card className="overflow-x-auto p-0">
        {list.isPending && <Loading />}
        {list.isError && (
          <div className="p-5">
            <p className="text-red-700">{t.common.genericError}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => void list.refetch()}
            >
              {t.common.retry}
            </Button>
          </div>
        )}
        {list.data && list.data.users.length === 0 && (
          <p className="p-5 text-slate-500">{t.users.empty}</p>
        )}
        {list.data && list.data.users.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-2">{t.users.fullName}</th>
                <th className="px-4 py-2">{t.users.username}</th>
                <th className="px-4 py-2">{t.users.role}</th>
                <th className="px-4 py-2">{t.users.status}</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {list.data.users.map((u) => (
                <Fragment key={u.id}>
                  <tr className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2">
                      <div className="font-medium">{u.fullName}</div>
                      {u.lastLoginAt && (
                        <div className="text-xs text-slate-500">
                          {formatDateTime(u.lastLoginAt, language)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2">{u.username}</td>
                    <td className="px-4 py-2">{t.roles[u.role]}</td>
                    <td className="px-4 py-2">
                      {u.status === 'ACTIVE' ? t.common.active : t.common.disabled}
                    </td>
                    <td className="space-x-2 px-4 py-2 text-right whitespace-nowrap">
                      {u.role === 'STAFF' && (
                        <Button size="sm" variant="outline" onClick={() => setEditingRights(u.id)}>
                          {t.admin.extraEdit}
                          {u.extraPermissions.length > 0 ? ` (${u.extraPermissions.length})` : ''}
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => handleReset(u)}>
                        {t.users.resetPassword}
                      </Button>
                      {u.id !== me?.id && (
                        <Button
                          size="sm"
                          variant={u.status === 'ACTIVE' ? 'danger' : 'outline'}
                          onClick={() => handleToggle(u)}
                        >
                          {u.status === 'ACTIVE' ? t.users.disable : t.users.enable}
                        </Button>
                      )}
                    </td>
                  </tr>
                  {editingRights === u.id && (
                    <tr>
                      <td colSpan={5} className="p-0">
                        <PermissionsEditor
                          user={u}
                          busy={saveRights.isPending}
                          onSave={(p) => handleRights(u, p)}
                          onCancel={() => setEditingRights(null)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {pagination && lastPage > 1 && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            {t.common.previous}
          </Button>
          <span className="text-sm text-slate-600">
            {page} / {lastPage}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= lastPage}
            onClick={() => setPage(page + 1)}
          >
            {t.common.next}
          </Button>
        </div>
      )}
    </div>
  );
}
