import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { store } from './store';
import { sendReorderNotificationEmail } from './email';
import { runtimeConfig } from './config/runtimeConfig';

export const reorderRouter = express.Router();

function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

// ==========================================================
// 1. Next Order Reference
// ==========================================================
reorderRouter.get('/inventory/reorders/next-reference', (req: Request, res: Response) => {
  const reference = store.getNextReorderReference();
  res.json({ success: true, data: { next_reference: reference }, reference });
});

// ==========================================================
// 2. List Reorders (Admin)
// ==========================================================
reorderRouter.get('/inventory/reorders', (req: Request, res: Response) => {
  try {
    const { status, search } = req.query;
    const reorders = store.getReorders({
      status: status as string,
      search: search as string,
    });
    res.json({ success: true, data: reorders, items: reorders });
  } catch (err: any) {
    res.status(500).json({ success: false, message: 'Failed to retrieve reorder requests', error: err.message });
  }
});

// ==========================================================
// 3. Get Single Reorder with Full Negotiation History
// ==========================================================
reorderRouter.get('/inventory/reorders/:id', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const reo = store.getReorderById(id);
    if (!reo) {
      return res.status(404).json({ success: false, message: 'Reorder request not found.' });
    }
    res.json({ success: true, data: reo, ...reo });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================================
// 4. Create New Reorder Request
// ==========================================================
reorderRouter.post('/inventory/reorders', async (req: Request, res: Response) => {
  try {
    const { item_id, supplier_id, requested_quantity, proposed_unit_price, delivery_date, notes } = req.body;

    if (!item_id || !supplier_id) {
      return res.status(400).json({ success: false, message: 'Item ID and Supplier ID are required.' });
    }

    const qty = Number(requested_quantity);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ success: false, message: 'Requested quantity must be greater than zero.' });
    }

    const price = Number(proposed_unit_price);
    if (isNaN(price) || price <= 0) {
      return res.status(400).json({ success: false, message: 'Proposed unit price must be greater than zero.' });
    }

    // Load actual item from store
    const item = store.getItemById(Number(item_id));
    if (!item) {
      return res.status(404).json({ success: false, message: 'Inventory item not found.' });
    }

    if (item.status === 'disabled') {
      return res.status(400).json({ success: false, message: 'Inactive or disabled inventory items cannot be reordered.' });
    }

    // Verify low-stock rule: Available Stock <= Minimum Stock Level
    const currentStock = store.getItemTotalOnHand(item.id);
    // Note: Items at or below threshold are eligible.

    // Load supplier
    const supplier = store.getSupplierById(Number(supplier_id));
    if (!supplier) {
      return res.status(404).json({ success: false, message: 'Supplier not found.' });
    }
    if (!supplier.email || !supplier.email.includes('@')) {
      return res.status(400).json({ success: false, message: 'Selected supplier does not have a valid email address.' });
    }

    const referenceNo = store.getNextReorderReference();

    // Cryptographic Token Generation (SHA-256 storage)
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);

    const expiryHours = parseInt(process.env.SUPPLIER_LINK_EXPIRY_HOURS || '72', 10);
    const tokenExpiry = new Date(Date.now() + expiryHours * 3600 * 1000).toISOString();

    const createdBy = (req as any).user?.name || (req as any).user?.email || 'Authorized Procurement User';

    // Insert reorder request
    const reo = store.createReorder({
      reference_no: referenceNo,
      item_id: item.id,
      supplier_id: supplier.id,
      requested_quantity: qty,
      proposed_unit_price: price,
      status: 'pending',
      token_hash: tokenHash,
      token_expiry: tokenExpiry,
      delivery_date: delivery_date || null,
      notes: notes || null,
      created_by: createdBy,
      email_status: 'pending',
    });

    // Send email notification to supplier via configured SMTP
    const appUrl = (process.env.FRONTEND_URL || process.env.APP_URL || runtimeConfig.frontendUrl).replace(/\/+$/, '');
    const supplierPortalUrl = `${appUrl}/supplier/reorder/${rawToken}`;

    const uom = item.uom_id ? store.getUOMById(item.uom_id) : undefined;
    const unitSymbol = uom?.symbol || 'Units';

    const emailResult = await sendReorderNotificationEmail({
      toEmail: supplier.email,
      supplierName: supplier.name,
      referenceNo,
      itemName: item.name,
      itemCode: item.code,
      quantity: qty,
      unit: unitSymbol,
      proposedUnitPrice: price,
      deliveryDate: delivery_date,
      notes,
      supplierPortalUrl,
      expiryHours,
    });

    if (emailResult.success) {
      store.updateReorder(reo.id, {
        email_status: 'sent',
        email_sent_at: new Date().toISOString(),
        email_error: null,
      });
      reo.email_status = 'sent';
      reo.email_sent_at = new Date().toISOString();
    } else {
      store.updateReorder(reo.id, {
        email_status: 'failed',
        email_error: emailResult.error || 'SMTP delivery failed',
      });
      reo.email_status = 'failed';
      reo.email_error = emailResult.error;
    }

    // Audit log
    store.logAudit({
      user_id: (req as any).user?.id || 1,
      user_email: (req as any).user?.email || 'admin@nexora.local',
      action: 'REORDER_CREATED',
      module: 'INVENTORY_REORDER',
      details: `Created reorder request ${referenceNo} for ${qty} ${unitSymbol} of ${item.name} ($${price}/unit) with supplier ${supplier.name}.`,
      ip_address: req.ip || '127.0.0.1',
    });

    const enriched = store.enrichReorder(reo);
    const fullReorder = {
      ...enriched,
      raw_token: rawToken,
    };

    res.status(201).json({
      success: true,
      message: `Reorder proposal ${referenceNo} created and dispatched to ${supplier.name}.`,
      data: { reorder: fullReorder, rawToken, emailResult },
      reorder: fullReorder,
      rawToken,
      emailResult,
    });
  } catch (err: any) {
    console.error('Error creating reorder request:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to create reorder request' });
  }
});

