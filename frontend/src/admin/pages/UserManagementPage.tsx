
import { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../api/admin';
import { UserTable } from '../components/UserTable';
import { UserListResponse } from '../types';

export function UserManagementPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<UserListResponse>({ users: [], total: 0, limit: 50, offset: 0 });
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Debounce search
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminApi.getUsers({
        limit: 50,
        offset: page * 50,
        search: debouncedSearch,
        sortBy,
        sortDir
      });
      setData(response);
    } catch (err) {
      console.error(err);
      // TODO: error handling
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, sortBy, sortDir]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDir('asc');
    }
    setPage(0);
  };

  const totalPages = Math.ceil(data.total / 50);

  return (
    <div className="user-management-page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1>User Management</h1>
        <div className="search-box">
            <input 
                type="text" 
                placeholder="Search users..." 
                value={search}
                onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                }}
                style={{
                    padding: '8px 12px',
                    borderRadius: '4px',
                    border: '1px solid #333',
                    background: '#111',
                    color: 'white',
                    width: '300px'
                }}
            />
        </div>
      </div>

      <UserTable 
        users={data.users} 
        loading={loading} 
        onSort={handleSort}
        sortBy={sortBy}
        sortDir={sortDir}
      />

      <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#888' }}>
        <div>
            Showing {data.users.length > 0 ? (page * 50) + 1 : 0} - {Math.min((page + 1) * 50, data.total)} of {data.total}
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
            <button 
                disabled={page === 0} 
                onClick={() => setPage(p => p - 1)}
                style={{ padding: '5px 10px', background: '#333', color: 'white', border: 'none', borderRadius: '4px', cursor: page === 0 ? 'not-allowed' : 'pointer', opacity: page === 0 ? 0.5 : 1 }}
            >
                Prev
            </button>
            <span style={{ display: 'flex', alignItems: 'center' }}>Page {page + 1} of {totalPages || 1}</span>
            <button 
                disabled={page >= totalPages - 1} 
                onClick={() => setPage(p => p + 1)}
                style={{ padding: '5px 10px', background: '#333', color: 'white', border: 'none', borderRadius: '4px', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', opacity: page >= totalPages - 1 ? 0.5 : 1 }}
            >
                Next
            </button>
        </div>
      </div>
    </div>
  );
}
