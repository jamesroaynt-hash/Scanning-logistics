/**
 * InventoryService
 * ----------------
 * Product catalogue + pickup ledger backed by SQLite. Stock math runs
 * inside transactions so a pickup can never produce negative inventory
 * even if two operators submit at once.
 *
 * Tables:
 *  - products              (catalogue + running counters)
 *  - pickup_transactions   (append-only ledger of every deduction)
 */
import { randomUUID } from 'crypto';
import db from './db.service.js';

const LOW_STOCK = 'LOW STOCK';
const NORMAL = 'NORMAL';

const insertProductStmt = db.prepare(`
  INSERT INTO products
    (id, name, available_supplies, shipped_count, status, price_per_qty, reorder_point, created_at, updated_at)
  VALUES
    (@id, @name, @availableSupplies, 0, @status, @pricePerQty, @reorderPoint, @createdAt, @updatedAt)
`);

const updateProductStmt = db.prepare(`
  UPDATE products
     SET name = @name,
         available_supplies = @availableSupplies,
         status = @status,
         price_per_qty = @pricePerQty,
         reorder_point = @reorderPoint,
         updated_at = @updatedAt
   WHERE id = @id
`);

const getProductStmt = db.prepare(`SELECT * FROM products WHERE id = ?`);
const getProductByNameStmt = db.prepare(
  `SELECT * FROM products WHERE LOWER(name) = LOWER(?)`
);
const listProductsStmt = db.prepare(`SELECT * FROM products ORDER BY name ASC`);
const deleteProductStmt = db.prepare(`DELETE FROM products WHERE id = ?`);

const insertPickupStmt = db.prepare(`
  INSERT INTO pickup_transactions
    (id, product_id, product_name, quantity, operator, pickup_date, timestamp, type)
  VALUES
    (@id, @productId, @productName, @quantity, @operator, @pickupDate, @timestamp, @type)
`);

const deductStockStmt = db.prepare(`
  UPDATE products
     SET available_supplies = available_supplies - @quantity,
         shipped_count      = shipped_count + @quantity,
         updated_at         = @updatedAt
   WHERE id = @id
     AND available_supplies >= @quantity
     AND status = 'ACTIVE'
`);

const addStockStmt = db.prepare(`
  UPDATE products
     SET available_supplies = available_supplies + @quantity,
         updated_at         = @updatedAt
   WHERE id = @id
`);

const listTransactionsStmt = db.prepare(`
  SELECT * FROM pickup_transactions
   WHERE (@date IS NULL OR pickup_date = @date)
     AND (@type IS NULL OR type = @type)
   ORDER BY timestamp DESC
   LIMIT 500
`);

const summaryStmt = db.prepare(`
  SELECT
    COUNT(*)                                                AS total_products,
    SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END)      AS active_products,
    SUM(CASE WHEN available_supplies <= reorder_point
              AND status = 'ACTIVE' THEN 1 ELSE 0 END)      AS low_stock_items
  FROM products
`);

const shippedTodayStmt = db.prepare(`
  SELECT COALESCE(SUM(quantity), 0) AS total
    FROM pickup_transactions
   WHERE pickup_date = ?
`);

function notifyStatus(row) {
  if (row.status !== 'ACTIVE') return NORMAL;
  return row.available_supplies <= row.reorder_point ? LOW_STOCK : NORMAL;
}