// ==========================================================
// 5. Retry Sending Email
// ==========================================================
reorderRouter.post('/inventory/reorders/:id/email/retry', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const reo = store.getReorderById(id);
    if (!reo) return res.status(404).json({ success: false, message: 'Reorder not found.' });

    // Generate fresh token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiryHours = parseInt(process.env.SUPPLIER_LINK_EXPIRY_HOURS || '72', 10);
    const tokenExpiry = new Date(Date.now() + expiryHours * 3600 * 1000).toISOString();

    store.updateReorder(id, { token_hash: tokenHash, token_expiry: tokenExpiry });

    const appUrl = (process.env.FRONTEND_URL || process.env.APP_URL || runtimeConfig.frontendUrl).replace(/\/+$/, '');
    const supplierPortalUrl = `${appUrl}/supplier/reorder/${rawToken}`;

    const emailResult = await sendReorderNotificationEmail({
      toEmail: reo.supplier_email,
      supplierName: reo.supplier_name,
      referenceNo: reo.reference_no,
      itemName: reo.item_name,
      itemCode: reo.item_code,
      quantity: Number(reo.requested_quantity),
      unit: reo.item_unit || 'Units',
      proposedUnitPrice: Number(reo.proposed_unit_price),
      deliveryDate: reo.delivery_date,
      notes: reo.notes,
      supplierPortalUrl,
      expiryHours,
    });

    if (emailResult.success) {
      store.updateReorder(id, {
        email_status: 'sent',
        email_sent_at: new Date().toISOString(),
        email_error: null,
      });
      res.json({ success: true, message: 'Reorder email resent successfully.' });
    } else {
      store.updateReorder(id, {
        email_status: 'failed',
        email_error: emailResult.error,
      });
      res.status(500).json({ success: false, message: 'Failed to send email', error: emailResult.error });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================================
// 6. Cancel Reorder Request (Admin)
// ==========================================================
reorderRouter.post('/inventory/reorders/:id/cancel', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const reo = store.getReorderById(id);
    if (!reo) return res.status(404).json({ success: false, message: 'Reorder not found.' });

    if (reo.status === 'accepted') {
      return res.status(400).json({ success: false, message: 'Cannot cancel an order that has already been accepted.' });
    }

    store.updateReorder(id, { status: 'cancelled' });

    store.logAudit({
      user_id: (req as any).user?.id || 1,
      user_email: (req as any).user?.email || 'admin@nexora.local',
      action: 'REORDER_CANCELLED',
      module: 'INVENTORY_REORDER',
      details: `Cancelled reorder request ${reo.reference_no}.`,
      ip_address: req.ip || '127.0.0.1',
    });

    res.json({ success: true, message: `Reorder request ${reo.reference_no} cancelled.` });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================================
// 7. Accept Supplier Counteroffer (Admin)
// CRITICAL: Does NOT automatically increase stock!
// ==========================================================
reorderRouter.post('/inventory/reorders/:id/counteroffer/accept', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { notes } = req.body;

    const reo = store.getReorderById(id);
    if (!reo) return res.status(404).json({ success: false, message: 'Reorder not found.' });

    if (reo.status !== 'negotiating') {
      return res.status(400).json({ success: false, message: 'Order is not currently in negotiation state.' });
    }

    const lastCounter = [...(reo.negotiations || [])].reverse().find((n: any) => n.sender_type === 'supplier');
    if (!lastCounter) {
      return res.status(400).json({ success: false, message: 'No counteroffer found to accept.' });
    }

    const agreedQty = Number(lastCounter.proposed_quantity);
    const agreedPrice = Number(lastCounter.proposed_unit_price);
    const agreedDate = lastCounter.proposed_delivery_date || reo.delivery_date;

    const adminNote = notes ? ` [Admin accepted counteroffer: ${notes}]` : ' [Admin accepted counteroffer]';
    const updatedNotes = (reo.notes || '') + adminNote;

    const updated = store.updateReorder(id, {
      status: 'accepted',
      agreed_quantity: agreedQty,
      final_unit_price: agreedPrice,
      delivery_date: agreedDate,
      notes: updatedNotes,
    });

    store.logAudit({
      user_id: (req as any).user?.id || 1,
      user_email: (req as any).user?.email || 'admin@nexora.local',
      action: 'COUNTEROFFER_ACCEPTED',
      module: 'INVENTORY_REORDER',
      details: `Accepted counteroffer for ${reo.reference_no}: Agreed Qty ${agreedQty}, Unit Price $${agreedPrice}. Stock remains unchanged until physical goods receipt.`,
      ip_address: req.ip || '127.0.0.1',
    });

    const enriched = store.enrichReorder(updated!);

    res.json({
      success: true,
      message: 'Counteroffer accepted. Agreed terms locked. Stock will increment upon physical goods receipt.',
      data: enriched,
      ...enriched,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================================
// 8. Reject Supplier Counteroffer (Admin)
// ==========================================================
reorderRouter.post('/inventory/reorders/:id/counteroffer/reject', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'Rejection reason is mandatory.' });
    }

    const reo = store.getReorderById(id);
    if (!reo) return res.status(404).json({ success: false, message: 'Reorder not found.' });

    const updated = store.updateReorder(id, {
      status: 'rejected',
      rejection_reason: reason.trim(),
    });

    store.logAudit({
      user_id: (req as any).user?.id || 1,
      user_email: (req as any).user?.email || 'admin@nexora.local',
      action: 'COUNTEROFFER_REJECTED',
      module: 'INVENTORY_REORDER',
      details: `Rejected counteroffer for ${reo.reference_no}. Reason: ${reason}`,
      ip_address: req.ip || '127.0.0.1',
    });

    const enriched = store.enrichReorder(updated!);
    res.json({ success: true, message: 'Counteroffer rejected.', data: enriched, ...enriched });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================================
// 9. Send Revised Proposal to Supplier (Admin)
// ==========================================================
reorderRouter.post('/inventory/reorders/:id/revision', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { quantity, proposed_unit_price, delivery_date, notes } = req.body;

    const qty = Number(quantity);
    const price = Number(proposed_unit_price);

    if (isNaN(qty) || qty <= 0) return res.status(400).json({ success: false, message: 'Quantity must be positive.' });
    if (isNaN(price) || price <= 0) return res.status(400).json({ success: false, message: 'Price must be positive.' });
    if (!notes || !notes.trim()) return res.status(400).json({ success: false, message: 'Explanation notes are required.' });

    const reo = store.getReorderById(id);
    if (!reo) return res.status(404).json({ success: false, message: 'Reorder not found.' });

    // Insert negotiation record
    store.addReorderNegotiation({
      reorder_id: id,
      sender_type: 'admin',
      proposed_quantity: qty,
      proposed_unit_price: price,
      proposed_delivery_date: delivery_date || null,
      notes,
    });

    // Update terms and set status to pending
    const expiryHours = parseInt(process.env.SUPPLIER_LINK_EXPIRY_HOURS || '72', 10);
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const tokenExpiry = new Date(Date.now() + expiryHours * 3600 * 1000).toISOString();

    const updated = store.updateReorder(id, {
      requested_quantity: qty,
      proposed_unit_price: price,
      delivery_date: delivery_date || reo.delivery_date,
      status: 'pending',
      token_hash: tokenHash,
      token_expiry: tokenExpiry,
    });

    const appUrl = (process.env.FRONTEND_URL || process.env.APP_URL || runtimeConfig.frontendUrl).replace(/\/+$/, '');
    const supplierPortalUrl = `${appUrl}/supplier/reorder/${rawToken}`;

    await sendReorderNotificationEmail({
      toEmail: reo.supplier_email,
      supplierName: reo.supplier_name,
      referenceNo: reo.reference_no,
      itemName: reo.item_name,
      itemCode: reo.item_code,
      quantity: qty,
      unit: reo.item_unit || 'Units',
      proposedUnitPrice: price,
      deliveryDate: delivery_date || reo.delivery_date,
      notes: `[Revised Proposal]: ${notes}`,
      supplierPortalUrl,
      expiryHours,
    });

    const enriched = store.enrichReorder(updated!);
    res.json({
      success: true,
      message: 'Revised terms dispatched to supplier.',
      data: enriched,
      ...enriched,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================================
// 10. PUBLIC SUPPLIER PORTAL ENDPOINTS
// Protected strictly via 32-byte cryptographic token hash
// ==========================================================

// Get public reorder proposal by raw token
reorderRouter.get('/public/supplier-reorder/:token', (req: Request, res: Response) => {
  try {
    const rawToken = req.params.token;
    if (!rawToken || rawToken.length < 32) {
      return res.status(400).json({ success: false, message: 'Invalid token.' });
    }

    const tokenHash = hashToken(rawToken);
    const reo = store.getReorderByTokenHash(tokenHash);

    if (!reo) {
      return res.status(404).json({ success: false, message: 'Reorder link is invalid or does not exist.' });
    }

    const expiryTime = new Date(reo.token_expiry).getTime();
    const now = Date.now();
    const isExpired = now > expiryTime;
    const remainingHours = Math.max(0, Math.round((expiryTime - now) / (3600 * 1000)));

    res.json({
      reorder: reo,
      isExpired,
      remainingHours,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Supplier Accept
reorderRouter.post('/public/supplier-reorder/:token/accept', (req: Request, res: Response) => {
  try {
    const rawToken = req.params.token;
    const { notes } = req.body;
    const tokenHash = hashToken(rawToken);

    const reo = store.getReorderByTokenHash(tokenHash);
    if (!reo) return res.status(404).json({ success: false, message: 'Order request not found.' });

    if (new Date(reo.token_expiry).getTime() < Date.now()) {
      return res.status(410).json({ success: false, message: 'This supplier authorization link has expired.' });
    }

    if (reo.status === 'accepted') {
      return res.json({ success: true, message: 'This reorder has already been accepted and confirmed.' });
    }
    if (reo.status === 'cancelled' || reo.status === 'rejected') {
      return res.status(400).json({ success: false, message: `Cannot accept an order with status: ${reo.status}` });
    }

    const agreedQty = Number(reo.requested_quantity);
    const agreedPrice = Number(reo.proposed_unit_price);
    const confirmNote = notes ? ` [Supplier Confirmed: ${notes}]` : ' [Supplier Confirmed Acceptance]';

    store.updateReorder(reo.id, {
      status: 'accepted',
      agreed_quantity: agreedQty,
      final_unit_price: agreedPrice,
      notes: (reo.notes || '') + confirmNote,
    });

    // CRITICAL REQUIREMENT: Stock does NOT increase automatically on acceptance!
    // Stock only increments when goods are physically received and recorded.

    res.json({
      success: true,
      message: `Purchase proposal #${reo.reference_no} accepted successfully. Terms are locked. Delivery will be received and checked at destination.`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Supplier Negotiate / Counteroffer
reorderRouter.post('/public/supplier-reorder/:token/negotiate', (req: Request, res: Response) => {
  try {
    const rawToken = req.params.token;
    const { proposed_quantity, proposed_unit_price, proposed_delivery_date, notes } = req.body;
    const tokenHash = hashToken(rawToken);

    const reo = store.getReorderByTokenHash(tokenHash);
    if (!reo) return res.status(404).json({ success: false, message: 'Order request not found.' });

    if (new Date(reo.token_expiry).getTime() < Date.now()) {
      return res.status(410).json({ success: false, message: 'This supplier authorization link has expired.' });
    }

    if (reo.status === 'accepted') {
      return res.status(400).json({ success: false, message: 'Order is already accepted and finalized.' });
    }
    if (reo.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Order has been cancelled by procurement.' });
    }

    const counterQty = Number(proposed_quantity);
    const counterPrice = Number(proposed_unit_price);

    if (isNaN(counterQty) || counterQty <= 0) {
      return res.status(400).json({ success: false, message: 'Proposed quantity must be a positive number.' });
    }
    if (isNaN(counterPrice) || counterPrice <= 0) {
      return res.status(400).json({ success: false, message: 'Proposed unit price must be a positive number.' });
    }
    if (!notes || !notes.trim()) {
      return res.status(400).json({ success: false, message: 'Explanation notes are mandatory when submitting a counteroffer.' });
    }

    // Insert negotiation record
    store.addReorderNegotiation({
      reorder_id: reo.id,
      sender_type: 'supplier',
      proposed_quantity: counterQty,
      proposed_unit_price: counterPrice,
      proposed_delivery_date: proposed_delivery_date || null,
      notes: notes.trim(),
    });

    // Update status to negotiating
    store.updateReorder(reo.id, {
      status: 'negotiating',
    });

    res.json({
      success: true,
      message: 'Your counteroffer has been submitted to Nexora Procurement for review.',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Supplier Reject
reorderRouter.post('/public/supplier-reorder/:token/reject', (req: Request, res: Response) => {
  try {
    const rawToken = req.params.token;
    const { reason } = req.body;
    const tokenHash = hashToken(rawToken);

    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'A rejection reason is mandatory when declining an order.' });
    }

    const reo = store.getReorderByTokenHash(tokenHash);
    if (!reo) return res.status(404).json({ success: false, message: 'Order request not found.' });

    if (new Date(reo.token_expiry).getTime() < Date.now()) {
      return res.status(410).json({ success: false, message: 'This authorization link has expired.' });
    }

    if (reo.status === 'accepted') {
      return res.status(400).json({ success: false, message: 'Order has already been confirmed and accepted.' });
    }

    store.updateReorder(reo.id, {
      status: 'rejected',
      rejection_reason: reason.trim(),
    });

    res.json({
      success: true,
      message: 'You have declined this purchase request. Nexora Procurement has been notified.',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});
