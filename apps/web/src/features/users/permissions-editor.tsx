import { GRANTABLE_PERMISSIONS, type GrantablePermission, type UserDto } from '@isp/contracts';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n/i18n-context';

interface Props {
  user: UserDto;
  busy: boolean;
  onSave(permissions: GrantablePermission[]): void;
  onCancel(): void;
}

/** Tick-box list of the extra rights an admin may hand to one staff member. */
export function PermissionsEditor({ user, busy, onSave, onCancel }: Props) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<GrantablePermission[]>(user.extraPermissions);
  const toggle = (p: GrantablePermission) =>
    setSelected((now) => (now.includes(p) ? now.filter((x) => x !== p) : [...now, p]));

  return (
    <div className="space-y-3 bg-slate-50 p-4">
      <div>
        <p className="font-medium">
          {t.admin.extraTitle}: {user.fullName}
        </p>
        <p className="text-xs text-slate-500">{t.admin.extraHint}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {GRANTABLE_PERMISSIONS.map((p) => (
          <label key={p} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={selected.includes(p)}
              onChange={() => toggle(p)}
            />
            {t.admin.perms[p]}
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={busy} onClick={() => onSave(selected)}>
          {t.common.save}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          {t.common.cancel}
        </Button>
      </div>
    </div>
  );
}
