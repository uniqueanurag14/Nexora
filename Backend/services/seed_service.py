"""
Nexora PostgreSQL Initial Seed Service
Seeds system settings, RBAC permissions, and database-driven navigation menus
idempotently without destroying existing user customization.
"""

from sqlalchemy.orm import Session
from Backend.core.logging import logger
from Backend.models.menu import MenuItem, Permission, RolePermission
from Backend.models.setting import SystemSetting


class SeedService:
    @classmethod
    def seed_all(cls, db: Session) -> None:
        cls.seed_settings(db)
        cls.seed_permissions_and_roles(db)
        cls.seed_menus(db)

    @classmethod
    def seed_settings(cls, db: Session) -> None:
        default_settings = [
            ("app_name", "Nexora", "general", "Application display title", True),
            ("timezone", "Asia/Kolkata", "general", "Default application timezone", True),
            ("date_format", "DD/MM/YYYY", "display", "Display format for calendar dates", True),
            ("session_timeout_minutes", "15", "security", "Inactivity timeout for user sessions", False),
        ]
        for key, val, cat, desc, pub in default_settings:
            existing = db.query(SystemSetting).filter(SystemSetting.key == key).first()
            if not existing:
                db.add(
                    SystemSetting(
                        key=key,
                        value=val,
                        category=cat,
                        description=desc,
                        is_public=pub,
                        updated_by="System Initializer",
                    )
                )
        db.commit()

    @classmethod
    def seed_permissions_and_roles(cls, db: Session) -> None:
        from Backend.models.role import Role

        # 1. Seed Roles
        roles_to_seed = [
            ("super_admin", "Super Administrator", "Full unrestricted administrative access across the platform", True),
            ("admin", "Administrator", "Operational administration, user management, and module oversight", True),
            ("user", "Standard User", "Standard employee/user access to dashboard and personal profile", True),
            ("auditor", "Auditor", "Read-only access to audit trails, activity logs, and system reports", False),
            ("performance_user", "Performance User", "Dedicated workforce performance monitoring, employee registration, and shop floor tracking", True),
        ]
        for code, name, desc, is_sys in roles_to_seed:
            existing_role = db.query(Role).filter(Role.code == code).first()
            if not existing_role:
                db.add(Role(code=code, name=name, description=desc, is_system=is_sys, is_active=True))
        db.commit()

        # 2. Seed Permissions
        permissions = [
            # Standard Module 3 Fine-Grained Permissions
            ("users.view", "View Users and Employees", "Users", "action"),
            ("users.create", "Create User and Employee Accounts", "Users", "action"),
            ("users.update", "Update User Details & Permissions", "Users", "action"),
            ("users.delete", "Deactivate or Delete User Accounts", "Users", "action"),
            ("roles.view", "View System Roles and Permissions", "Roles", "action"),
            ("roles.create", "Create Custom System Roles", "Roles", "action"),
            ("roles.update", "Edit Roles & Permission Mappings", "Roles", "action"),
            ("roles.delete", "Delete Custom System Roles", "Roles", "action"),
            ("permissions.view", "View Permission Directory", "Permissions", "action"),
            ("permissions.assign", "Assign Permissions to Roles", "Permissions", "action"),
            ("profile.view", "View Own Profile", "Profile", "action"),
            ("profile.update", "Update Own Profile", "Profile", "action"),
            ("security.password.change", "Change Own Password", "Profile", "action"),
            ("security.password.reset", "Reset Account Password", "Profile", "action"),
            ("dashboard.view", "View Role-Based Dashboard", "Dashboard", "menu"),
            ("settings.view", "View System Settings", "Settings", "menu"),
            ("settings.update", "Update System Settings", "Settings", "action"),
            ("backups.manage", "Manage Database Backups", "Settings", "action"),
            ("sessions.manage", "View & Revoke Active Sessions", "Settings", "action"),

            # Performance Management Permissions
            ("performance.view", "View Live Performance & Work Events", "Performance", "action"),
            ("performance.manage", "Register and Manage Performance Employees", "Performance", "action"),
            ("performance.simulate", "Simulate Hardware Work Events", "Performance", "action"),
            ("performance.export", "Export Performance Reports to CSV", "Performance", "action"),

            # Menu & Navigation Permissions
            ("menu.dashboard", "View Dashboard", "Dashboard", "menu"),
            ("menu.workforce", "Access Workforce Module", "Workforce", "menu"),
            ("menu.inventory", "Access Inventory Module", "Inventory", "menu"),
            ("menu.suppliers", "Access Suppliers Module", "Suppliers", "menu"),
            ("menu.purchasing", "Access Purchasing Module", "Purchasing", "menu"),
            ("menu.goods_receipt", "Access Goods Receipt Module", "Goods Receipt", "menu"),
            ("menu.reports", "Access Reports Module", "Reports", "menu"),
            ("menu.audit_system", "Access System Audit & Settings", "Audit", "menu"),
            ("menu.settings", "Access General Settings", "Settings", "menu"),
            ("menu.profile", "Access My Profile", "Profile", "menu"),
            ("menu.change_password", "Access Change Password", "Profile", "menu"),
            ("action.profile_update", "Update Own Profile (Legacy)", "Profile", "action"),
            ("action.password_change", "Change Own Password (Legacy)", "Profile", "action"),
            ("action.settings_update", "Update System Settings (Legacy)", "Settings", "action"),
            ("action.backup_manage", "Manage Database Backups (Legacy)", "Settings", "action"),
            ("action.session_revoke", "Revoke Active Sessions (Legacy)", "Settings", "action"),
            ("action.users_view", "View All User Accounts (Legacy)", "Users", "data"),
        ]

        for code, name, module, cat in permissions:
            existing = db.query(Permission).filter(Permission.code == code).first()
            if not existing:
                db.add(Permission(code=code, name=name, module=module, category=cat))
        db.commit()

        # 3. Seed Role-Permission Assignments
        all_perm_codes = [p[0] for p in permissions]
        role_assignments = {
            "super_admin": all_perm_codes,
            "admin": [
                "users.view", "users.create", "users.update", "users.delete",
                "roles.view", "roles.create", "roles.update",
                "permissions.view", "permissions.assign",
                "profile.view", "profile.update", "security.password.change",
                "dashboard.view", "menu.dashboard", "menu.workforce", "menu.inventory",
                "menu.suppliers", "menu.purchasing", "menu.goods_receipt", "menu.reports",
                "menu.profile", "menu.change_password", "action.profile_update",
                "action.password_change", "action.users_view",
                "performance.view", "performance.manage", "performance.simulate", "performance.export",
            ],
            "user": [
                "profile.view", "profile.update", "security.password.change",
                "dashboard.view", "menu.dashboard", "menu.profile", "menu.change_password",
                "action.profile_update", "action.password_change"
            ],
            "auditor": [
                "users.view", "roles.view", "permissions.view", "profile.view",
                "dashboard.view", "settings.view", "menu.dashboard", "menu.reports",
                "menu.audit_system", "menu.settings", "menu.profile", "action.users_view",
                "performance.view", "performance.export",
            ],
            "performance_user": [
                "menu.dashboard",
                "dashboard.view",
                "menu.workforce",
                "performance.view",
                "performance.manage",
                "performance.simulate",
                "performance.export",
                "profile.view",
                "profile.update",
                "security.password.change",
                "menu.profile",
                "menu.change_password",
            ],
        }

        for role_code, perm_codes in role_assignments.items():
            for code in perm_codes:
                exists = (
                    db.query(RolePermission)
                    .filter(RolePermission.role == role_code, RolePermission.permission_code == code)
                    .first()
                )
                if not exists:
                    db.add(RolePermission(role=role_code, permission_code=code))
        db.commit()

    @classmethod
    def seed_menus(cls, db: Session) -> None:
        menus = [
            ("dash_main", "Dashboard", "LayoutDashboard", "/dashboard", None, 1, "menu.dashboard", "core", True),
            ("wf_main", "Workforce & Monitoring", "Users", "/workforce", None, 2, "menu.workforce", "module5", False),
            ("wf_emp", "Employee Management", "UserCheck", "/workforce/employees", "wf_main", 1, "menu.workforce", "module5", False),
            ("wf_team", "Team Management", "Network", "/workforce/teams", "wf_main", 2, "menu.workforce", "module5", False),
            ("wf_ws", "Workstation Assignments", "Monitor", "/workforce/workstations", "wf_main", 3, "menu.workforce", "module5", False),
            ("wf_comp", "Work Completion", "CheckSquare", "/workforce/completion", "wf_main", 4, "menu.workforce", "module5", False),
            ("wf_rep", "Performance Reports", "BarChart2", "/workforce/reports", "wf_main", 5, "menu.workforce", "module5", False),
            ("inv_main", "Inventory Management", "Package", "/inventory", None, 3, "menu.inventory", "module6", False),
            ("inv_cat", "Categories", "FolderTree", "/inventory/categories", "inv_main", 1, "menu.inventory", "module6", False),
            ("inv_items", "Items", "Layers", "/inventory/items", "inv_main", 2, "menu.inventory", "module6", False),
            ("inv_lvl", "Stock Levels", "TrendingUp", "/inventory/levels", "inv_main", 3, "menu.inventory", "module6", False),
            ("inv_mov", "Stock Movements", "ArrowLeftRight", "/inventory/movements", "inv_main", 4, "menu.inventory", "module6", False),
            ("inv_alt", "Low-Stock Alerts", "AlertTriangle", "/inventory/alerts", "inv_main", 5, "menu.inventory", "module6", False),
            ("sup_main", "Supplier Management", "Truck", "/suppliers", None, 4, "menu.suppliers", "module7", False),
            ("sup_list", "Suppliers", "Building2", "/suppliers/list", "sup_main", 1, "menu.suppliers", "module7", False),
            ("sup_cont", "Supplier Contacts", "Contact", "/suppliers/contacts", "sup_main", 2, "menu.suppliers", "module7", False),
            ("prof_main", "My Profile", "User", "/profile", None, 8, "menu.profile", "core", True),
            ("prof_pwd", "Change Password", "KeyRound", "/profile/password", "prof_main", 1, "menu.change_password", "core", True),
            ("sett_main", "System Settings", "Settings", "/settings", None, 9, "menu.settings", "core", True),
            ("sett_audit", "Audit Trail", "ShieldCheck", "/settings/audit", "sett_main", 1, "menu.audit_system", "core", True),
            ("sett_sess", "Active Sessions", "Activity", "/settings/sessions", "sett_main", 2, "menu.settings", "core", True),
            ("sett_bk", "Database Backups", "Database", "/settings/backups", "sett_main", 3, "action.backup_manage", "core", True),
        ]

        for code, label, icon, route, parent_code, order, perm, tag, impl in menus:
            existing = db.query(MenuItem).filter(MenuItem.code == code).first()
            if not existing:
                db.add(
                    MenuItem(
                        code=code,
                        label=label,
                        icon=icon,
                        route=route,
                        parent_code=parent_code,
                        display_order=order,
                        required_permission=perm,
                        module_tag=tag,
                        is_implemented=impl,
                        is_active=True,
                    )
                )
        db.commit()