function rowToProduct(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    availableSupplies: row.available_supplies,
    shippedCount: row.shipped_count,
    status: row.status,
    pricePerQty: row.price_per_qty,
    reorderPoint: row.reorder_point,
    notifyStatus: notifyStatus(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToTransaction(row) {
  if (!row) return null;
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    quantity: row.quantity,
    operator: row.operator,
    pickupDate: row.pickup_date,
    timestamp: row.timestamp,
    type: row.type || 'PICKUP',
  };
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

class InventoryService {
  listProducts() {
    return listProductsStmt.all().map(rowToProduct);
  }

  getProduct(id) {
    return rowToProduct(getProductStmt.get(id));
  }

  createProduct({ name, availableSupplies, pricePerQty, reorderPoint, status }) {
    const cleanName = String(name || '').trim();
    if (!cleanName) throw badRequest('Product name is required');
    if (getProductByNameStmt.get(cleanName)) {
      throw badRequest(`Product "${cleanName}" already exists`);
    }
    const now = new Date().toISOString();
    const row = {
      id: randomUUID(),
      name: cleanName,
      availableSupplies: nonNegativeInt(availableSupplies, 'availableSupplies'),
      status: status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
      pricePerQty: nonNegativeNum(pricePerQty, 'pricePerQty'),
      reorderPoint: nonNegativeInt(reorderPoint, 'reorderPoint'),
      createdAt: now,
      updatedAt: now,
    };
    insertProductStmt.run(row);
    return this.getProduct(row.id);
  }

  updateProduct(id, patch) {
    const existing = getProductStmt.get(id);
    if (!existing) throw notFound('Product not found');

    const next = {
      id,
      name: patch.name !== undefined
        ? String(patch.name).trim() || existing.name
        : existing.name,
      availableSupplies: patch.availableSupplies !== undefined
        ? nonNegativeInt(patch.availableSupplies, 'availableSupplies')
        : existing.available_supplies,
      status: patch.status !== undefined
        ? (patch.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE')
        : existing.status,
      pricePerQty: patch.pricePerQty !== undefined
        ? nonNegativeNum(patch.pricePerQty, 'pricePerQty')
        : existing.price_per_qty,
      reorderPoint: patch.reorderPoint !== undefined
        ? nonNegativeInt(patch.reorderPoint, 'reorderPoint')
        : existing.reorder_point,
      updatedAt: new Date().toISOString(),
    };

    if (next.name.toLowerCase() !== existing.name.toLowerCase()) {
      const clash = getProductByNameStmt.get(next.name);
      if (clash && clash.id !== id) {
        throw badRequest(`Another product already uses "${next.name}"`);
      }
    }

    updateProductStmt.run(next);
    return this.getProduct(id);
  }

  deleteProduct(id) {
    const existing = getProductStmt.get(id);
    if (!existing) throw notFound('Product not found');
    deleteProductStmt.run(id);
    return { id };
  }

  /**
   * Atomically deduct stock and append a pickup transaction. The UPDATE
   * has a `available_supplies >= quantity AND status = 'ACTIVE'` guard so
   * concurrent submissions cannot push the count below zero.
   */
  recordPickup({ productId, quantity, operator, pickupDate }) {
    const qty = nonNegativeInt(quantity, 'quantity');
    if (qty <= 0) throw badRequest('Quantity must be greater than zero');

    const date = (pickupDate && /^\d{4}-\d{2}-\d{2}$/.test(pickupDate))
      ? pickupDate
      : todayISO();

    const tx = db.transaction(() => {
      const product = getProductStmt.get(productId);
      if (!product) throw notFound('Product not found');
      if (product.status !== 'ACTIVE') {
        throw badRequest('Product is inactive');
      }
      if (product.available_supplies < qty) {
        throw badRequest(
          `Only ${product.available_supplies} available — cannot pick up ${qty}`
        );
      }

      const result = deductStockStmt.run({
        id: productId,
        quantity: qty,
        updatedAt: new Date().toISOString(),
      });
      if (result.changes === 0) {
        throw badRequest('Stock changed during submit — please retry');
      }

      const entry = {
        id: randomUUID(),
        productId,
        productName: product.name,
        quantity: qty,
        operator: operator || 'unknown',
        pickupDate: date,
        timestamp: new Date().toISOString(),
        type: 'PICKUP',
      };
      insertPickupStmt.run(entry);
      return entry;
    });

    const entry = tx();
    return {
      transaction: entry,
      product: this.getProduct(productId),
    };
  }

  /**
   * Atomically add stock to a product and append a RESTOCK transaction.
   * Works for ACTIVE or INACTIVE products (so admins can replenish a
   * paused SKU without flipping its status first).
   */
  recordRestock({ productId, quantity, operator, restockDate }) {
    const qty = nonNegativeInt(quantity, 'quantity');
    if (qty <= 0) throw badRequest('Quantity must be greater than zero');

    const date = (restockDate && /^\d{4}-\d{2}-\d{2}$/.test(restockDate))
      ? restockDate
      : todayISO();

    const tx = db.transaction(() => {
      const product = getProductStmt.get(productId);
      if (!product) throw notFound('Product not found');

      const result = addStockStmt.run({
        id: productId,
        quantity: qty,
        updatedAt: new Date().toISOString(),
      });
      if (result.changes === 0) {
        throw badRequest('Failed to restock — please retry');
      }

      const entry = {
        id: randomUUID(),
        productId,
        productName: product.name,
        quantity: qty,
        operator: operator || 'unknown',
        pickupDate: date,
        timestamp: new Date().toISOString(),
        type: 'RESTOCK',
      };
      insertPickupStmt.run(entry);
      return entry;
    });

    const entry = tx();
    return {
      transaction: entry,
      product: this.getProduct(productId),
    };
  }

  listTransactions({ date, type } = {}) {
    return listTransactionsStmt
      .all({ date: date || null, type: type || null })
      .map(rowToTransaction);
  }

  summary() {
    const s = summaryStmt.get() || {};
    const t = shippedTodayStmt.get(todayISO()) || {};
    return {
      totalProducts: s.total_products || 0,
      activeProducts: s.active_products || 0,
      lowStockItems: s.low_stock_items || 0,
      shippedToday: t.total || 0,
    };
  }
}

function badRequest(msg) {
  const err = new Error(msg);
  err.status = 400;
  return err;
}
function notFound(msg) {
  const err = new Error(msg);
  err.status = 404;
  return err;
}
function nonNegativeInt(v, field) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw badRequest(`${field} must be a non-negative integer`);
  }
  return n;
}
function nonNegativeNum(v, field) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) {
    throw badRequest(`${field} must be a non-negative number`);
  }
  return n;
}

export default new InventoryService();
