import express, { Request, Response, NextFunction } from 'express';
import { getPool, DatabaseUnavailableError } from './db';
import { runtimeConfig } from './config/runtimeConfig';

type AuthMiddleware = (req: any, res: Response, next: NextFunction) => any;
type PermMiddlewareFactory = (permission: string) => (req: any, res: Response, next: NextFunction) => any;

function getPgOrThrow() {
  if (process.env.DISABLE_PG_FOR_TESTS === 'true') {
    throw new DatabaseUnavailableError('PostgreSQL is disabled in isolated test mode.');
  }
  if (!runtimeConfig.databaseUrl && !process.env.DATABASE_URL) {
    throw new DatabaseUnavailableError(
      'PostgreSQL database is not configured. Configure DATABASE_URL in .env and run "npm run db:update".'
    );
  }
  return getPool();
}

function handleErpError(res: Response, err: any, context: string) {
  if (err instanceof DatabaseUnavailableError || err?.code === 'DB_UNAVAILABLE') {
    return res.status(503).json({
      success: false,
      code: 'DB_UNAVAILABLE',
      message: err.message,
    });
  }
  if (err?.code === 'ECONNREFUSED' || err?.code === 'ENOTFOUND' || err?.code === 'ETIMEDOUT' || err?.code === '28P01') {
    return res.status(503).json({
      success: false,
      code: 'DB_UNAVAILABLE',
      message: 'Unable to connect to PostgreSQL. Verify DATABASE_URL and ensure PostgreSQL is running.',
    });
  }
  if (err?.code === '42P01' || err?.code === '42703') {
    return res.status(503).json({
      success: false,
      code: 'SCHEMA_UPDATE_REQUIRED',
      message: 'Required PostgreSQL table or column is missing. Please run "npm run db:update" manually to update the schema.',
    });
  }
  if (err?.code === '23505') {
    return res.status(409).json({
      success: false,
      message: 'A record with this unique code or number already exists.',
    });
  }
  if (err?.code === '23503') {
    return res.status(400).json({
      success: false,
      message: 'Referenced record does not exist or is still linked to dependent records.',
    });
  }
  console.error(`[ERP PostgreSQL Error - ${context}]:`, err?.message || err);
  return res.status(500).json({
    success: false,
    message: `Database operation failed while processing ${context}.`,
  });
}

function actorLabel(req: any): string {
  return req.user?.email || req.user?.username || 'system';
}

