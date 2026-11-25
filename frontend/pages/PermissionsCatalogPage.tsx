import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../services/api';
import { Permission, Role } from '../types';
import {
  Key,
  Shield,
  Search,
  Filter,
  RefreshCw,
  CheckCircle2,
  Lock,
  Layers,
  ArrowRight,
} from 'lucide-react';

interface PermissionsCatalogPageProps {
  onNavigate?: (route: string) => void;
}

export const PermissionsCatalogPage: React.FC<PermissionsCatalogPageProps> = ({ onNavigate }) => {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedModuleFilter, setSelectedModuleFilter] = useState('all');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all');

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [permsRes, rolesRes] = await Promise.all([
        api.listPermissions(),
        api.listRoles(),
      ]);

      if (permsRes.success && permsRes.data) {
        setPermissions(permsRes.data);
      } else {
        setError(permsRes.message || 'Failed to fetch permissions');
      }

      if (rolesRes.success && rolesRes.data) {
        setRoles(rolesRes.data);
      }
    } catch {
      setError('Failed to connect to the server.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const modules = useMemo(() => {
    const set = new Set<string>();
    permissions.forEach(p => {
      if (p.module) set.add(p.module);
    });
    return Array.from(set).sort();
  }, [permissions]);

  const filteredPermissions = useMemo(() => {
    return permissions.filter(p => {
      if (selectedModuleFilter !== 'all' && p.module !== selectedModuleFilter) return false;
      if (selectedCategoryFilter !== 'all' && p.category !== selectedCategoryFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const code = (p.code || '').toLowerCase();
        const name = (p.name || '').toLowerCase();
        const desc = (p.description || '').toLowerCase();
        const mod = (p.module || '').toLowerCase();

        return code.includes(q) || name.includes(q) || desc.includes(q) || mod.includes(q);
      }

      return true;
    });
  }, [permissions, searchQuery, selectedModuleFilter, selectedCategoryFilter]);

  // Group by module
  const groupedPermissions = useMemo(() => {
    const groups: Record<string, Permission[]> = {};
    filteredPermissions.forEach(p => {
      const mod = p.module || 'General';
      if (!groups[mod]) groups[mod] = [];
      groups[mod].push(p);
    });
    return groups;
  }, [filteredPermissions]);

  const getRolesForPermission = (permCode: string) => {
    return roles.filter(r => {
      if (r.code === 'super_admin') return true;
      return (r.permissions || []).includes(permCode) || (r.permissions || []).includes('*');
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
              <Key className="w-7 h-7 text-sky-600" />
              Permissions Catalog & Directory
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-800">
              {filteredPermissions.length} Active System Key{filteredPermissions.length !== 1 ? 's' : ''}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Authoritative registry of all system authorization capabilities, categorized by module and mapped to assigned roles.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 shadow-xs transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh Catalog
          </button>

          {onNavigate && (
            <button
              onClick={() => onNavigate('/roles')}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl bg-sky-600 hover:bg-sky-700 text-white shadow-sm transition-all"
            >
              <Shield className="w-4 h-4" />
              Open Roles & Matrix
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm">
          {error}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by permission code (e.g. users.view)..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9.5 pr-4 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span>Module:</span>
            <select
              value={selectedModuleFilter}
              onChange={e => setSelectedModuleFilter(e.target.value)}
              className="py-1.5 px-2.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-700 focus:outline-none"
            >
              <option value="all">All Modules</option>
              {modules.map(m => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
            <span>Category:</span>
            <select
              value={selectedCategoryFilter}
              onChange={e => setSelectedCategoryFilter(e.target.value)}
              className="py-1.5 px-2.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-700 focus:outline-none"
            >
              <option value="all">All Categories</option>
              <option value="action">Actions</option>
              <option value="menu">Navigation Menus</option>
              <option value="data">Data Access</option>
            </select>
          </div>
        </div>
      </div>

      {/* Permissions List */}
      {isLoading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-sm text-slate-500 flex flex-col items-center justify-center gap-3 shadow-xs">
          <div className="w-7 h-7 border-2 border-sky-600 border-t-transparent rounded-full animate-spin" />
          <span className="font-medium text-slate-600">Loading system catalog...</span>
        </div>
      ) : Object.keys(groupedPermissions).length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
          <Key className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-slate-800">No Permissions Found</h3>
          <p className="text-xs text-slate-500 mt-1">Try clearing your search query or filters.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedPermissions).map(([modName, perms]) => (
            <div key={modName} className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-6 py-3.5 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-sky-600" />
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">{modName} Module</h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">
                    {perms.length} key{perms.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {perms.map(p => {
                  const assignedRoles = getRolesForPermission(p.code);
                  return (
                    <div key={p.code} className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-bold font-mono text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md border border-sky-100">
                            {p.code}
                          </code>
                          <span className="text-xs font-semibold text-slate-800">{p.name}</span>
                          <span className="px-2 py-0.2 rounded text-[10px] uppercase font-bold bg-slate-100 text-slate-500">
                            {p.category}
                          </span>
                        </div>
                        {p.description && (
                          <p className="text-xs text-slate-500">{p.description}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] text-slate-400 font-semibold mr-1">Granted to:</span>
                        {assignedRoles.map(r => (
                          <span
                            key={r.id}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                              r.code === 'super_admin'
                                ? 'bg-purple-100 text-purple-700 border border-purple-200'
                                : r.code === 'admin'
                                ? 'bg-sky-100 text-sky-800 border border-sky-200'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            <Shield className="w-2.5 h-2.5" />
                            {r.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
