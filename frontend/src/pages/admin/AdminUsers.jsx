import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '../../api/client';
import { Loading, ErrorState, EmptyState, ConfirmDialog } from '../../components/Ui';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { formatDateTime } from '../../utils/format';

/**
 * User administration is deliberately narrow: role and account status only.
 * The API does not expose phone numbers or request contents here.
 */
export default function AdminUsers() {
  const toast = useToast();
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await adminApi.listUsers({ limit: 200 });
      setUsers(data.users);
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const apply = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const { user, changes } = pending;
      const data = await adminApi.updateUser(user.id, changes);
      setUsers((list) => list.map((u) => (u.id === user.id ? { ...u, ...data.user } : u)));
      toast.success(`${user.name} updated`);
      setPending(null);
    } catch (err) {
      toast.error(err.message);
      setPending(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shell page">
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: '1.9rem' }}>Users</h1>
          <p>
            Grant or remove administrator access and deactivate accounts. Deactivation takes
            effect immediately, including for anyone already signed in.
          </p>
        </div>
      </div>

      {error && <ErrorState error={error} onRetry={load} />}

      {users === null && !error ? (
        <Loading label="Loading users" />
      ) : users && users.length === 0 ? (
        <div className="panel">
          <EmptyState title="No users registered">
            Accounts will appear here once people sign up.
          </EmptyState>
        </div>
      ) : (
        users && (
          <div className="panel panel-flush">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Requests</th>
                    <th>Status</th>
                    <th>Joined</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const isSelf = u.id === currentUser.id;
                    return (
                      <tr key={u.id} style={!u.isActive ? { opacity: 0.6 } : undefined}>
                        <td style={{ fontWeight: 600 }}>
                          {u.name}
                          {isSelf && (
                            <span className="badge badge-action" style={{ marginLeft: 8 }}>
                              You
                            </span>
                          )}
                        </td>
                        <td className="small">{u.email}</td>
                        <td>
                          <span className={`badge badge-${u.role === 'admin' ? 'action' : 'neutral'}`}>
                            {u.role === 'admin' ? 'Administrator' : 'User'}
                          </span>
                        </td>
                        <td className="num">{u.requestCount}</td>
                        <td>
                          <span className={`badge badge-${u.isActive ? 'available' : 'closed'}`}>
                            {u.isActive ? 'Active' : 'Deactivated'}
                          </span>
                        </td>
                        <td className="small muted">{formatDateTime(u.createdAt)}</td>
                        <td>
                          {isSelf ? (
                            <span className="tiny muted">Cannot edit own account</span>
                          ) : (
                            <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                              <button
                                type="button"
                                className="btn btn-sm btn-secondary"
                                onClick={() =>
                                  setPending({
                                    user: u,
                                    changes: { role: u.role === 'admin' ? 'user' : 'admin' },
                                    title:
                                      u.role === 'admin'
                                        ? 'Remove administrator access?'
                                        : 'Grant administrator access?',
                                    message:
                                      u.role === 'admin'
                                        ? `${u.name} will lose access to shelter management and all administrative areas.`
                                        : `${u.name} will be able to manage shelters, view every emergency request, and change other users' roles.`,
                                    confirmLabel: u.role === 'admin' ? 'Remove access' : 'Grant access'
                                  })
                                }
                              >
                                {u.role === 'admin' ? 'Make user' : 'Make admin'}
                              </button>
                              <button
                                type="button"
                                className={`btn btn-sm ${u.isActive ? 'btn-danger' : 'btn-ghost'}`}
                                onClick={() =>
                                  setPending({
                                    user: u,
                                    changes: { isActive: !u.isActive },
                                    title: u.isActive ? 'Deactivate this account?' : 'Reactivate this account?',
                                    message: u.isActive
                                      ? `${u.name} will be signed out immediately and will not be able to log in or submit requests.`
                                      : `${u.name} will be able to log in and submit requests again.`,
                                    confirmLabel: u.isActive ? 'Deactivate' : 'Reactivate'
                                  })
                                }
                              >
                                {u.isActive ? 'Deactivate' : 'Reactivate'}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {pending && (
        <ConfirmDialog
          title={pending.title}
          message={pending.message}
          confirmLabel={pending.confirmLabel}
          tone={pending.changes.isActive === false ? 'danger' : 'primary'}
          busy={busy}
          onConfirm={apply}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}
