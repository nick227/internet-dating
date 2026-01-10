
import { AdminUser } from '../types';

interface UserTableProps {
  users: AdminUser[];
  loading: boolean;
  onSort: (field: string) => void;
  sortBy: string;
  sortDir: 'asc' | 'desc';
}

export function UserTable({ users, loading, onSort, sortBy, sortDir }: UserTableProps) {
  const renderSortIcon = (field: string) => {
    if (sortBy !== field) return <span style={{ opacity: 0.3 }}>⇅</span>;
    return sortDir === 'asc' ? '↑' : '↓';
  };

  const headers = [
    { key: 'createdAt', label: 'Joined' },
    { key: 'name', label: 'User' },
    { key: 'email', label: 'Email' },
    { key: 'role', label: 'Role' },
  ];

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>Loading users...</div>;
  }

  if (users.length === 0) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>No users found matching your criteria.</div>;
  }

  return (
    <div className="admin-table-container" style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', color: '#eee' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #333', textAlign: 'left' }}>
            {headers.map(h => (
              <th 
                key={h.key}
                onClick={() => onSort(h.key)}
                style={{ 
                  padding: '1rem', 
                  cursor: 'pointer', 
                  userSelect: 'none',
                  whiteSpace: 'nowrap'
                }}
              >
                {h.label} {renderSortIcon(h.key)}
              </th>
            ))}
            <th style={{ padding: '1rem' }}>Stats (Posts / Int / Quiz / Match)</th>
            <th style={{ padding: '1rem' }}>Location</th>
          </tr>
        </thead>
        <tbody>
          {users.map(user => (
            <tr key={user.id} style={{ borderBottom: '1px solid #222' }}>
              <td style={{ padding: '0.75rem 1rem', color: '#888', whiteSpace: 'nowrap' }}>
                {new Date(user.createdAt).toLocaleDateString()}
              </td>
              <td style={{ padding: '0.75rem 1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {user.profile?.avatarUrl ? (
                    <img 
                      src={user.profile.avatarUrl} 
                      alt="avatar" 
                      style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#333' }} />
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 500 }}>{user.profile?.displayName || 'No Profile'}</span>
                    <span style={{ fontSize: '0.8em', color: '#888' }}>ID: {user.id}</span>
                  </div>
                </div>
              </td>
              <td style={{ padding: '0.75rem 1rem', color: '#aaa' }}>
                {user.email}
              </td>
              <td style={{ padding: '0.75rem 1rem' }}>
                <span style={{ 
                  padding: '2px 6px', 
                  borderRadius: '4px', 
                  fontSize: '0.8em',
                  background: user.role === 'ADMIN' ? '#4a1d96' : '#222',
                  color: user.role === 'ADMIN' ? '#d8b4fe' : '#ccc'
                }}>
                  {user.role}
                </span>
              </td>
              <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace' }}>
                 {user.stats.posts} / {user.stats.interests} / {user.stats.quizzes} / {user.stats.matches}
              </td>
              <td style={{ padding: '0.75rem 1rem', color: '#aaa' }}>
                {user.profile?.location ? (
                    <span>{user.profile.location} {user.profile.age ? `(${user.profile.age})` : ''}</span>
                ) : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
