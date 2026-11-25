import React from 'react';
import { PageHeader } from '../components/common/PageHeader';
import {
  Clock,
  Layers,
  Shield,
  ArrowLeft,
  Calendar,
  Lock,
} from 'lucide-react';

interface FutureModulePageProps {
  moduleCode: string;
  onNavigate: (view: string) => void;
}

const moduleSpecs: Record<string, { title: string; moduleNum: string; desc: string; plannedFeatures: string[] }> = {
  workforce: {
    title: 'Workforce & Performance Monitoring',
    moduleNum: 'Module 5',
    desc: 'Tracks employee assignments, workstation allocation, task completion logs, and shift performance analytics.',
    plannedFeatures: [
      'Employee Master Directory & Branch Staffing',
      'Team & Departmental Hierarchy Management',
      'Workstation & Terminal Assignments',
      'Work Completion & Production Logging',
      'Real-time Efficiency & Performance Reports',
    ],
  },
  inventory: {
    title: 'Inventory Management',
    moduleNum: 'Module 6',
    desc: 'Centralized product and material catalog with multi-warehouse stock tracking, movements, and reorder triggers.',
    plannedFeatures: [
      'Multi-level Item Categories & Formulary Taxonomy',
      'Item SKU & Barcode Inventory Catalog',
      'Multi-location Real-time Stock Levels',
      'Stock In / Stock Out Movement Ledgers',
      'Automated Low-Stock Threshold Alerts',
    ],
  },
  suppliers: {
    title: 'Supplier Management',
    moduleNum: 'Module 7',
    desc: 'Vendor onboarding, compliance documentation, supplier contacts, and communication history logs.',
    plannedFeatures: [
      'Verified Supplier Master Directory',
      'Supplier Primary & Secondary Contacts',
      'Vendor SLA & Performance Evaluation',
      'Communication & Correspondence History',
      'Compliance & Regulatory Certification Storage',
    ],
  },
  purchases: {
    title: 'Purchase Requests & Supplier Approval',
    moduleNum: 'Module 8',
    desc: 'Requisition lifecycle from department request to multi-tier executive approval and supplier quotes.',
    plannedFeatures: [
      'Purchase Requisition Creation & Tracking',
      'Supplier Quotation & Response Comparison',
      'Multi-level Approval Workflow Matrix',
      'PO Generation & Budget Authorization',
    ],
  },
  'goods-receipt': {
    title: 'Goods Receipt & Stock Updates',
    moduleNum: 'Module 9',
    desc: 'Dock-to-shelf inspection, goods receipt notes (GRN), discrepancy management, and stock adjustments.',
    plannedFeatures: [
      'Goods Receipt Note (GRN) Processing',
      'Delivered vs Ordered Quantity Verification',
      'Damage & Discrepancy Reporting',
      'Automatic Inventory Ledger Updates',
    ],
  },
  reports: {
    title: 'Reports & Analytics',
    moduleNum: 'Module 10',
    desc: 'Cross-module business intelligence, customizable executive dashboards, and exportable financial summaries.',
    plannedFeatures: [
      'Workforce Productivity & Attendance Metrics',
      'Inventory Valuation & Turnover Reports',
      'Procurement Cost & Vendor Lead Time Analytics',
      'Custom Scheduled PDF & Excel Exports',
    ],
  },
  'admin-suite': {
    title: 'Audit, Notifications & System Settings',
    moduleNum: 'Module 11',
    desc: 'Enterprise security suite including deep audit logging, email queue delivery metrics, and system configuration.',
    plannedFeatures: [
      'Immutable Tamper-Evident Security Audit Logs',
      'SMTP Email Delivery & Bounce Diagnostics',
      'System-wide Broadcast & In-app Notifications',
      'Global Application Policy & Security Knobs',
    ],
  },
};

export const FutureModulePage: React.FC<FutureModulePageProps> = ({
  moduleCode,
  onNavigate,
}) => {
  // Extract root module key
  const rootKey = moduleCode.split('/')[0];
  const spec = moduleSpecs[rootKey] || {
    title: rootKey.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    moduleNum: 'Planned Module',
    desc: 'This module is planned as part of the Nexora enterprise expansion roadmap.',
    plannedFeatures: ['Feature architecture in specification', 'Database schema integration'],
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <PageHeader
        title={spec.title}
        subtitle={`${spec.moduleNum} — Planned architecture reserved for upcoming development phase.`}
        breadcrumbs={[spec.title, 'Planned Module']}
        onHomeClick={() => onNavigate('dashboard')}
      />

      <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-12 text-center space-y-6 shadow-xs overflow-hidden relative">
        <div className="w-16 h-16 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center mx-auto shadow-xs">
          <Clock className="w-8 h-8" />
        </div>

        <div className="max-w-xl mx-auto space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-100 text-slate-700">
            <Lock className="w-3.5 h-3.5 text-slate-500" />
            <span>{spec.moduleNum} Architectural Specification</span>
          </div>

          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Feature In Development Roadmap
          </h2>

          <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
            {spec.desc} The navigation hierarchy and database permissions are registered in PostgreSQL to support this module without application shell restructuring.
          </p>
        </div>

        {/* Planned Features List */}
        <div className="max-w-lg mx-auto p-6 rounded-2xl bg-slate-50/70 border border-slate-200/80 text-left space-y-3">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
            Scheduled Module Scope:
          </span>
          <ul className="space-y-2 text-xs text-slate-600">
            {spec.plannedFeatures.map((feat, idx) => (
              <li key={idx} className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0" />
                <span>{feat}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <button
            onClick={() => onNavigate('dashboard')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Return to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
};