function toNumber(val: any, fallback = 0): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function makeDocNo(prefix: string): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rnd = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${y}${m}${d}-${rnd}`;
}

export function createErpRouter(
  authenticateToken: AuthMiddleware,
  requirePermission: PermMiddlewareFactory
) {
  const router = express.Router();

  // ==========================================================================
  // 1. SUPPLIER EXTENSIONS: CONTACTS, AGREEMENTS, HISTORY
  // ==========================================================================

  router.get('/suppliers/:supplierId/contacts', authenticateToken, requirePermission('suppliers.view'), async (req: any, res: Response) => {
    try {
      const supplierId = parseInt(req.params.supplierId, 10);
      if (!Number.isFinite(supplierId)) return res.status(400).json({ success: false, message: 'Invalid supplier ID.' });
      const pool = getPgOrThrow();
      const result = await pool.query(
        `SELECT * FROM supplier_contacts WHERE supplier_id = $1 ORDER BY is_primary DESC, id DESC`,
        [supplierId]
      );
      return res.json({ success: true, data: result.rows });
    } catch (err) {
      return handleErpError(res, err, 'supplier contacts list');
    }
  });

  router.post('/suppliers/:supplierId/contacts', authenticateToken, requirePermission('suppliers.edit'), async (req: any, res: Response) => {
    try {
      const supplierId = parseInt(req.params.supplierId, 10);
      if (!Number.isFinite(supplierId)) return res.status(400).json({ success: false, message: 'Invalid supplier ID.' });
      const { full_name, designation, department, email, phone, is_primary, notes } = req.body || {};
      if (!full_name || !String(full_name).trim()) {
        return res.status(400).json({ success: false, message: 'Contact full name is required.' });
      }
      const pool = getPgOrThrow();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        if (is_primary) {
          await client.query(`UPDATE supplier_contacts SET is_primary = FALSE WHERE supplier_id = $1`, [supplierId]);
        }
        const inserted = await client.query(
          `INSERT INTO supplier_contacts (supplier_id, full_name, designation, department, email, phone, is_primary, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
          [
            supplierId,
            String(full_name).trim(),
            designation ? String(designation).trim() : null,
            department ? String(department).trim() : null,
            email ? String(email).trim() : null,
            phone ? String(phone).trim() : null,
            Boolean(is_primary),
            notes ? String(notes).trim() : null,
          ]
        );
        await client.query(
          `INSERT INTO supplier_history (supplier_id, event_type, summary, details, actor_name)
           VALUES ($1, 'CONTACT_ADDED', $2, $3, $4)`,
          [supplierId, `Added contact ${String(full_name).trim()}`, email || phone || null, actorLabel(req)]
        );
        await client.query('COMMIT');
        return res.status(201).json({ success: true, message: 'Supplier contact added.', data: inserted.rows[0] });
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }
    } catch (err) {
      return handleErpError(res, err, 'create supplier contact');
    }
  });

  router.delete('/suppliers/:supplierId/contacts/:id', authenticateToken, requirePermission('suppliers.edit'), async (req: any, res: Response) => {
    try {
      const supplierId = parseInt(req.params.supplierId, 10);
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(supplierId) || !Number.isFinite(id)) {
        return res.status(400).json({ success: false, message: 'Invalid identifier.' });
      }
      const pool = getPgOrThrow();
      const del = await pool.query(
        `DELETE FROM supplier_contacts WHERE id = $1 AND supplier_id = $2 RETURNING id`,
        [id, supplierId]
      );
      if (del.rows.length === 0) return res.status(404).json({ success: false, message: 'Contact not found.' });
      return res.json({ success: true, message: 'Supplier contact deleted.' });
    } catch (err) {
      return handleErpError(res, err, 'delete supplier contact');
    }
  });

  router.get('/suppliers/:supplierId/agreements', authenticateToken, requirePermission('suppliers.view'), async (req: any, res: Response) => {
    try {
      const supplierId = parseInt(req.params.supplierId, 10);
      if (!Number.isFinite(supplierId)) return res.status(400).json({ success: false, message: 'Invalid supplier ID.' });
      const pool = getPgOrThrow();
      const result = await pool.query(
        `SELECT * FROM supplier_agreements WHERE supplier_id = $1 ORDER BY start_date DESC, id DESC`,
        [supplierId]
      );
      return res.json({ success: true, data: result.rows });
    } catch (err) {
      return handleErpError(res, err, 'supplier agreements list');
    }
  });

  router.post('/suppliers/:supplierId/agreements', authenticateToken, requirePermission('suppliers.edit'), async (req: any, res: Response) => {
    try {
      const supplierId = parseInt(req.params.supplierId, 10);
      if (!Number.isFinite(supplierId)) return res.status(400).json({ success: false, message: 'Invalid supplier ID.' });
      const {
        agreement_number,
        title,
        agreement_type,
        start_date,
        end_date,
        payment_terms,
        credit_limit,
        currency,
        status,
        terms_summary,
      } = req.body || {};

      if (!title || !String(title).trim()) {
        return res.status(400).json({ success: false, message: 'Agreement title is required.' });
      }
      if (!start_date) {
        return res.status(400).json({ success: false, message: 'Agreement start date is required.' });
      }
      const agNumber = (agreement_number && String(agreement_number).trim()) || makeDocNo('AGR');
      const pool = getPgOrThrow();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const inserted = await client.query(
          `INSERT INTO supplier_agreements
           (supplier_id, agreement_number, title, agreement_type, start_date, end_date, payment_terms, credit_limit, currency, status, terms_summary, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           RETURNING *`,
          [
            supplierId,
            agNumber,
            String(title).trim(),
            agreement_type ? String(agreement_type).trim() : 'Supply Contract',
            start_date,
            end_date || null,
            payment_terms ? String(payment_terms).trim() : 'Net 30',
            Math.max(0, toNumber(credit_limit, 0)),
            currency ? String(currency).trim().toUpperCase() : 'INR',
            status ? String(status).trim() : 'active',
            terms_summary ? String(terms_summary).trim() : null,
            actorLabel(req),
          ]
        );
        await client.query(
          `INSERT INTO supplier_history (supplier_id, event_type, reference_no, summary, details, actor_name)
           VALUES ($1, 'AGREEMENT_CREATED', $2, $3, $4, $5)`,
          [supplierId, agNumber, `Agreement "${String(title).trim()}" created`, terms_summary || null, actorLabel(req)]
        );
        await client.query('COMMIT');
        return res.status(201).json({ success: true, message: 'Supplier agreement created.', data: inserted.rows[0] });
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }
    } catch (err) {
      return handleErpError(res, err, 'create supplier agreement');
    }
  });

  router.delete('/suppliers/:supplierId/agreements/:id', authenticateToken, requirePermission('suppliers.edit'), async (req: any, res: Response) => {
    try {
      const supplierId = parseInt(req.params.supplierId, 10);
      const id = parseInt(req.params.id, 10);
      const pool = getPgOrThrow();
      const del = await pool.query(
        `DELETE FROM supplier_agreements WHERE id = $1 AND supplier_id = $2 RETURNING id`,
        [id, supplierId]
      );
      if (del.rows.length === 0) return res.status(404).json({ success: false, message: 'Agreement not found.' });
      return res.json({ success: true, message: 'Supplier agreement deleted.' });
    } catch (err) {
      return handleErpError(res, err, 'delete supplier agreement');
    }
  });

  router.get('/suppliers/:supplierId/history', authenticateToken, requirePermission('suppliers.view'), async (req: any, res: Response) => {
    try {
      const supplierId = parseInt(req.params.supplierId, 10);
      if (!Number.isFinite(supplierId)) return res.status(400).json({ success: false, message: 'Invalid supplier ID.' });
      const pool = getPgOrThrow();
      const result = await pool.query(
        `SELECT * FROM supplier_history WHERE supplier_id = $1 ORDER BY created_at DESC LIMIT 200`,
        [supplierId]
      );
      return res.json({ success: true, data: result.rows });
    } catch (err) {
      return handleErpError(res, err, 'supplier history');
    }
  });

  router.post('/suppliers/:supplierId/history', authenticateToken, requirePermission('suppliers.edit'), async (req: any, res: Response) => {
    try {
      const supplierId = parseInt(req.params.supplierId, 10);
      const { event_type, reference_no, summary, details } = req.body || {};
      if (!summary || !String(summary).trim()) {
        return res.status(400).json({ success: false, message: 'History summary is required.' });
      }
      const pool = getPgOrThrow();
      const inserted = await pool.query(
        `INSERT INTO supplier_history (supplier_id, event_type, reference_no, summary, details, actor_name)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [
          supplierId,
          event_type ? String(event_type).trim() : 'NOTE',
          reference_no ? String(reference_no).trim() : null,
          String(summary).trim(),
          details ? String(details).trim() : null,
          actorLabel(req),
        ]
      );
      return res.status(201).json({ success: true, message: 'Supplier history entry logged.', data: inserted.rows[0] });
    } catch (err) {
      return handleErpError(res, err, 'add supplier history');
    }
  });

  // ==========================================================================
  // 2. WAREHOUSE LOCATIONS (ZONES / AISLES / RACKS / BINS)
  // ==========================================================================

  router.get('/warehouse-locations', authenticateToken, requirePermission('inventory.view'), async (req: any, res: Response) => {
    try {
      const pool = getPgOrThrow();
      const warehouseId = req.query.warehouse_id ? parseInt(String(req.query.warehouse_id), 10) : null;
      const result = warehouseId
        ? await pool.query(`SELECT * FROM warehouse_locations WHERE warehouse_id = $1 ORDER BY zone, location_code`, [warehouseId])
        : await pool.query(`SELECT * FROM warehouse_locations ORDER BY warehouse_id, zone, location_code`);
      return res.json({ success: true, data: result.rows });
    } catch (err) {
      return handleErpError(res, err, 'warehouse locations');
    }
  });

  router.post('/warehouses/:warehouseId/locations', authenticateToken, requirePermission('inventory.edit'), async (req: any, res: Response) => {
    try {
      const warehouseId = parseInt(req.params.warehouseId, 10);
      if (!Number.isFinite(warehouseId)) return res.status(400).json({ success: false, message: 'Invalid warehouse ID.' });
      const { location_code, zone, aisle, rack, bin, location_type, capacity, notes } = req.body || {};
      if (!location_code || !String(location_code).trim()) {
        return res.status(400).json({ success: false, message: 'Location code is required.' });
      }
      const pool = getPgOrThrow();
      const inserted = await pool.query(
        `INSERT INTO warehouse_locations (warehouse_id, location_code, zone, aisle, rack, bin, location_type, capacity, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [
          warehouseId,
          String(location_code).trim().toUpperCase(),
          zone ? String(zone).trim() : 'General',
          aisle ? String(aisle).trim() : null,
          rack ? String(rack).trim() : null,
          bin ? String(bin).trim() : null,
          location_type ? String(location_type).trim() : 'Storage',
          Math.max(0, toNumber(capacity, 0)),
          notes ? String(notes).trim() : null,
        ]
      );
      return res.status(201).json({ success: true, message: 'Warehouse location added.', data: inserted.rows[0] });
    } catch (err) {
      return handleErpError(res, err, 'create warehouse location');
    }
  });

  router.delete('/warehouses/:warehouseId/locations/:id', authenticateToken, requirePermission('inventory.edit'), async (req: any, res: Response) => {
    try {
      const warehouseId = parseInt(req.params.warehouseId, 10);
      const id = parseInt(req.params.id, 10);
      const pool = getPgOrThrow();
      const del = await pool.query(
        `DELETE FROM warehouse_locations WHERE id = $1 AND warehouse_id = $2 RETURNING id`,
        [id, warehouseId]
      );
      if (del.rows.length === 0) return res.status(404).json({ success: false, message: 'Location not found.' });
      return res.json({ success: true, message: 'Warehouse location deleted.' });
    } catch (err) {
      return handleErpError(res, err, 'delete warehouse location');
    }
  });

  // ==========================================================================
  // 3. PURCHASE MANAGEMENT (PURCHASE REQUESTS & PURCHASE ORDERS)
  // ==========================================================================

  router.get('/erp/purchase-requests', authenticateToken, requirePermission('menu.purchasing'), async (req: any, res: Response) => {
    try {
      const pool = getPgOrThrow();
      const status = req.query.status && req.query.status !== 'all' ? String(req.query.status) : null;
      const prs = status
        ? await pool.query(`SELECT * FROM purchase_requests WHERE status = $1 ORDER BY created_at DESC`, [status])
        : await pool.query(`SELECT * FROM purchase_requests ORDER BY created_at DESC`);
      const itemsRes = await pool.query(`SELECT * FROM purchase_request_items ORDER BY id ASC`);
      const itemsByPr = new Map<number, any[]>();
      for (const it of itemsRes.rows) {
        const list = itemsByPr.get(it.pr_id) || [];
        list.push(it);
        itemsByPr.set(it.pr_id, list);
      }
      const data = prs.rows.map(pr => ({ ...pr, items: itemsByPr.get(pr.id) || [] }));
      return res.json({ success: true, data });
    } catch (err) {
      return handleErpError(res, err, 'purchase requests list');
    }
  });

  router.post('/erp/purchase-requests', authenticateToken, requirePermission('menu.purchasing'), async (req: any, res: Response) => {
    try {
      const { department, required_date, preferred_supplier_id, preferred_supplier_name, priority, notes, items } = req.body || {};
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: 'At least one purchase request line item is required.' });
      }
      const prNumber = makeDocNo('PR');
      let totalAmount = 0;
      const sanitizedItems = items.map((it: any) => {
        const qty = Math.max(0.01, toNumber(it.quantity, 0));
        const price = Math.max(0, toNumber(it.estimated_unit_price, 0));
        const lineTotal = Number((qty * price).toFixed(2));
        totalAmount += lineTotal;
        return {
          item_id: it.item_id ? parseInt(String(it.item_id), 10) : null,
          item_code: String(it.item_code || 'ITEM').trim(),
          item_name: String(it.item_name || '').trim(),
          uom: String(it.uom || 'PCS').trim(),
          quantity: qty,
          estimated_unit_price: price,
          total_price: lineTotal,
          specifications: it.specifications ? String(it.specifications).trim() : null,
        };
      });
      if (sanitizedItems.some((i: any) => !i.item_name)) {
        return res.status(400).json({ success: false, message: 'Every line item must have an item name.' });
      }

      const pool = getPgOrThrow();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const prRes = await client.query(
          `INSERT INTO purchase_requests
           (pr_number, requester_id, requester_name, department, request_date, required_date, preferred_supplier_id, preferred_supplier_name, status, priority, total_amount, notes, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'submitted', $9, $10, $11, $12)
           RETURNING *`,
          [
            prNumber,
            req.user?.id || null,
            req.user?.name || actorLabel(req),
            department ? String(department).trim() : null,
            new Date().toISOString().slice(0, 10),
            required_date || null,
            preferred_supplier_id ? parseInt(String(preferred_supplier_id), 10) : null,
            preferred_supplier_name ? String(preferred_supplier_name).trim() : null,
            priority ? String(priority).trim() : 'medium',
            Number(totalAmount.toFixed(2)),
            notes ? String(notes).trim() : null,
            actorLabel(req),
          ]
        );
        const pr = prRes.rows[0];
        const createdItems = [];
        for (const it of sanitizedItems) {
          const itemIns = await client.query(
            `INSERT INTO purchase_request_items
             (pr_id, item_id, item_code, item_name, uom, quantity, estimated_unit_price, total_price, specifications)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [pr.id, it.item_id, it.item_code, it.item_name, it.uom, it.quantity, it.estimated_unit_price, it.total_price, it.specifications]
          );
          createdItems.push(itemIns.rows[0]);
        }
        await client.query('COMMIT');
        return res.status(201).json({ success: true, message: `Purchase Request ${prNumber} created.`, data: { ...pr, items: createdItems } });
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }
    } catch (err) {
      return handleErpError(res, err, 'create purchase request');
    }
  });

  router.put('/erp/purchase-requests/:id/status', authenticateToken, requirePermission('menu.purchasing'), async (req: any, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { status, comments } = req.body || {};
      const allowed = ['draft', 'submitted', 'approved', 'rejected', 'converted_to_po'];
      if (!allowed.includes(String(status))) {
        return res.status(400).json({ success: false, message: 'Invalid purchase request status.' });
      }
      const pool = getPgOrThrow();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const upd = await client.query(
          `UPDATE purchase_requests
           SET status = $1,
               approved_by = CASE WHEN $1 = 'approved' THEN $2 ELSE approved_by END,
               approved_at = CASE WHEN $1 = 'approved' THEN NOW() ELSE approved_at END,
               rejection_reason = CASE WHEN $1 = 'rejected' THEN $3 ELSE rejection_reason END,
               updated_at = NOW()
           WHERE id = $4 RETURNING *`,
          [status, actorLabel(req), comments || null, id]
        );
        if (upd.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ success: false, message: 'Purchase request not found.' });
        }
        await client.query(
          `INSERT INTO purchase_request_approvals (pr_id, action, actor_id, actor_name, actor_role, comments)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, status.toUpperCase(), req.user?.id || null, actorLabel(req), req.user?.role || 'user', comments || null]
        );
        await client.query('COMMIT');
        return res.json({ success: true, message: `Purchase Request updated to ${status}.`, data: upd.rows[0] });
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }
    } catch (err) {
      return handleErpError(res, err, 'update purchase request status');
    }
  });

  router.get('/purchase-orders', authenticateToken, requirePermission('menu.purchasing'), async (req: any, res: Response) => {
    try {
      const pool = getPgOrThrow();
      const status = req.query.status && req.query.status !== 'all' ? String(req.query.status) : null;
      const pos = status
        ? await pool.query(`SELECT * FROM purchase_orders WHERE status = $1 ORDER BY created_at DESC`, [status])
        : await pool.query(`SELECT * FROM purchase_orders ORDER BY created_at DESC`);
      const itemsRes = await pool.query(`SELECT * FROM purchase_order_items ORDER BY id ASC`);
      const itemsByPo = new Map<number, any[]>();
      for (const it of itemsRes.rows) {
        const list = itemsByPo.get(it.po_id) || [];
        list.push(it);
        itemsByPo.set(it.po_id, list);
      }
      const data = pos.rows.map(po => ({ ...po, items: itemsByPo.get(po.id) || [] }));
      return res.json({ success: true, data });
    } catch (err) {
      return handleErpError(res, err, 'purchase orders list');
    }
  });

  router.post('/purchase-orders', authenticateToken, requirePermission('menu.purchasing'), async (req: any, res: Response) => {
    try {
      const {
        pr_id,
        supplier_id,
        supplier_name,
        warehouse_id,
        warehouse_name,
        order_date,
        expected_delivery_date,
        payment_terms,
        notes,
        items,
      } = req.body || {};

      if (!supplier_id || !supplier_name) {
        return res.status(400).json({ success: false, message: 'Supplier is required to create a Purchase Order.' });
      }
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: 'At least one Purchase Order line item is required.' });
      }

      const poNumber = makeDocNo('PO');
      let subtotal = 0;
      let taxAmount = 0;
      const sanitizedItems = items.map((it: any) => {
        const qty = Math.max(0.01, toNumber(it.ordered_quantity ?? it.quantity, 0));
        const unitPrice = Math.max(0, toNumber(it.unit_price ?? it.estimated_unit_price, 0));
        const taxRate = Math.max(0, toNumber(it.tax_rate, 0));
        const base = qty * unitPrice;
        const tax = base * (taxRate / 100);
        subtotal += base;
        taxAmount += tax;
        return {
          item_id: it.item_id ? parseInt(String(it.item_id), 10) : null,
          item_code: String(it.item_code || 'ITEM').trim(),
          item_name: String(it.item_name || '').trim(),
          uom: String(it.uom || 'PCS').trim(),
          ordered_quantity: qty,
          unit_price: unitPrice,
          tax_rate: taxRate,
          total_price: Number((base + tax).toFixed(2)),
          notes: it.notes ? String(it.notes).trim() : null,
        };
      });
      if (sanitizedItems.some((i: any) => !i.item_name)) {
        return res.status(400).json({ success: false, message: 'Every PO line item requires an item name.' });
      }
      const totalAmount = Number((subtotal + taxAmount).toFixed(2));

      const pool = getPgOrThrow();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const poRes = await client.query(
          `INSERT INTO purchase_orders
           (po_number, pr_id, supplier_id, supplier_name, warehouse_id, warehouse_name, order_date, expected_delivery_date, status, payment_terms, subtotal, tax_amount, total_amount, notes, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'issued', $9, $10, $11, $12, $13, $14)
           RETURNING *`,
          [
            poNumber,
            pr_id ? parseInt(String(pr_id), 10) : null,
            parseInt(String(supplier_id), 10),
            String(supplier_name).trim(),
            warehouse_id ? parseInt(String(warehouse_id), 10) : null,
            warehouse_name ? String(warehouse_name).trim() : null,
            order_date || new Date().toISOString().slice(0, 10),
            expected_delivery_date || null,
            payment_terms ? String(payment_terms).trim() : 'Net 30',
            Number(subtotal.toFixed(2)),
            Number(taxAmount.toFixed(2)),
            totalAmount,
            notes ? String(notes).trim() : null,
            actorLabel(req),
          ]
        );
        const po = poRes.rows[0];
        const createdItems = [];
        for (const it of sanitizedItems) {
          const ins = await client.query(
            `INSERT INTO purchase_order_items
             (po_id, item_id, item_code, item_name, uom, ordered_quantity, unit_price, tax_rate, total_price, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
            [po.id, it.item_id, it.item_code, it.item_name, it.uom, it.ordered_quantity, it.unit_price, it.tax_rate, it.total_price, it.notes]
          );
          createdItems.push(ins.rows[0]);
        }
        if (pr_id) {
          await client.query(`UPDATE purchase_requests SET status = 'converted_to_po', updated_at = NOW() WHERE id = $1`, [
            parseInt(String(pr_id), 10),
          ]);
        }
        await client.query(
          `INSERT INTO supplier_history (supplier_id, event_type, reference_no, summary, details, actor_name)
           VALUES ($1, 'PURCHASE_ORDER_ISSUED', $2, $3, $4, $5)`,
          [
            parseInt(String(supplier_id), 10),
            poNumber,
            `Purchase Order ${poNumber} issued (${createdItems.length} items, INR ${totalAmount.toFixed(2)})`,
            notes || null,
            actorLabel(req),
          ]
        );
        await client.query('COMMIT');
        return res.status(201).json({ success: true, message: `Purchase Order ${poNumber} created.`, data: { ...po, items: createdItems } });
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }
    } catch (err) {
      return handleErpError(res, err, 'create purchase order');
    }
  });

  router.put('/purchase-orders/:id/status', authenticateToken, requirePermission('menu.purchasing'), async (req: any, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { status } = req.body || {};
      const allowed = ['draft', 'issued', 'partially_received', 'received', 'cancelled'];
      if (!allowed.includes(String(status))) {
        return res.status(400).json({ success: false, message: 'Invalid Purchase Order status.' });
      }
      const pool = getPgOrThrow();
      const upd = await pool.query(
        `UPDATE purchase_orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [status, id]
      );
      if (upd.rows.length === 0) return res.status(404).json({ success: false, message: 'Purchase Order not found.' });
      return res.json({ success: true, message: `Purchase Order marked as ${status}.`, data: upd.rows[0] });
    } catch (err) {
      return handleErpError(res, err, 'update purchase order status');
    }
  });

  // ==========================================================================
  // 4. GOODS RECEIVING (GRN, RECEIVED QUANTITIES & QUALITY CHECKS)
  // ==========================================================================

  router.get('/grn', authenticateToken, requirePermission('menu.goods_receipt'), async (req: any, res: Response) => {
    try {
      const pool = getPgOrThrow();
      const grns = await pool.query(`SELECT * FROM goods_receipt_notes ORDER BY created_at DESC`);
      const itemsRes = await pool.query(`SELECT * FROM grn_items ORDER BY id ASC`);
      const qcRes = await pool.query(`SELECT * FROM grn_quality_checks ORDER BY created_at DESC`);

      const itemsByGrn = new Map<number, any[]>();
      for (const it of itemsRes.rows) {
        const list = itemsByGrn.get(it.grn_id) || [];
        list.push(it);
        itemsByGrn.set(it.grn_id, list);
      }
      const qcByGrn = new Map<number, any[]>();
      for (const q of qcRes.rows) {
        const list = qcByGrn.get(q.grn_id) || [];
        list.push(q);
        qcByGrn.set(q.grn_id, list);
      }
      const data = grns.rows.map(g => ({
        ...g,
        items: itemsByGrn.get(g.id) || [],
        quality_checks: qcByGrn.get(g.id) || [],
      }));
      return res.json({ success: true, data });
    } catch (err) {
      return handleErpError(res, err, 'list GRNs');
    }
  });

  router.post('/grn', authenticateToken, requirePermission('menu.goods_receipt'), async (req: any, res: Response) => {
    try {
      const {
        po_id,
        po_number,
        supplier_id,
        supplier_name,
        warehouse_id,
        warehouse_name,
        receipt_date,
        delivery_challan_no,
        vehicle_no,
        notes,
        items,
      } = req.body || {};

      if (!supplier_id || !supplier_name) {
        return res.status(400).json({ success: false, message: 'Supplier details are required for GRN.' });
      }
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: 'At least one received item is required for GRN.' });
      }

      const grnNumber = makeDocNo('GRN');
      const pool = getPgOrThrow();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const grnRes = await client.query(
          `INSERT INTO goods_receipt_notes
           (grn_number, po_id, po_number, supplier_id, supplier_name, warehouse_id, warehouse_name, receipt_date, delivery_challan_no, vehicle_no, status, qc_status, received_by, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending_qc', 'pending', $11, $12)
           RETURNING *`,
          [
            grnNumber,
            po_id ? parseInt(String(po_id), 10) : null,
            po_number ? String(po_number).trim() : null,
            parseInt(String(supplier_id), 10),
            String(supplier_name).trim(),
            warehouse_id ? parseInt(String(warehouse_id), 10) : null,
            warehouse_name ? String(warehouse_name).trim() : 'Main Warehouse',
            receipt_date || new Date().toISOString().slice(0, 10),
            delivery_challan_no ? String(delivery_challan_no).trim() : null,
            vehicle_no ? String(vehicle_no).trim() : null,
            actorLabel(req),
            notes ? String(notes).trim() : null,
          ]
        );
        const grn = grnRes.rows[0];
        const createdItems = [];
        for (const it of items) {
          const expected = Math.max(0, toNumber(it.expected_quantity, 0));
          const received = Math.max(0, toNumber(it.received_quantity, 0));
          const accepted = Math.min(received, Math.max(0, toNumber(it.accepted_quantity ?? received, received)));
          const rejected = Math.max(0, toNumber(it.rejected_quantity ?? (received - accepted), 0));
          const ins = await client.query(
            `INSERT INTO grn_items
             (grn_id, po_item_id, item_id, item_code, item_name, uom, expected_quantity, received_quantity, accepted_quantity, rejected_quantity, unit_price, batch_number, location_code, qc_status, remarks)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending', $14) RETURNING *`,
            [
              grn.id,
              it.po_item_id ? parseInt(String(it.po_item_id), 10) : null,
              it.item_id ? parseInt(String(it.item_id), 10) : null,
              String(it.item_code || 'ITEM').trim(),
              String(it.item_name || '').trim(),
              String(it.uom || 'PCS').trim(),
              expected,
              received,
              accepted,
              rejected,
              Math.max(0, toNumber(it.unit_price, 0)),
              it.batch_number ? String(it.batch_number).trim() : null,
              it.location_code ? String(it.location_code).trim() : null,
              it.remarks ? String(it.remarks).trim() : null,
            ]
          );
          createdItems.push(ins.rows[0]);
        }
        await client.query(
          `INSERT INTO supplier_history (supplier_id, event_type, reference_no, summary, details, actor_name)
           VALUES ($1, 'GOODS_RECEIVED', $2, $3, $4, $5)`,
          [
            parseInt(String(supplier_id), 10),
            grnNumber,
            `GRN ${grnNumber} logged for ${createdItems.length} item(s)`,
            delivery_challan_no ? `Challan: ${delivery_challan_no}` : null,
            actorLabel(req),
          ]
        );
        await client.query('COMMIT');
        return res.status(201).json({
          success: true,
          message: `Goods Receipt Note ${grnNumber} created.`,
          data: { ...grn, items: createdItems, quality_checks: [] },
        });
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }
    } catch (err) {
      return handleErpError(res, err, 'create GRN');
    }
  });

  router.post('/grn/:id/quality-checks', authenticateToken, requirePermission('menu.goods_receipt'), async (req: any, res: Response) => {
    try {
      const grnId = parseInt(req.params.id, 10);
      const {
        grn_item_id,
        inspector_name,
        parameter_name,
        expected_spec,
        observed_value,
        sample_size,
        passed_qty,
        failed_qty,
        result,
        remarks,
      } = req.body || {};

      if (!parameter_name || !String(parameter_name).trim()) {
        return res.status(400).json({ success: false, message: 'Inspection parameter name is required.' });
      }
      const qcResult = ['pass', 'fail', 'conditional'].includes(String(result)) ? String(result) : 'pass';
      const pool = getPgOrThrow();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const inserted = await client.query(
          `INSERT INTO grn_quality_checks
           (grn_id, grn_item_id, inspector_name, parameter_name, expected_spec, observed_value, sample_size, passed_qty, failed_qty, result, remarks)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
          [
            grnId,
            grn_item_id ? parseInt(String(grn_item_id), 10) : null,
            inspector_name ? String(inspector_name).trim() : actorLabel(req),
            String(parameter_name).trim(),
            expected_spec ? String(expected_spec).trim() : null,
            observed_value ? String(observed_value).trim() : null,
            Math.max(1, parseInt(String(sample_size || 1), 10) || 1),
            Math.max(0, toNumber(passed_qty, 0)),
            Math.max(0, toNumber(failed_qty, 0)),
            qcResult,
            remarks ? String(remarks).trim() : null,
          ]
        );

        if (grn_item_id) {
          await client.query(
            `UPDATE grn_items
             SET qc_status = $1,
                 accepted_quantity = CASE WHEN $2 > 0 OR $3 > 0 THEN $2 ELSE accepted_quantity END,
                 rejected_quantity = CASE WHEN $2 > 0 OR $3 > 0 THEN $3 ELSE rejected_quantity END
             WHERE id = $4 AND grn_id = $5`,
            [qcResult, Math.max(0, toNumber(passed_qty, 0)), Math.max(0, toNumber(failed_qty, 0)), parseInt(String(grn_item_id), 10), grnId]
          );
        }

        const allQc = await client.query(`SELECT result FROM grn_quality_checks WHERE grn_id = $1`, [grnId]);
        const hasFail = allQc.rows.some(r => r.result === 'fail');
        const hasCond = allQc.rows.some(r => r.result === 'conditional');
        const overallQc = hasFail ? 'failed' : hasCond ? 'conditional' : 'passed';
        const grnStatus = hasFail ? 'qc_rejected' : 'qc_approved';

        await client.query(
          `UPDATE goods_receipt_notes SET qc_status = $1, status = $2, updated_at = NOW() WHERE id = $3`,
          [overallQc, grnStatus, grnId]
        );
        await client.query('COMMIT');
        return res.status(201).json({ success: true, message: 'Quality inspection recorded.', data: inserted.rows[0] });
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }
    } catch (err) {
      return handleErpError(res, err, 'record GRN quality check');
    }
  });

  router.post('/grn/:id/post-stock', authenticateToken, requirePermission('inventory.receive'), async (req: any, res: Response) => {
    try {
      const grnId = parseInt(req.params.id, 10);
      const pool = getPgOrThrow();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const grnRes = await client.query(`SELECT * FROM goods_receipt_notes WHERE id = $1 FOR UPDATE`, [grnId]);
        if (grnRes.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ success: false, message: 'GRN not found.' });
        }
        const grn = grnRes.rows[0];
        if (grn.stock_posted) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: 'Stock for this GRN has already been posted.' });
        }

        const itemsRes = await client.query(`SELECT * FROM grn_items WHERE grn_id = $1`, [grnId]);
        let postedCount = 0;

        for (const it of itemsRes.rows) {
          const accepted = toNumber(it.accepted_quantity, 0);
          if (accepted <= 0) continue;

          if (it.item_id) {
            // Upsert PostgreSQL stock_balances if item exists in inventory_items
            const invExists = await client.query(`SELECT id FROM inventory_items WHERE id = $1`, [it.item_id]);
            if (invExists.rows.length > 0) {
              const loc = grn.warehouse_name || 'Main Warehouse';
              await client.query(
                `INSERT INTO stock_balances (item_id, location, quantity_on_hand, updated_at)
                 VALUES ($1, $2, $3, NOW())
                 ON CONFLICT (item_id, location)
                 DO UPDATE SET quantity_on_hand = stock_balances.quantity_on_hand + EXCLUDED.quantity_on_hand, updated_at = NOW()`,
                [it.item_id, loc, accepted]
              );
              await client.query(
                `INSERT INTO stock_transactions
                 (reference_no, item_id, type, quantity, unit_price, reference_type, reference_id, location_to, notes, created_by)
                 VALUES ($1, $2, 'receipt', $3, $4, 'GRN', $5, $6, $7, $8)`,
                [
                  `${grn.grn_number}-${it.id}`,
                  it.item_id,
                  accepted,
                  toNumber(it.unit_price, 0),
                  grn.grn_number,
                  loc,
                  `Goods received via ${grn.grn_number}`,
                  actorLabel(req),
                ]
              );
              postedCount++;
            }
          }

          if (it.po_item_id) {
            await client.query(
              `UPDATE purchase_order_items SET received_quantity = received_quantity + $1 WHERE id = $2`,
              [accepted, it.po_item_id]
            );
          }
        }

        if (grn.po_id) {
          const poItems = await client.query(
            `SELECT ordered_quantity, received_quantity FROM purchase_order_items WHERE po_id = $1`,
            [grn.po_id]
          );
          const allReceived = poItems.rows.length > 0 && poItems.rows.every(r => toNumber(r.received_quantity) >= toNumber(r.ordered_quantity));
          await client.query(
            `UPDATE purchase_orders SET status = $1, updated_at = NOW() WHERE id = $2`,
            [allReceived ? 'received' : 'partially_received', grn.po_id]
          );
        }

        const updated = await client.query(
          `UPDATE goods_receipt_notes
           SET stock_posted = TRUE, stock_posted_at = NOW(), status = 'completed', updated_at = NOW()
           WHERE id = $1 RETURNING *`,
          [grnId]
        );
        await client.query('COMMIT');
        return res.json({
          success: true,
          message: `GRN ${grn.grn_number} posted to stock (${postedCount} inventory balance(s) updated).`,
          data: updated.rows[0],
        });
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }
    } catch (err) {
      return handleErpError(res, err, 'post GRN to stock');
    }
  });

  // ==========================================================================
  // 5. PRODUCT MANAGEMENT (PRODUCTS, COMPONENTS & BOM)
  // ==========================================================================

  router.get('/products', authenticateToken, requirePermission('inventory.view'), async (req: any, res: Response) => {
    try {
      const pool = getPgOrThrow();
      const search = req.query.search ? `%${String(req.query.search).trim()}%` : null;
      const productsRes = search
        ? await pool.query(
            `SELECT p.*,
                    (SELECT COUNT(*)::int FROM product_components pc WHERE pc.product_id = p.id) AS component_count,
                    (SELECT COUNT(*)::int FROM bom_headers bh WHERE bh.product_id = p.id) AS bom_count
             FROM products p
             WHERE p.name ILIKE $1 OR p.product_code ILIKE $1 OR COALESCE(p.sku, '') ILIKE $1
             ORDER BY p.created_at DESC`,
            [search]
          )
        : await pool.query(
            `SELECT p.*,
                    (SELECT COUNT(*)::int FROM product_components pc WHERE pc.product_id = p.id) AS component_count,
                    (SELECT COUNT(*)::int FROM bom_headers bh WHERE bh.product_id = p.id) AS bom_count
             FROM products p
             ORDER BY p.created_at DESC`
          );
      return res.json({ success: true, data: productsRes.rows });
    } catch (err) {
      return handleErpError(res, err, 'products list');
    }
  });

  router.get('/products/:id', authenticateToken, requirePermission('inventory.view'), async (req: any, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const pool = getPgOrThrow();
      const prod = await pool.query(`SELECT * FROM products WHERE id = $1`, [id]);
      if (prod.rows.length === 0) return res.status(404).json({ success: false, message: 'Product not found.' });

      const [components, boms, bomItems] = await Promise.all([
        pool.query(`SELECT * FROM product_components WHERE product_id = $1 ORDER BY id ASC`, [id]),
        pool.query(`SELECT * FROM bom_headers WHERE product_id = $1 ORDER BY created_at DESC`, [id]),
        pool.query(
          `SELECT bi.* FROM bom_items bi
           INNER JOIN bom_headers bh ON bh.id = bi.bom_id
           WHERE bh.product_id = $1 ORDER BY bi.id ASC`,
          [id]
        ),
      ]);

      const itemsByBom = new Map<number, any[]>();
      for (const bi of bomItems.rows) {
        const list = itemsByBom.get(bi.bom_id) || [];
        list.push(bi);
        itemsByBom.set(bi.bom_id, list);
      }

      return res.json({
        success: true,
        data: {
          ...prod.rows[0],
          components: components.rows,
          boms: boms.rows.map(b => ({ ...b, items: itemsByBom.get(b.id) || [] })),
        },
      });
    } catch (err) {
      return handleErpError(res, err, 'product detail');
    }
  });

  router.post('/products', authenticateToken, requirePermission('inventory.create'), async (req: any, res: Response) => {
    try {
      const { product_code, name, category, sku, uom, selling_price, standard_cost, status, description } = req.body || {};
      if (!name || !String(name).trim()) {
        return res.status(400).json({ success: false, message: 'Product name is required.' });
      }
      const code = (product_code && String(product_code).trim().toUpperCase()) || makeDocNo('PRD');
      const pool = getPgOrThrow();
      const inserted = await pool.query(
        `INSERT INTO products (product_code, name, category, sku, uom, selling_price, standard_cost, status, description, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [
          code,
          String(name).trim(),
          category ? String(category).trim() : 'General',
          sku ? String(sku).trim().toUpperCase() : null,
          uom ? String(uom).trim() : 'PCS',
          Math.max(0, toNumber(selling_price, 0)),
          Math.max(0, toNumber(standard_cost, 0)),
          status ? String(status).trim() : 'active',
          description ? String(description).trim() : null,
          actorLabel(req),
        ]
      );
      return res.status(201).json({ success: true, message: 'Product created.', data: inserted.rows[0] });
    } catch (err) {
      return handleErpError(res, err, 'create product');
    }
  });

  router.put('/products/:id', authenticateToken, requirePermission('inventory.edit'), async (req: any, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { name, category, sku, uom, selling_price, standard_cost, status, description } = req.body || {};
      const pool = getPgOrThrow();
      const upd = await pool.query(
        `UPDATE products
         SET name = COALESCE($1, name),
             category = COALESCE($2, category),
             sku = COALESCE($3, sku),
             uom = COALESCE($4, uom),
             selling_price = COALESCE($5, selling_price),
             standard_cost = COALESCE($6, standard_cost),
             status = COALESCE($7, status),
             description = COALESCE($8, description),
             updated_at = NOW()
         WHERE id = $9 RETURNING *`,
        [
          name ? String(name).trim() : null,
          category ? String(category).trim() : null,
          sku !== undefined ? (sku ? String(sku).trim().toUpperCase() : null) : null,
          uom ? String(uom).trim() : null,
          selling_price !== undefined ? Math.max(0, toNumber(selling_price, 0)) : null,
          standard_cost !== undefined ? Math.max(0, toNumber(standard_cost, 0)) : null,
          status ? String(status).trim() : null,
          description !== undefined ? description : null,
          id,
        ]
      );
      if (upd.rows.length === 0) return res.status(404).json({ success: false, message: 'Product not found.' });
      return res.json({ success: true, message: 'Product updated.', data: upd.rows[0] });
    } catch (err) {
      return handleErpError(res, err, 'update product');
    }
  });

  router.delete('/products/:id', authenticateToken, requirePermission('inventory.delete'), async (req: any, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const pool = getPgOrThrow();
      const del = await pool.query(`DELETE FROM products WHERE id = $1 RETURNING id`, [id]);
      if (del.rows.length === 0) return res.status(404).json({ success: false, message: 'Product not found.' });
      return res.json({ success: true, message: 'Product deleted.' });
    } catch (err) {
      return handleErpError(res, err, 'delete product');
    }
  });

  router.post('/products/:productId/components', authenticateToken, requirePermission('inventory.edit'), async (req: any, res: Response) => {
    try {
      const productId = parseInt(req.params.productId, 10);
      const { inventory_item_id, component_code, component_name, component_type, uom, quantity_per_unit, unit_cost, scrap_percent, notes } = req.body || {};
      if (!component_name || !String(component_name).trim()) {
        return res.status(400).json({ success: false, message: 'Component name is required.' });
      }
      const pool = getPgOrThrow();
      const ins = await pool.query(
        `INSERT INTO product_components
         (product_id, inventory_item_id, component_code, component_name, component_type, uom, quantity_per_unit, unit_cost, scrap_percent, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [
          productId,
          inventory_item_id ? parseInt(String(inventory_item_id), 10) : null,
          (component_code && String(component_code).trim().toUpperCase()) || makeDocNo('CMP'),
          String(component_name).trim(),
          component_type ? String(component_type).trim() : 'raw_material',
          uom ? String(uom).trim() : 'PCS',
          Math.max(0.0001, toNumber(quantity_per_unit, 1)),
          Math.max(0, toNumber(unit_cost, 0)),
          Math.max(0, toNumber(scrap_percent, 0)),
          notes ? String(notes).trim() : null,
        ]
      );
      return res.status(201).json({ success: true, message: 'Product component added.', data: ins.rows[0] });
    } catch (err) {
      return handleErpError(res, err, 'add product component');
    }
  });

  router.delete('/products/:productId/components/:componentId', authenticateToken, requirePermission('inventory.edit'), async (req: any, res: Response) => {
    try {
      const productId = parseInt(req.params.productId, 10);
      const componentId = parseInt(req.params.componentId, 10);
      const pool = getPgOrThrow();
      const del = await pool.query(
        `DELETE FROM product_components WHERE id = $1 AND product_id = $2 RETURNING id`,
        [componentId, productId]
      );
      if (del.rows.length === 0) return res.status(404).json({ success: false, message: 'Component not found.' });
      return res.json({ success: true, message: 'Component removed.' });
    } catch (err) {
      return handleErpError(res, err, 'delete product component');
    }
  });

  router.post('/products/:productId/bom', authenticateToken, requirePermission('inventory.edit'), async (req: any, res: Response) => {
    try {
      const productId = parseInt(req.params.productId, 10);
      const { bom_code, version, status, effective_date, batch_size, notes, items } = req.body || {};
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: 'A Bill of Materials requires at least one material line item.' });
      }
      const code = (bom_code && String(bom_code).trim().toUpperCase()) || makeDocNo('BOM');
      const batch = Math.max(1, toNumber(batch_size, 1));
      let totalMaterialCost = 0;

      const sanitized = items.map((it: any) => {
        const qty = Math.max(0.0001, toNumber(it.quantity, 1));
        const unitCost = Math.max(0, toNumber(it.unit_cost, 0));
        const scrapPct = Math.max(0, toNumber(it.scrap_percent, 0));
        const lineCost = Number((qty * unitCost * (1 + scrapPct / 100)).toFixed(2));
        totalMaterialCost += lineCost;
        return {
          inventory_item_id: it.inventory_item_id ? parseInt(String(it.inventory_item_id), 10) : null,
          item_code: String(it.item_code || 'MAT').trim().toUpperCase(),
          item_name: String(it.item_name || '').trim(),
          item_type: String(it.item_type || 'raw_material').trim(),
          quantity: qty,
          uom: String(it.uom || 'PCS').trim(),
          unit_cost: unitCost,
          scrap_percent: scrapPct,
          line_cost: lineCost,
          notes: it.notes ? String(it.notes).trim() : null,
        };
      });
      if (sanitized.some((i: any) => !i.item_name)) {
        return res.status(400).json({ success: false, message: 'Every BOM line item must have an item name.' });
      }

      const pool = getPgOrThrow();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const hdrRes = await client.query(
          `INSERT INTO bom_headers
           (bom_code, product_id, version, status, effective_date, batch_size, total_material_cost, notes, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
          [
            code,
            productId,
            version ? String(version).trim() : '1.0',
            status ? String(status).trim() : 'active',
            effective_date || new Date().toISOString().slice(0, 10),
            batch,
            Number(totalMaterialCost.toFixed(2)),
            notes ? String(notes).trim() : null,
            actorLabel(req),
          ]
        );
        const bom = hdrRes.rows[0];
        const createdItems = [];
        for (const it of sanitized) {
          const ins = await client.query(
            `INSERT INTO bom_items
             (bom_id, inventory_item_id, item_code, item_name, item_type, quantity, uom, unit_cost, scrap_percent, line_cost, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
            [bom.id, it.inventory_item_id, it.item_code, it.item_name, it.item_type, it.quantity, it.uom, it.unit_cost, it.scrap_percent, it.line_cost, it.notes]
          );
          createdItems.push(ins.rows[0]);
        }
        if ((status || 'active') === 'active') {
          const perUnitCost = Number((totalMaterialCost / batch).toFixed(2));
          await client.query(`UPDATE products SET standard_cost = $1, updated_at = NOW() WHERE id = $2`, [perUnitCost, productId]);
        }
        await client.query('COMMIT');
        return res.status(201).json({ success: true, message: `BOM ${code} created.`, data: { ...bom, items: createdItems } });
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }
    } catch (err) {
      return handleErpError(res, err, 'create BOM');
    }
  });

  router.delete('/bom/:bomId', authenticateToken, requirePermission('inventory.delete'), async (req: any, res: Response) => {
    try {
      const bomId = parseInt(req.params.bomId, 10);
      const pool = getPgOrThrow();
      const del = await pool.query(`DELETE FROM bom_headers WHERE id = $1 RETURNING id`, [bomId]);
      if (del.rows.length === 0) return res.status(404).json({ success: false, message: 'BOM not found.' });
      return res.json({ success: true, message: 'BOM deleted.' });
    } catch (err) {
      return handleErpError(res, err, 'delete BOM');
    }
  });

  // ==========================================================================
  // 6. PRODUCTION MANAGEMENT (WORK ORDERS & PRODUCTION PROGRESS)
  // ==========================================================================

  router.get('/production/work-orders', authenticateToken, requirePermission('inventory.view'), async (req: any, res: Response) => {
    try {
      const pool = getPgOrThrow();
      const status = req.query.status && req.query.status !== 'all' ? String(req.query.status) : null;
      const wos = status
        ? await pool.query(`SELECT * FROM work_orders WHERE status = $1 ORDER BY created_at DESC`, [status])
        : await pool.query(`SELECT * FROM work_orders ORDER BY created_at DESC`);
      const logs = await pool.query(`SELECT * FROM production_progress_logs ORDER BY created_at DESC LIMIT 500`);
      const logsByWo = new Map<number, any[]>();
      for (const l of logs.rows) {
        const list = logsByWo.get(l.work_order_id) || [];
        list.push(l);
        logsByWo.set(l.work_order_id, list);
      }
      const data = wos.rows.map(w => {
        const planned = toNumber(w.planned_quantity, 0);
        const produced = toNumber(w.produced_quantity, 0);
        const pct = planned > 0 ? Math.min(100, Number(((produced / planned) * 100).toFixed(1))) : 0;
        return { ...w, completion_percent: pct, progress_logs: logsByWo.get(w.id) || [] };
      });
      return res.json({ success: true, data });
    } catch (err) {
      return handleErpError(res, err, 'list work orders');
    }
  });

  router.post('/production/work-orders', authenticateToken, requirePermission('inventory.create'), async (req: any, res: Response) => {
    try {
      const {
        product_id,
        bom_id,
        warehouse_id,
        warehouse_name,
        planned_quantity,
        unit_of_measure,
        priority,
        planned_start_date,
        planned_end_date,
        assigned_team,
        supervisor_name,
        notes,
      } = req.body || {};

      const pid = parseInt(String(product_id), 10);
      const qty = toNumber(planned_quantity, 0);
      if (!Number.isFinite(pid)) return res.status(400).json({ success: false, message: 'Valid product is required.' });
      if (qty <= 0) return res.status(400).json({ success: false, message: 'Planned quantity must be greater than zero.' });

      const pool = getPgOrThrow();
      const prodRes = await pool.query(`SELECT id, product_code, name, uom FROM products WHERE id = $1`, [pid]);
      if (prodRes.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Selected product was not found in PostgreSQL.' });
      }
      const product = prodRes.rows[0];
      const woNumber = makeDocNo('WO');

      const ins = await pool.query(
        `INSERT INTO work_orders
         (wo_number, product_id, product_code, product_name, bom_id, warehouse_id, warehouse_name, planned_quantity, unit_of_measure, priority, status, planned_start_date, planned_end_date, assigned_team, supervisor_name, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'planned', $11, $12, $13, $14, $15, $16)
         RETURNING *`,
        [
          woNumber,
          product.id,
          product.product_code,
          product.name,
          bom_id ? parseInt(String(bom_id), 10) : null,
          warehouse_id ? parseInt(String(warehouse_id), 10) : null,
          warehouse_name ? String(warehouse_name).trim() : null,
          qty,
          unit_of_measure ? String(unit_of_measure).trim() : product.uom || 'PCS',
          priority ? String(priority).trim() : 'medium',
          planned_start_date || null,
          planned_end_date || null,
          assigned_team ? String(assigned_team).trim() : null,
          supervisor_name ? String(supervisor_name).trim() : null,
          notes ? String(notes).trim() : null,
          actorLabel(req),
        ]
      );
      return res.status(201).json({
        success: true,
        message: `Work Order ${woNumber} created.`,
        data: { ...ins.rows[0], completion_percent: 0, progress_logs: [] },
      });
    } catch (err) {
      return handleErpError(res, err, 'create work order');
    }
  });

  router.put('/production/work-orders/:id/status', authenticateToken, requirePermission('inventory.edit'), async (req: any, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { status } = req.body || {};
      const allowed = ['planned', 'in_progress', 'on_hold', 'completed', 'cancelled'];
      if (!allowed.includes(String(status))) {
        return res.status(400).json({ success: false, message: 'Invalid work order status.' });
      }
      const pool = getPgOrThrow();
      const upd = await pool.query(
        `UPDATE work_orders
         SET status = $1,
             actual_start_at = CASE WHEN $1 = 'in_progress' AND actual_start_at IS NULL THEN NOW() ELSE actual_start_at END,
             actual_end_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE actual_end_at END,
             updated_at = NOW()
         WHERE id = $2 RETURNING *`,
        [status, id]
      );
      if (upd.rows.length === 0) return res.status(404).json({ success: false, message: 'Work order not found.' });
      return res.json({ success: true, message: `Work order marked as ${status}.`, data: upd.rows[0] });
    } catch (err) {
      return handleErpError(res, err, 'update work order status');
    }
  });

  router.post('/production/work-orders/:id/progress', authenticateToken, requirePermission('inventory.edit'), async (req: any, res: Response) => {
    try {
      const woId = parseInt(req.params.id, 10);
      const { log_date, shift, team_name, operator_name, quantity_produced, quantity_scrapped, downtime_minutes, remarks } = req.body || {};
      const produced = Math.max(0, toNumber(quantity_produced, 0));
      const scrapped = Math.max(0, toNumber(quantity_scrapped, 0));
      if (produced <= 0 && scrapped <= 0) {
        return res.status(400).json({ success: false, message: 'Enter produced or scrapped quantity greater than zero.' });
      }
      const pool = getPgOrThrow();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const woRes = await client.query(`SELECT * FROM work_orders WHERE id = $1 FOR UPDATE`, [woId]);
        if (woRes.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ success: false, message: 'Work order not found.' });
        }
        const wo = woRes.rows[0];
        const newProduced = toNumber(wo.produced_quantity, 0) + produced;
        const newScrap = toNumber(wo.scrap_quantity, 0) + scrapped;
        const planned = toNumber(wo.planned_quantity, 0);
        const nextStatus = newProduced >= planned && planned > 0 ? 'completed' : 'in_progress';

        const logRes = await client.query(
          `INSERT INTO production_progress_logs
           (work_order_id, log_date, shift, team_name, operator_name, quantity_produced, quantity_scrapped, downtime_minutes, status_after, remarks, recorded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
          [
            woId,
            log_date || new Date().toISOString().slice(0, 10),
            shift ? String(shift).trim() : 'Day',
            team_name ? String(team_name).trim() : wo.assigned_team || null,
            operator_name ? String(operator_name).trim() : null,
            produced,
            scrapped,
            Math.max(0, parseInt(String(downtime_minutes || 0), 10) || 0),
            nextStatus,
            remarks ? String(remarks).trim() : null,
            actorLabel(req),
          ]
        );

        const updWo = await client.query(
          `UPDATE work_orders
           SET produced_quantity = $1,
               scrap_quantity = $2,
               status = $3,
               actual_start_at = COALESCE(actual_start_at, NOW()),
               actual_end_at = CASE WHEN $3 = 'completed' THEN NOW() ELSE actual_end_at END,
               updated_at = NOW()
           WHERE id = $4 RETURNING *`,
          [newProduced, newScrap, nextStatus, woId]
        );
        await client.query('COMMIT');
        return res.status(201).json({
          success: true,
          message: 'Production progress logged.',
          data: { work_order: updWo.rows[0], log: logRes.rows[0] },
        });
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }
    } catch (err) {
      return handleErpError(res, err, 'log production progress');
    }
  });

  // ==========================================================================
  // 7. PRODUCT READINESS (TEAM-WISE & PRODUCT-WISE COMPLETION TRACKING)
  // ==========================================================================

  router.get('/production/teams', authenticateToken, requirePermission('inventory.view'), async (_req: any, res: Response) => {
    try {
      const pool = getPgOrThrow();
      const result = await pool.query(`SELECT * FROM production_teams ORDER BY team_name ASC`);
      return res.json({ success: true, data: result.rows });
    } catch (err) {
      return handleErpError(res, err, 'production teams list');
    }
  });

  router.post('/production/teams', authenticateToken, requirePermission('inventory.create'), async (req: any, res: Response) => {
    try {
      const { team_code, team_name, department, lead_name, member_count } = req.body || {};
      if (!team_name || !String(team_name).trim()) {
        return res.status(400).json({ success: false, message: 'Team name is required.' });
      }
      const code = (team_code && String(team_code).trim().toUpperCase()) || makeDocNo('TM');
      const pool = getPgOrThrow();
      const ins = await pool.query(
        `INSERT INTO production_teams (team_code, team_name, department, lead_name, member_count)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [
          code,
          String(team_name).trim(),
          department ? String(department).trim() : null,
          lead_name ? String(lead_name).trim() : null,
          Math.max(1, parseInt(String(member_count || 1), 10) || 1),
        ]
      );
      return res.status(201).json({ success: true, message: 'Production team created.', data: ins.rows[0] });
    } catch (err) {
      return handleErpError(res, err, 'create production team');
    }
  });

  router.delete('/production/teams/:id', authenticateToken, requirePermission('inventory.delete'), async (req: any, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const pool = getPgOrThrow();
      const del = await pool.query(`DELETE FROM production_teams WHERE id = $1 RETURNING id`, [id]);
      if (del.rows.length === 0) return res.status(404).json({ success: false, message: 'Team not found.' });
      return res.json({ success: true, message: 'Production team deleted.' });
    } catch (err) {
      return handleErpError(res, err, 'delete production team');
    }
  });

  router.get('/production/readiness', authenticateToken, requirePermission('inventory.view'), async (_req: any, res: Response) => {
    try {
      const pool = getPgOrThrow();
      const [entries, productSummary, teamSummary] = await Promise.all([
        pool.query(
          `SELECT r.*, p.product_code, p.name AS product_name, wo.wo_number
           FROM product_readiness_tracking r
           INNER JOIN products p ON p.id = r.product_id
           LEFT JOIN work_orders wo ON wo.id = r.work_order_id
           ORDER BY r.last_updated_at DESC`
        ),
        pool.query(
          `SELECT p.id AS product_id, p.product_code, p.name AS product_name,
                  COUNT(r.id)::int AS stage_count,
                  COALESCE(SUM(r.target_units), 0)::numeric(14,2) AS total_target,
                  COALESCE(SUM(r.completed_units), 0)::numeric(14,2) AS total_completed,
                  COALESCE(ROUND(AVG(r.readiness_percent), 1), 0)::numeric(5,1) AS avg_readiness_percent
           FROM products p
           INNER JOIN product_readiness_tracking r ON r.product_id = p.id
           GROUP BY p.id, p.product_code, p.name
           ORDER BY avg_readiness_percent DESC`
        ),
        pool.query(
          `SELECT r.team_name,
                  COUNT(r.id)::int AS assigned_stages,
                  COUNT(DISTINCT r.product_id)::int AS products_count,
                  COALESCE(SUM(r.target_units), 0)::numeric(14,2) AS total_target,
                  COALESCE(SUM(r.completed_units), 0)::numeric(14,2) AS total_completed,
                  COALESCE(ROUND(AVG(r.readiness_percent), 1), 0)::numeric(5,1) AS avg_readiness_percent
           FROM product_readiness_tracking r
           GROUP BY r.team_name
           ORDER BY avg_readiness_percent DESC`
        ),
      ]);

      return res.json({
        success: true,
        data: {
          entries: entries.rows,
          product_summary: productSummary.rows,
          team_summary: teamSummary.rows,
        },
      });
    } catch (err) {
      return handleErpError(res, err, 'product readiness summary');
    }
  });

  router.post('/production/readiness', authenticateToken, requirePermission('inventory.create'), async (req: any, res: Response) => {
    try {
      const { product_id, work_order_id, team_id, team_name, stage_name, target_units, completed_units, blocker_notes } = req.body || {};
      const pid = parseInt(String(product_id), 10);
      if (!Number.isFinite(pid)) return res.status(400).json({ success: false, message: 'Product is required.' });
      if (!team_name || !String(team_name).trim()) return res.status(400).json({ success: false, message: 'Team name is required.' });
      if (!stage_name || !String(stage_name).trim()) return res.status(400).json({ success: false, message: 'Readiness stage is required.' });

      const target = Math.max(1, toNumber(target_units, 1));
      const completed = Math.min(target, Math.max(0, toNumber(completed_units, 0)));
      const pct = Number(((completed / target) * 100).toFixed(2));
      const status = pct >= 100 ? 'ready' : pct > 0 ? 'in_progress' : 'not_started';

      const pool = getPgOrThrow();
      const ins = await pool.query(
        `INSERT INTO product_readiness_tracking
         (product_id, work_order_id, team_id, team_name, stage_name, target_units, completed_units, readiness_percent, status, blocker_notes, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [
          pid,
          work_order_id ? parseInt(String(work_order_id), 10) : null,
          team_id ? parseInt(String(team_id), 10) : null,
          String(team_name).trim(),
          String(stage_name).trim(),
          target,
          completed,
          pct,
          status,
          blocker_notes ? String(blocker_notes).trim() : null,
          actorLabel(req),
        ]
      );
      return res.status(201).json({ success: true, message: 'Readiness stage added.', data: ins.rows[0] });
    } catch (err) {
      return handleErpError(res, err, 'create product readiness entry');
    }
  });

  router.put('/production/readiness/:id', authenticateToken, requirePermission('inventory.edit'), async (req: any, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { target_units, completed_units, blocker_notes, status: explicitStatus } = req.body || {};
      const pool = getPgOrThrow();
      const curRes = await pool.query(`SELECT * FROM product_readiness_tracking WHERE id = $1`, [id]);
      if (curRes.rows.length === 0) return res.status(404).json({ success: false, message: 'Readiness entry not found.' });
      const cur = curRes.rows[0];
      const target = Math.max(1, toNumber(target_units ?? cur.target_units, 1));
      const completed = Math.min(target, Math.max(0, toNumber(completed_units ?? cur.completed_units, 0)));
      const pct = Number(((completed / target) * 100).toFixed(2));
      const computedStatus = explicitStatus || (pct >= 100 ? 'ready' : pct > 0 ? 'in_progress' : 'not_started');

      const upd = await pool.query(
        `UPDATE product_readiness_tracking
         SET target_units = $1,
             completed_units = $2,
             readiness_percent = $3,
             status = $4,
             blocker_notes = $5,
             updated_by = $6,
             last_updated_at = NOW()
         WHERE id = $7 RETURNING *`,
        [target, completed, pct, computedStatus, blocker_notes !== undefined ? blocker_notes : cur.blocker_notes, actorLabel(req), id]
      );
      return res.json({ success: true, message: 'Product readiness updated.', data: upd.rows[0] });
    } catch (err) {
      return handleErpError(res, err, 'update product readiness');
    }
  });

  router.delete('/production/readiness/:id', authenticateToken, requirePermission('inventory.delete'), async (req: any, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const pool = getPgOrThrow();
      const del = await pool.query(`DELETE FROM product_readiness_tracking WHERE id = $1 RETURNING id`, [id]);
      if (del.rows.length === 0) return res.status(404).json({ success: false, message: 'Readiness entry not found.' });
      return res.json({ success: true, message: 'Readiness entry deleted.' });
    } catch (err) {
      return handleErpError(res, err, 'delete product readiness');
    }
  });

  // ==========================================================================
  // 8. REPORTING & ANALYTICS (100% LIVE POSTGRESQL AGGREGATIONS)
  // ==========================================================================

  router.get('/reports/analytics/stock', authenticateToken, requirePermission('menu.reports'), async (_req: any, res: Response) => {
    try {
      const pool = getPgOrThrow();
      const [summaryRes, byTypeRes, lowStockRes, movementsRes] = await Promise.all([
        pool.query(
          `SELECT COUNT(DISTINCT i.id)::int AS total_items,
                  COALESCE(SUM(sb.quantity_on_hand), 0)::numeric(14,2) AS total_units,
                  COALESCE(SUM(sb.quantity_on_hand * i.cost_price), 0)::numeric(14,2) AS total_valuation
           FROM inventory_items i
           LEFT JOIN stock_balances sb ON sb.item_id = i.id`
        ),
        pool.query(
          `SELECT COALESCE(i.item_type, 'raw_material') AS item_type,
                  COUNT(DISTINCT i.id)::int AS item_count,
                  COALESCE(SUM(sb.quantity_on_hand), 0)::numeric(14,2) AS total_qty,
                  COALESCE(SUM(sb.quantity_on_hand * i.cost_price), 0)::numeric(14,2) AS total_value
           FROM inventory_items i
           LEFT JOIN stock_balances sb ON sb.item_id = i.id
           GROUP BY COALESCE(i.item_type, 'raw_material')
           ORDER BY total_value DESC`
        ),
        pool.query(
          `SELECT i.id, i.code, i.name, i.category, COALESCE(i.item_type, 'raw_material') AS item_type,
                  i.min_stock_level,
                  COALESCE(SUM(sb.quantity_on_hand), 0)::numeric(12,2) AS on_hand
           FROM inventory_items i
           LEFT JOIN stock_balances sb ON sb.item_id = i.id
           GROUP BY i.id, i.code, i.name, i.category, i.item_type, i.min_stock_level
           HAVING COALESCE(SUM(sb.quantity_on_hand), 0) <= i.min_stock_level AND i.min_stock_level > 0
           ORDER BY on_hand ASC LIMIT 50`
        ),
        pool.query(
          `SELECT type, COUNT(*)::int AS tx_count, COALESCE(SUM(quantity), 0)::numeric(14,2) AS total_qty
           FROM stock_transactions
           GROUP BY type ORDER BY tx_count DESC`
        ),
      ]);

      return res.json({
        success: true,
        data: {
          summary: summaryRes.rows[0] || { total_items: 0, total_units: 0, total_valuation: 0 },
          by_item_type: byTypeRes.rows,
          low_stock_items: lowStockRes.rows,
          movements_by_type: movementsRes.rows,
        },
      });
    } catch (err) {
      return handleErpError(res, err, 'stock analytics report');
    }
  });

  router.get('/reports/analytics/purchasing', authenticateToken, requirePermission('menu.reports'), async (_req: any, res: Response) => {
    try {
      const pool = getPgOrThrow();
      const [prSummary, poSummary, spendBySupplier, grnQcSummary] = await Promise.all([
        pool.query(
          `SELECT COUNT(*)::int AS total_prs,
                  COUNT(*) FILTER (WHERE status = 'approved')::int AS approved_prs,
                  COUNT(*) FILTER (WHERE status = 'submitted')::int AS pending_prs,
                  COALESCE(SUM(total_amount), 0)::numeric(14,2) AS total_pr_value
           FROM purchase_requests`
        ),
        pool.query(
          `SELECT COUNT(*)::int AS total_pos,
                  COUNT(*) FILTER (WHERE status = 'received')::int AS completed_pos,
                  COUNT(*) FILTER (WHERE status IN ('issued', 'partially_received'))::int AS open_pos,
                  COALESCE(SUM(total_amount), 0)::numeric(14,2) AS total_po_spend
           FROM purchase_orders`
        ),
        pool.query(
          `SELECT supplier_id, supplier_name,
                  COUNT(*)::int AS po_count,
                  COALESCE(SUM(total_amount), 0)::numeric(14,2) AS total_spend
           FROM purchase_orders
           WHERE status <> 'cancelled'
           GROUP BY supplier_id, supplier_name
           ORDER BY total_spend DESC LIMIT 20`
        ),
        pool.query(
          `SELECT COUNT(*)::int AS total_grns,
                  COUNT(*) FILTER (WHERE stock_posted = TRUE)::int AS posted_grns,
                  COUNT(*) FILTER (WHERE qc_status = 'passed')::int AS qc_passed_grns,
                  COUNT(*) FILTER (WHERE qc_status = 'failed')::int AS qc_failed_grns
           FROM goods_receipt_notes`
        ),
      ]);

      return res.json({
        success: true,
        data: {
          purchase_requests: prSummary.rows[0] || {},
          purchase_orders: poSummary.rows[0] || {},
          spend_by_supplier: spendBySupplier.rows,
          goods_receiving: grnQcSummary.rows[0] || {},
        },
      });
    } catch (err) {
      return handleErpError(res, err, 'purchasing analytics report');
    }
  });

  router.get('/reports/analytics/production', authenticateToken, requirePermission('menu.reports'), async (_req: any, res: Response) => {
    try {
      const pool = getPgOrThrow();
      const [woSummary, byStatus, productOutput, readinessByTeam] = await Promise.all([
        pool.query(
          `SELECT COUNT(*)::int AS total_work_orders,
                  COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_work_orders,
                  COUNT(*) FILTER (WHERE status = 'in_progress')::int AS active_work_orders,
                  COALESCE(SUM(planned_quantity), 0)::numeric(14,2) AS total_planned,
                  COALESCE(SUM(produced_quantity), 0)::numeric(14,2) AS total_produced,
                  COALESCE(SUM(scrap_quantity), 0)::numeric(14,2) AS total_scrap
           FROM work_orders`
        ),
        pool.query(
          `SELECT status, COUNT(*)::int AS count, COALESCE(SUM(planned_quantity), 0)::numeric(14,2) AS planned_qty
           FROM work_orders GROUP BY status ORDER BY count DESC`
        ),
        pool.query(
          `SELECT product_code, product_name,
                  COUNT(*)::int AS orders_count,
                  COALESCE(SUM(planned_quantity), 0)::numeric(14,2) AS planned_qty,
                  COALESCE(SUM(produced_quantity), 0)::numeric(14,2) AS produced_qty,
                  COALESCE(SUM(scrap_quantity), 0)::numeric(14,2) AS scrap_qty
           FROM work_orders
           GROUP BY product_code, product_name
           ORDER BY produced_qty DESC LIMIT 20`
        ),
        pool.query(
          `SELECT team_name,
                  COUNT(*)::int AS tracked_stages,
                  COALESCE(ROUND(AVG(readiness_percent), 1), 0)::numeric(5,1) AS avg_readiness
           FROM product_readiness_tracking
           GROUP BY team_name ORDER BY avg_readiness DESC`
        ),
      ]);

      return res.json({
        success: true,
        data: {
          summary: woSummary.rows[0] || {},
          by_status: byStatus.rows,
          output_by_product: productOutput.rows,
          readiness_by_team: readinessByTeam.rows,
        },
      });
    } catch (err) {
      return handleErpError(res, err, 'production analytics report');
    }
  });

  router.get('/reports/analytics/employees', authenticateToken, requirePermission('menu.reports'), async (_req: any, res: Response) => {
    try {
      const pool = getPgOrThrow();
      const [summaryRes, byDepartment, topEmployees] = await Promise.all([
        pool.query(
          `SELECT
             (SELECT COUNT(*)::int FROM performance_employees) AS total_employees,
             (SELECT COUNT(*)::int FROM performance_employees WHERE is_active = TRUE) AS active_employees,
             (SELECT COUNT(*)::int FROM employee_performance_events) AS total_events,
             (SELECT COUNT(*)::int FROM employee_performance_events WHERE event_timestamp >= CURRENT_DATE) AS today_events`
        ),
        pool.query(
          `SELECT COALESCE(pe.department, 'Unassigned') AS department,
                  COUNT(DISTINCT pe.emp_id)::int AS employee_count,
                  COUNT(ev.id)::int AS completed_units
           FROM performance_employees pe
           LEFT JOIN employee_performance_events ev ON ev.emp_id = pe.emp_id
           GROUP BY COALESCE(pe.department, 'Unassigned')
           ORDER BY completed_units DESC`
        ),
        pool.query(
          `SELECT pe.emp_id, pe.first_name, pe.last_name, pe.department, pe.designation,
                  COUNT(ev.id)::int AS total_completed,
                  MAX(ev.event_timestamp) AS last_event_at
           FROM performance_employees pe
           LEFT JOIN employee_performance_events ev ON ev.emp_id = pe.emp_id
           GROUP BY pe.emp_id, pe.first_name, pe.last_name, pe.department, pe.designation
           ORDER BY total_completed DESC LIMIT 25`
        ),
      ]);

      return res.json({
        success: true,
        data: {
          summary: summaryRes.rows[0] || { total_employees: 0, active_employees: 0, total_events: 0, today_events: 0 },
          by_department: byDepartment.rows,
          top_performers: topEmployees.rows,
        },
      });
    } catch (err) {
      return handleErpError(res, err, 'employee analytics report');
    }
  });

  return router;
}
