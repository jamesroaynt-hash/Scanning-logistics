/**
 * InventoryService — product catalogue + pickup/restock ledger.
 *
 * Backed by public.inventory + public.inventory_logs. The app's
 * external product ID is `item_id` (a text UUID we generate); the
 * integer `inventory.id` PK is internal to Postgres and unused.
 *
 * Stock changes happen inside a SELECT ... FOR UPDATE transaction
 * so a pickup can never produce negative stock under concurrent
 * submits.
 */
import { randomUUID } from 'crypto';
import db from './db.service.js';

const ACTIVE = 'ACTIVE';
const INACTIVE = 'INACTIVE';
const LOW_STOCK = 'LOW STOCK';
const NORMAL = 'NORMAL';

function rowToProduct(row) {
  if (!row) return null;
  const status = row.status || ACTIVE;
  const stock = row.stock ?? 0;
  const reorderPt = row.reorder_pt ?? 0;
  const notify = status !== ACTIVE ? NORMAL : (stock <= reorderPt ? LOW_STOCK : NORMAL);
  return {
    id: row.item_id,
    name: row.name,
    availableSupplies: stock,
    shippedCount: row.shipped_count ?? 0,
    status,
    pricePerQty: row.sell_price ?? 0,
    reorderPoint: reorderPt,
    notifyStatus: notify,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToTransaction(row) {
  if (!row) return null;
  const type = row.action === 'add' ? 'RESTOCK' : 'PICKUP';
  const ts = row.created_at instanceof Date
    ? row.created_at.toISOString()
    : row.created_at;
  return {
    id: String(row.id),
    productId: row.item_id,
    productName: row.product_name || row.name || '',
    quantity: Math.abs(row.qty_change ?? 0),
    operator: row.operator_username || 'unknown',
    pickupDate: row.pickup_date || (typeof ts === 'string' ? ts.slice(0, 10) : null),
    timestamp: ts,
    type,
  };
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
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function userIdByUsername(client, username) {
  if (!username) return null;
  const { rows } = await client.query(
    'SELECT id FROM public.users WHERE username = $1 LIMIT 1',
    [username]
  );
  return rows[0]?.id ?? null;
}

const PRODUCT_COLS = `
  item_id, name, stock, shipped_count, status, sell_price, reorder_pt,
  created_at, updated_at
`;

class InventoryService {
  async listProducts() {
    const { rows } = await db.query(
      `SELECT ${PRODUCT_COLS}
         FROM public.inventory
        ORDER BY name ASC`
    );
    return rows.map(rowToProduct);
  }

  async getProduct(id) {
    const { rows } = await db.query(
      `SELECT ${PRODUCT_COLS}
         FROM public.inventory
        WHERE item_id = $1`,
      [id]
    );
    return rowToProduct(rows[0]);
  }

  async _getByName(name) {
    const { rows } = await db.query(
      `SELECT ${PRODUCT_COLS}
         FROM public.inventory
        WHERE LOWER(name) = LOWER($1)`,
      [name]
    );
    return rows[0] || null;
  }

  async createProduct({ name, availableSupplies, pricePerQty, reorderPoint, status }) {
    const cleanName = String(name || '').trim();
    if (!cleanName) throw badRequest('Product name is required');
    if (await this._getByName(cleanName)) {
      throw badRequest(`Product "${cleanName}" already exists`);
    }

    const itemId = randomUUID();
    const stock = nonNegativeInt(availableSupplies, 'availableSupplies');
    const sellPrice = nonNegativeNum(pricePerQty, 'pricePerQty');
    const reorderPt = nonNegativeInt(reorderPoint, 'reorderPoint');
    const cleanStatus = status === INACTIVE ? INACTIVE : ACTIVE;
    const now = new Date().toISOString();

    await db.query(
      `INSERT INTO public.inventory
         (item_id, name, type, unit, stock, reorder_pt, sell_price, status,
          shipped_count, created_at, updated_at)
       VALUES ($1, $2, 'Product', 'pcs', $3, $4, $5, $6, 0, $7, $7)`,
      [itemId, cleanName, stock, reorderPt, sellPrice, cleanStatus, now]
    );
    return this.getProduct(itemId);
  }

  async updateProduct(id, patch) {
    const existing = await this.getProduct(id);
    if (!existing) throw notFound('Product not found');

    const next = {
      name: patch.name !== undefined
        ? (String(patch.name).trim() || existing.name)
        : existing.name,
      availableSupplies: patch.availableSupplies !== undefined
        ? nonNegativeInt(patch.availableSupplies, 'availableSupplies')
        : existing.availableSupplies,
      status: patch.status !== undefined
        ? (patch.status === INACTIVE ? INACTIVE : ACTIVE)
        : existing.status,
      pricePerQty: patch.pricePerQty !== undefined
        ? nonNegativeNum(patch.pricePerQty, 'pricePerQty')
        : existing.pricePerQty,
      reorderPoint: patch.reorderPoint !== undefined
        ? nonNegativeInt(patch.reorderPoint, 'reorderPoint')
        : existing.reorderPoint,
    };

    if (next.name.toLowerCase() !== existing.name.toLowerCase()) {
      const clash = await this._getByName(next.name);
      if (clash && clash.item_id !== id) {
        throw badRequest(`Another product already uses "${next.name}"`);
      }
    }

    await db.query(
      `UPDATE public.inventory
          SET name = $1, stock = $2, status = $3, sell_price = $4,
              reorder_pt = $5, updated_at = now()
        WHERE item_id = $6`,
      [next.name, next.availableSupplies, next.status, next.pricePerQty,
       next.reorderPoint, id]
    );
    return this.getProduct(id);
  }

  async deleteProduct(id) {
    const existing = await this.getProduct(id);
    if (!existing) throw notFound('Product not found');
    await db.query('DELETE FROM public.inventory WHERE item_id = $1', [id]);
    return { id };
  }

  async recordPickup({ productId, quantity, operator, pickupDate }) {
    const qty = nonNegativeInt(quantity, 'quantity');
    if (qty <= 0) throw badRequest('Quantity must be greater than zero');

    const date = (pickupDate && /^\d{4}-\d{2}-\d{2}$/.test(pickupDate))
      ? pickupDate
      : todayISO();

    return db.withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT item_id, name, stock, status
           FROM public.inventory
          WHERE item_id = $1
            FOR UPDATE`,
        [productId]
      );
      const product = rows[0];
      if (!product) throw notFound('Product not found');
      if (product.status !== ACTIVE) throw badRequest('Product is inactive');
      if (product.stock < qty) {
        throw badRequest(
          `Only ${product.stock} available — cannot pick up ${qty}`
        );
      }

      const qtyBefore = product.stock;
      const qtyAfter = qtyBefore - qty;

      await client.query(
        `UPDATE public.inventory
            SET stock = $1,
                shipped_count = shipped_count + $2,
                updated_at = now()
          WHERE item_id = $3`,
        [qtyAfter, qty, productId]
      );

      const userId = await userIdByUsername(client, operator);

      const ins = await client.query(
        `INSERT INTO public.inventory_logs
           (item_id, action, qty_before, qty_change, qty_after,
            created_by, pickup_date, notes)
         VALUES ($1, 'remove', $2, $3, $4, $5, $6, $7)
         RETURNING id, item_id, action, qty_change, pickup_date, created_at`,
        [productId, qtyBefore, -qty, qtyAfter, userId, date,
         `Pickup by ${operator || 'unknown'}`]
      );

      const updated = await client.query(
        `SELECT ${PRODUCT_COLS}
           FROM public.inventory WHERE item_id = $1`,
        [productId]
      );

      return {
        transaction: rowToTransaction({
          ...ins.rows[0],
          product_name: product.name,
          operator_username: operator,
        }),
        product: rowToProduct(updated.rows[0]),
      };
    });
  }

  async recordRestock({ productId, quantity, operator, restockDate }) {
    const qty = nonNegativeInt(quantity, 'quantity');
    if (qty <= 0) throw badRequest('Quantity must be greater than zero');

    const date = (restockDate && /^\d{4}-\d{2}-\d{2}$/.test(restockDate))
      ? restockDate
      : todayISO();

    return db.withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT item_id, name, stock, status
           FROM public.inventory
          WHERE item_id = $1
            FOR UPDATE`,
        [productId]
      );
      const product = rows[0];
      if (!product) throw notFound('Product not found');

      const qtyBefore = product.stock;
      const qtyAfter = qtyBefore + qty;

      await client.query(
        `UPDATE public.inventory
            SET stock = $1, updated_at = now()
          WHERE item_id = $2`,
        [qtyAfter, productId]
      );

      const userId = await userIdByUsername(client, operator);

      const ins = await client.query(
        `INSERT INTO public.inventory_logs
           (item_id, action, qty_before, qty_change, qty_after,
            created_by, pickup_date, notes)
         VALUES ($1, 'add', $2, $3, $4, $5, $6, $7)
         RETURNING id, item_id, action, qty_change, pickup_date, created_at`,
        [productId, qtyBefore, qty, qtyAfter, userId, date,
         `Restock by ${operator || 'unknown'}`]
      );

      const updated = await client.query(
        `SELECT ${PRODUCT_COLS}
           FROM public.inventory WHERE item_id = $1`,
        [productId]
      );

      return {
        transaction: rowToTransaction({
          ...ins.rows[0],
          product_name: product.name,
          operator_username: operator,
        }),
        product: rowToProduct(updated.rows[0]),
      };
    });
  }

  async listTransactions({ date, type } = {}) {
    const where = [];
    const params = [];
    if (date) {
      params.push(date);
      where.push(`l.pickup_date = $${params.length}`);
    }
    if (type) {
      const action = type === 'RESTOCK' ? 'add' : (type === 'PICKUP' ? 'remove' : null);
      if (action) {
        params.push(action);
        where.push(`l.action = $${params.length}`);
      }
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const { rows } = await db.query(
      `SELECT l.id, l.item_id, l.action, l.qty_change, l.pickup_date,
              l.created_at, l.created_by,
              i.name AS product_name,
              u.username AS operator_username
         FROM public.inventory_logs l
         LEFT JOIN public.inventory i ON i.item_id = l.item_id
         LEFT JOIN public.users u ON u.id = l.created_by
         ${clause}
        ORDER BY l.created_at DESC
        LIMIT 500`,
      params
    );
    return rows.map(rowToTransaction);
  }

  async summary() {
    const inv = await db.query(
      `SELECT
         COUNT(*)::int AS total_products,
         SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END)::int AS active_products,
         SUM(CASE WHEN status = 'ACTIVE' AND stock <= reorder_pt THEN 1 ELSE 0 END)::int AS low_stock_items
       FROM public.inventory`
    );
    const shipped = await db.query(
      `SELECT COALESCE(SUM(ABS(qty_change)), 0)::int AS total
         FROM public.inventory_logs
        WHERE action = 'remove' AND pickup_date = $1`,
      [todayISO()]
    );
    return {
      totalProducts: inv.rows[0]?.total_products ?? 0,
      activeProducts: inv.rows[0]?.active_products ?? 0,
      lowStockItems: inv.rows[0]?.low_stock_items ?? 0,
      shippedToday: shipped.rows[0]?.total ?? 0,
    };
  }
}

export default new InventoryService();
