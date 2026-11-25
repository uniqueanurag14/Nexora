import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Check, Building2, Search, AlertCircle, X } from 'lucide-react';
import { Department } from '../types';
import { api } from '../services/api';

interface DepartmentSelectProps {
  value: string;
  onChange: (value: string) => void;
  departments?: Department[];
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  className?: string;
}

export const DepartmentSelect: React.FC<DepartmentSelectProps> = ({
  value,
  onChange,
  departments: propDepartments,
  disabled = false,
  required = false,
  placeholder = 'Select a department...',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [departments, setDepartments] = useState<Department[]>(propDepartments || []);
  const [isLoading, setIsLoading] = useState(!propDepartments);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (propDepartments) {
      setDepartments(propDepartments);
      setIsLoading(false);
    } else {
      let isMounted = true;
      setIsLoading(true);
      api.listDepartments()
        .then(res => {
          if (isMounted && res.success && res.data) {
            setDepartments(res.data);
          }
        })
        .catch(console.error)
        .finally(() => {
          if (isMounted) setIsLoading(false);
        });
      return () => {
        isMounted = false;
      };
    }
  }, [propDepartments]);

  const selectedDepartment = departments.find(
    d => d.name.toLowerCase() === (value || '').toLowerCase() || d.code.toLowerCase() === (value || '').toLowerCase()
  );

  const filteredDepartments = departments.filter(d =>
    d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (d.description && d.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setHighlightedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setSearchTerm('');
    }
  }, [isOpen]);

  const isDeptActive = (d: Department) => d.status === 'active' || d.is_active === true;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev =>
        prev < filteredDepartments.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = filteredDepartments[highlightedIndex];
      if (target) {
        if (!isDeptActive(target)) return;
        onChange(target.name);
        setIsOpen(false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  const handleSelect = (dept: Department) => {
    if (!isDeptActive(dept)) return;
    onChange(dept.name);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full ${className}`}
      onKeyDown={handleKeyDown}
    >
      {/* Hidden input for HTML form requirement validation if applicable */}
      <input
        type="text"
        className="sr-only"
        tabIndex={-1}
        required={required}
        value={value || ''}
        onChange={() => {}}
      />

      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-left transition-all ${
          disabled
            ? 'bg-slate-100/70 border-slate-200 text-slate-400 cursor-not-allowed'
            : isOpen
            ? 'bg-white border-[#0084CC] ring-2 ring-[#0084CC]/20 shadow-xs'
            : 'bg-white border-slate-200/90 hover:border-slate-300 text-[#101B32] shadow-xs'
        }`}
      >
        <div className="flex items-center gap-2.5 truncate">
          <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
          {selectedDepartment ? (
            <div className="flex items-center gap-2 truncate">
              <span className="font-semibold text-xs text-[#101B32] truncate">
                {selectedDepartment.name}
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 shrink-0">
                {selectedDepartment.code}
              </span>
              {!isDeptActive(selectedDepartment) && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-200 shrink-0">
                  Inactive
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs text-slate-400 truncate">
              {isLoading ? 'Loading departments...' : placeholder}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-2">
          {value && !disabled && (
            <div
              role="button"
              tabIndex={0}
              onClick={handleClear}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              title="Clear selection"
            >
              <X className="w-3.5 h-3.5" />
            </div>
          )}
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-[#0084CC]' : ''
            }`}
          />
        </div>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Search box inside dropdown */}
          <div className="p-2 border-b border-slate-100 bg-slate-50/50">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search departments by name or code..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0084CC] focus:border-[#0084CC]"
              />
            </div>
          </div>

          {/* Department Items */}
          <ul
            ref={listRef}
            role="listbox"
            className="max-h-56 overflow-y-auto py-1 text-xs divide-y divide-slate-50"
          >
            {filteredDepartments.length === 0 ? (
              <li className="p-4 text-center text-slate-400 flex flex-col items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-slate-300" />
                <span>
                  {searchTerm.trim()
                    ? `No departments match "${searchTerm}"`
                    : 'No departments available'}
                </span>
              </li>
            ) : (
              filteredDepartments.map((dept, index) => {
                const isSelected =
                  dept.name.toLowerCase() === (value || '').toLowerCase() ||
                  dept.code.toLowerCase() === (value || '').toLowerCase();
                const isHighlighted = index === highlightedIndex;

                return (
                  <li
                    key={dept.id}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={!isDeptActive(dept)}
                    onClick={() => handleSelect(dept)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`px-3 py-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                      !isDeptActive(dept)
                        ? 'opacity-50 cursor-not-allowed bg-slate-50/50'
                        : isHighlighted
                        ? 'bg-sky-50/80 text-[#0084CC]'
                        : isSelected
                        ? 'bg-sky-50/40 text-[#101B32]'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex flex-col gap-0.5 min-w-0 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold truncate">{dept.name}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 shrink-0">
                          {dept.code}
                        </span>
                        {!isDeptActive(dept) && (
                          <span className="text-[9px] font-bold px-1 rounded bg-rose-100 text-rose-700">
                            Inactive
                          </span>
                        )}
                      </div>
                      {dept.description && (
                        <p className="text-[11px] text-slate-400 truncate">
                          {dept.description}
                        </p>
                      )}
                    </div>

                    {isSelected && (
                      <Check className="w-4 h-4 text-[#0084CC] shrink-0" />
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
};
