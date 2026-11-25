"""
Nexora Database-Driven Navigation API
Serves dynamic, permission-aware menu structures for desktop and mobile navigation.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from Backend.api.deps import get_current_user
from Backend.core.database import get_db
from Backend.models.menu import MenuItem
from Backend.models.user import User
from Backend.schemas.response import APIResponse

router = APIRouter(prefix="/navigation", tags=["Navigation"])


class MenuItemDTO(BaseModel):
    id: int
    code: str
    label: str
    icon: str
    route: Optional[str] = None
    parent_code: Optional[str] = None
    display_order: int
    required_permission: Optional[str] = None
    is_active: bool
    is_future_module: bool
    module_badge: Optional[str] = None
    children: List["MenuItemDTO"] = []


# Required menu hierarchy seed data according to Section 8
DEFAULT_MENU_HIERARCHY = [
    {"code": "dashboard", "label": "Dashboard", "icon": "LayoutDashboard", "route": "/dashboard", "parent_code": None, "display_order": 1, "is_future": False},
    
    # Module 5 — Workforce & Performance Monitoring
    {"code": "module5", "label": "Workforce & Performance Monitoring", "icon": "Users", "route": "/workforce", "parent_code": None, "display_order": 2, "is_future": True, "badge": "Module 5"},
    {"code": "m5_employees", "label": "Employee Management", "icon": "UserCheck", "route": "/workforce/employees", "parent_code": "module5", "display_order": 1, "is_future": True},
    {"code": "m5_teams", "label": "Team Management", "icon": "Network", "route": "/workforce/teams", "parent_code": "module5", "display_order": 2, "is_future": True},
    {"code": "m5_workstations", "label": "Workstation Assignments", "icon": "Monitor", "route": "/workforce/workstations", "parent_code": "module5", "display_order": 3, "is_future": True},
    {"code": "m5_work_completion", "label": "Work Completion", "icon": "CheckSquare", "route": "/workforce/work-completion", "parent_code": "module5", "display_order": 4, "is_future": True},
    {"code": "m5_performance_reports", "label": "Performance Reports", "icon": "TrendingUp", "route": "/workforce/performance-reports", "parent_code": "module5", "display_order": 5, "is_future": True},

    # Module 6 — Inventory Management
    {"code": "module6", "label": "Inventory Management", "icon": "Boxes", "route": "/inventory", "parent_code": None, "display_order": 3, "is_future": True, "badge": "Module 6"},
    {"code": "m6_categories", "label": "Categories", "icon": "FolderTree", "route": "/inventory/categories", "parent_code": "module6", "display_order": 1, "is_future": True},
    {"code": "m6_items", "label": "Items", "icon": "Package", "route": "/inventory/items", "parent_code": "module6", "display_order": 2, "is_future": True},
    {"code": "m6_stock_levels", "label": "Stock Levels", "icon": "BarChart3", "route": "/inventory/stock-levels", "parent_code": "module6", "display_order": 3, "is_future": True},
    {"code": "m6_stock_movements", "label": "Stock Movements", "icon": "ArrowLeftRight", "route": "/inventory/stock-movements", "parent_code": "module6", "display_order": 4, "is_future": True},
    {"code": "m6_low_stock", "label": "Low-Stock Alerts", "icon": "AlertTriangle", "route": "/inventory/low-stock-alerts", "parent_code": "module6", "display_order": 5, "is_future": True},

    # Module 7 — Supplier Management
    {"code": "module7", "label": "Supplier Management", "icon": "Truck", "route": "/suppliers", "parent_code": None, "display_order": 4, "is_future": True, "badge": "Module 7"},
    {"code": "m7_suppliers", "label": "Suppliers", "icon": "Building2", "route": "/suppliers/directory", "parent_code": "module7", "display_order": 1, "is_future": True},
    {"code": "m7_contacts", "label": "Supplier Contacts", "icon": "Contact", "route": "/suppliers/contacts", "parent_code": "module7", "display_order": 2, "is_future": True},
    {"code": "m7_history", "label": "Communication History", "icon": "MessageSquare", "route": "/suppliers/communication-history", "parent_code": "module7", "display_order": 3, "is_future": True},

    # Module 8 — Purchase Requests & Supplier Approval
    {"code": "module8", "label": "Purchase Requests & Supplier Approval", "icon": "FileCheck", "route": "/purchases", "parent_code": None, "display_order": 5, "is_future": True, "badge": "Module 8"},
    {"code": "m8_purchase_requests", "label": "Purchase Requests", "icon": "FileText", "route": "/purchases/requests", "parent_code": "module8", "display_order": 1, "is_future": True},
    {"code": "m8_supplier_responses", "label": "Supplier Responses", "icon": "ReplyAll", "route": "/purchases/supplier-responses", "parent_code": "module8", "display_order": 2, "is_future": True},
    {"code": "m8_approval_status", "label": "Approval Status", "icon": "ShieldAlert", "route": "/purchases/approval-status", "parent_code": "module8", "display_order": 3, "is_future": True},

    # Module 9 — Goods Receipt & Stock Updates
    {"code": "module9", "label": "Goods Receipt & Stock Updates", "icon": "ClipboardCheck", "route": "/goods-receipt", "parent_code": None, "display_order": 6, "is_future": True, "badge": "Module 9"},
    {"code": "m9_goods_receipts", "label": "Goods Receipts", "icon": "FilePlus", "route": "/goods-receipt/receipts", "parent_code": "module9", "display_order": 1, "is_future": True},
    {"code": "m9_quantities", "label": "Received Quantities", "icon": "Layers", "route": "/goods-receipt/quantities", "parent_code": "module9", "display_order": 2, "is_future": True},
    {"code": "m9_discrepancies", "label": "Discrepancies", "icon": "FileWarning", "route": "/goods-receipt/discrepancies", "parent_code": "module9", "display_order": 3, "is_future": True},
    {"code": "m9_stock_adjustments", "label": "Stock Adjustments", "icon": "SlidersHorizontal", "route": "/goods-receipt/stock-adjustments", "parent_code": "module9", "display_order": 4, "is_future": True},

    # Module 10 — Reports & Analytics
    {"code": "module10", "label": "Reports & Analytics", "icon": "PieChart", "route": "/reports", "parent_code": None, "display_order": 7, "is_future": True, "badge": "Module 10"},
    {"code": "m10_workforce_reports", "label": "Workforce Reports", "icon": "Users2", "route": "/reports/workforce", "parent_code": "module10", "display_order": 1, "is_future": True},
    {"code": "m10_inventory_reports", "label": "Inventory Reports", "icon": "Boxes", "route": "/reports/inventory", "parent_code": "module10", "display_order": 2, "is_future": True},
    {"code": "m10_purchasing_reports", "label": "Purchasing Reports", "icon": "BadgePercent", "route": "/reports/purchasing", "parent_code": "module10", "display_order": 3, "is_future": True},

    # Module 11 — Audit, Notifications & System Settings
    {"code": "module11", "label": "Audit, Notifications & System Settings", "icon": "Shield", "route": "/admin-suite", "parent_code": None, "display_order": 8, "is_future": True, "badge": "Module 11"},
    {"code": "m11_audit_logs", "label": "Audit Logs", "icon": "History", "route": "/admin-suite/audit-logs", "parent_code": "module11", "display_order": 1, "is_future": True},
    {"code": "m11_email_logs", "label": "Email Delivery Logs", "icon": "MailCheck", "route": "/admin-suite/email-delivery-logs", "parent_code": "module11", "display_order": 2, "is_future": True},
    {"code": "m11_notifications", "label": "Notifications", "icon": "Bell", "route": "/admin-suite/notifications", "parent_code": "module11", "display_order": 3, "is_future": True},
    {"code": "m11_app_settings", "label": "Application Settings", "icon": "Settings2", "route": "/admin-suite/app-settings", "parent_code": "module11", "display_order": 4, "is_future": True},

    # Settings
    {"code": "settings", "label": "Settings", "icon": "Settings", "route": "/settings", "parent_code": None, "display_order": 9, "is_future": False},
    {"code": "settings_general", "label": "General Settings", "icon": "Sliders", "route": "/settings/general", "parent_code": "settings", "display_order": 1, "is_future": False},
    {"code": "settings_notifications", "label": "Notifications", "icon": "BellRing", "route": "/settings/notifications", "parent_code": "settings", "display_order": 2, "is_future": False},
    {"code": "settings_audit", "label": "Audit Trail", "icon": "FileSpreadsheet", "route": "/settings/audit", "parent_code": "settings", "display_order": 3, "is_future": False},
    {"code": "settings_backups", "label": "Database Backups", "icon": "HardDriveDownload", "route": "/settings/backups", "parent_code": "settings", "display_order": 4, "is_future": False},
    {"code": "settings_sessions", "label": "Active Sessions", "icon": "Laptop", "route": "/settings/sessions", "parent_code": "settings", "display_order": 5, "is_future": False},

    # Account
    {"code": "my_profile", "label": "My Profile", "icon": "User", "route": "/profile", "parent_code": None, "display_order": 10, "is_future": False},
    {"code": "change_password", "label": "Change Password", "icon": "KeyRound", "route": "/change-password", "parent_code": None, "display_order": 11, "is_future": False},
]


def ensure_menu_seed(db: Session):
    """Ensures database contains the default menu items."""
    count = db.query(MenuItem).count()
    if count == 0:
        for item in DEFAULT_MENU_HIERARCHY:
            m = MenuItem(
                code=item["code"],
                label=item["label"],
                icon=item["icon"],
                route=item.get("route"),
                parent_code=item.get("parent_code"),
                display_order=item["display_order"],
                is_active=True,
                is_future_module=item.get("is_future", False),
                module_badge=item.get("badge"),
            )
            db.add(m)
        db.commit()


@router.get("/menu", response_model=APIResponse[List[MenuItemDTO]])
def get_user_navigation(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns hierarchical navigation items based on user's role and granular permissions.
    Regular users do not see administrative or restricted menu trees.
    """
    ensure_menu_seed(db)
    items = db.query(MenuItem).filter(MenuItem.is_active == True).order_by(MenuItem.display_order.asc()).all()

    # RBAC filter:
    # super_admin sees all items
    # admin sees dashboard, modules, settings (except database backups if restricted)
    # user sees dashboard, profile, change password, and non-administrative routes
    is_super = current_user.role == "super_admin"
    is_admin = current_user.role in ("super_admin", "admin")

    parents: List[MenuItemDTO] = []
    child_map: dict[str, List[MenuItemDTO]] = {}

    for item in items:
        # Permission filter
        if item.code.startswith("settings") and item.code != "settings_sessions" and not is_admin:
            continue
        if item.code == "settings_backups" and not is_super:
            continue
        if item.code == "module11" and not is_admin:
            continue

        dto = MenuItemDTO(
            id=item.id,
            code=item.code,
            label=item.label,
            icon=item.icon,
            route=item.route,
            parent_code=item.parent_code,
            display_order=item.display_order,
            required_permission=item.required_permission,
            is_active=item.is_active,
            is_future_module=not getattr(item, "is_implemented", True) if hasattr(item, "is_implemented") else getattr(item, "is_future_module", False),
            module_badge=getattr(item, "module_badge", getattr(item, "module_tag", None)),
            children=[],
        )

        if not item.parent_code:
            parents.append(dto)
        else:
            child_map.setdefault(item.parent_code, []).append(dto)

    # Attach children to parents
    for parent in parents:
        parent.children = sorted(child_map.get(parent.code, []), key=lambda x: x.display_order)

    return APIResponse.ok(
        data=parents,
        message="Navigation menu loaded successfully.",
    )
