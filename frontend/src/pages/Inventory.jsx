/**
 * Inventory — product catalogue + daily pickup form.
 * Tab 1: dashboard table with search/filter/sort, editable reorder
 *        point, status toggle, summary cards, and (admin) add/delete.
 * Tab 2: pickup form that atomically deducts stock server-side.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

const SORTS = [
  { value: 'name', label: 'Name' },
  { value: 'availableSupplies', label: 'Stock' },
  { value: 'shippedCount', label: 'Shipped' },
  { value: 'pricePerQty', label: 'Price' },
  { value: 'totalValue', label: 'Total value' },
  { value: 'reorderPoint', label: 'Reorder' },
];

const fmtMoney = (n) =>
  `₱${Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'LOW', label: 'Low stock' },
];

export default function Inventory() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [tab, setTab] = useState('dashboard');
  const [products, setProducts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [list, sum] = await Promise.all([
        api.inventory.list(),
        api.inventory.summary(),
      ]);
      setProducts(list.products);
      setSummary(sum);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const flash = (text) => {
    setMsg(text);
    setTimeout(() => setMsg(''), 2500);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-display font-bold text-2xl">Inventory</h1>
        <button onClick={loadAll} className="btn-ghost">⟳ Refresh</button>
      </div>

      <div className="flex gap-1 p-1 bg-ink-800/60 rounded-lg w-fit border border-ink-700">
        <TabButton active={tab === 'dashboard'} onClick={() => setTab('dashboard')}>
          ▦ Dashboard
        </TabButton>
        <TabButton active={tab === 'pickup'} onClick={() => setTab('pickup')}>
          ⇪ Pick Up Form
        </TabButton>
        <TabButton active={tab === 'restock'} onClick={() => setTab('restock')}>
          ⇩ Restock Form
        </TabButton>
      </div>

      {err && (
        <div className="text-sm text-signal-red bg-signal-red/10 border border-signal-red/30 rounded-lg px-3 py-2">
          {err}
        </div>
      )}
      {msg && (
        <div className="text-sm text-signal-green bg-signal-green/10 border border-signal-green/30 rounded-lg px-3 py-2">
          {msg}
        </div>
      )}

      {tab === 'dashboard' && (
        <DashboardTab
          products={products}
          summary={summary}
          loading={loading}
          isAdmin={isAdmin}
          onChanged={loadAll}
          flash={flash}
          setErr={setErr}
        />
      )}
      {tab === 'pickup' && (
        <PickupTab
          products={products}
          onSubmitted={loadAll}
          flash={flash}
          setErr={setErr}
        />
      )}
      {tab === 'restock' && (
        <RestockTab
          products={products}
          onSubmitted={loadAll}
          flash={flash}
          setErr={setErr}
        />
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-md text-sm font-display font-medium transition ${
        active
          ? 'bg-accent text-ink-950 shadow shadow-accent-glow'
          : 'text-slate-300 hover:bg-ink-700'
      }`}
    >
      {children}
    </button>
  );
}

/* -------------------- TAB 1 -------------------- */

function DashboardTab({ products, summary, loading, isAdmin, onChanged, flash, setErr }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [showAdd, setShowAdd] = useState(false);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = products
      .map((p) => ({
        ...p,
        totalValue: Number(p.availableSupplies) * Number(p.pricePerQty),
      }))
      .filter((p) => {
        if (needle && !p.name.toLowerCase().includes(needle)) return false;
        if (filter === 'ACTIVE' || filter === 'INACTIVE') {
          return p.status === filter;
        }
        if (filter === 'LOW') {
          return p.notifyStatus === 'LOW STOCK';
        }
        return true;
      });
    list = [...list].sort((a, b) => {
      const va = a[sortBy];
      const vb = b[sortBy];
      let cmp;
      if (typeof va === 'number' && typeof vb === 'number') {
        cmp = va - vb;
      } else {
        cmp = String(va).localeCompare(String(vb));
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [products, q, filter, sortBy, sortDir]);

  const grandTotal = useMemo(
    () => filtered.reduce((acc, p) => acc + p.totalValue, 0),
    [filtered]
  );

  const toggleSort = (col) => {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
  };

  const updateRow = async (id, patch, label) => {
    try {
      await api.inventory.update(id, patch);
      flash(label || 'Updated');
      onChanged();
    } catch (e) {
      setErr(e.message);
    }
  };

  const removeRow = async (p) => {
    if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    try {
      await api.inventory.remove(p.id);
      flash('Product deleted');
      onChanged();
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard label="Total Products" value={summary?.totalProducts} />
        <SummaryCard
          label="Active Products"
          value={summary?.activeProducts}
          accent="text-signal-green"
        />
        <SummaryCard
          label="Low Stock Items"
          value={summary?.lowStockItems}
          accent="text-signal-red"
        />
        <SummaryCard
          label="Shipped Today"
          value={summary?.shippedToday}
          accent="text-accent"
        />
      </div>

      <div className="card p-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="text-[10px] uppercase tracking-widest text-slate-500">
            Search
          </label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Product name…"
            className="input !py-2 mt-1"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest text-slate-500">
            Filter
          </label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="input !py-2 mt-1 !w-auto"
          >
            {FILTERS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest text-slate-500">
            Sort by
          </label>
          <div className="flex gap-2 mt-1">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="input !py-2 !w-auto"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <button
              onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
              className="btn-ghost !py-2"
              title="Toggle direction"
            >
              {sortDir === 'asc' ? '▲' : '▼'}
            </button>
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowAdd(true)}
            className="btn-primary !py-2"
          >
            + Add Product
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            No products match. {isAdmin && 'Click "+ Add Product" to create one.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-widest text-slate-500 border-b border-ink-700">
                  <Th onClick={() => toggleSort('name')} active={sortBy === 'name'} dir={sortDir}>
                    Product
                  </Th>
                  <Th onClick={() => toggleSort('availableSupplies')} active={sortBy === 'availableSupplies'} dir={sortDir}>
                    Available
                  </Th>
                  <Th onClick={() => toggleSort('shippedCount')} active={sortBy === 'shippedCount'} dir={sortDir}>
                    Shipped
                  </Th>
                  <Th onClick={() => toggleSort('pricePerQty')} active={sortBy === 'pricePerQty'} dir={sortDir}>
                    Price/Qty
                  </Th>
                  <Th onClick={() => toggleSort('totalValue')} active={sortBy === 'totalValue'} dir={sortDir}>
                    Total Value
                  </Th>
                  <th className="px-4 py-3">Reorder</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Notify</th>
                  {isAdmin && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <ProductRow
                    key={p.id}
                    p={p}
                    isAdmin={isAdmin}
                    onUpdate={updateRow}
                    onDelete={removeRow}
                  />
                ))}
                <tr className="bg-ink-800/40 font-display">
                  <td className="px-4 py-3 font-bold text-slate-300" colSpan={4}>
                    Total ({filtered.length} product{filtered.length === 1 ? '' : 's'})
                  </td>
                  <td className="px-4 py-3 font-mono font-bold text-accent">
                    {fmtMoney(grandTotal)}
                  </td>
                  <td colSpan={isAdmin ? 4 : 3} />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && (
        <AddProductModal
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            flash('Product created');
            onChanged();
          }}
          setErr={setErr}
        />
      )}
    </>
  );
}

function Th({ children, onClick, active, dir }) {
  return (
    <th
      onClick={onClick}
      className="px-4 py-3 cursor-pointer select-none hover:text-slate-300"
    >
      {children}
      {active && <span className="ml-1">{dir === 'asc' ? '▲' : '▼'}</span>}
    </th>
  );
}

function SummaryCard({ label, value, accent }) {
  return (
    <div className="card p-5">
      <p className="text-[10px] uppercase tracking-widest text-slate-500">
        {label}
      </p>
      <p
        className={`mt-2 font-display font-bold text-4xl ${
          accent || 'text-slate-100'
        }`}
      >
        {value ?? '—'}
      </p>
    </div>
  );
}

function ProductRow({ p, isAdmin, onUpdate, onDelete }) {
  const [reorder, setReorder] = useState(String(p.reorderPoint));
  const isLow = p.notifyStatus === 'LOW STOCK';

  useEffect(() => { setReorder(String(p.reorderPoint)); }, [p.reorderPoint]);

  const commitReorder = () => {
    const n = Number(reorder);
    if (!Number.isInteger(n) || n < 0) {
      setReorder(String(p.reorderPoint));
      return;
    }
    if (n === p.reorderPoint) return;
    onUpdate(p.id, { reorderPoint: n }, 'Reorder point updated');
  };

  const toggleStatus = () => {
    const next = p.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    onUpdate(p.id, { status: next }, `Status → ${next}`);
  };

  return (
    <tr
      className={`border-b border-ink-800 hover:bg-ink-800/40 ${
        isLow ? 'bg-signal-red/5' : ''
      }`}
    >
      <td className="px-4 py-3">
        <span
          className={`inline-block w-2 h-2 rounded-full mr-2 align-middle ${
            isLow ? 'bg-signal-red' : 'bg-signal-green'
          }`}
        />
        <span className="font-medium">{p.name}</span>
      </td>
      <td className="px-4 py-3 font-mono">
        <span className={isLow ? 'text-signal-red font-semibold' : 'text-slate-200'}>
          {p.availableSupplies}
        </span>
      </td>
      <td className="px-4 py-3 font-mono text-slate-400">{p.shippedCount}</td>
      <td className="px-4 py-3 font-mono text-slate-300">
        ₱{Number(p.pricePerQty).toFixed(2)}
      </td>
      <td className="px-4 py-3 font-mono text-slate-100">
        {fmtMoney(Number(p.availableSupplies) * Number(p.pricePerQty))}
      </td>
      <td className="px-4 py-3">
        <input
          type="number"
          min="0"
          value={reorder}
          onChange={(e) => setReorder(e.target.value)}
          onBlur={commitReorder}
          onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
          className="input !py-1 !px-2 !w-20 font-mono text-center"
        />
      </td>
      <td className="px-4 py-3">
        <button
          onClick={toggleStatus}
          className={`status-badge ${
            p.status === 'ACTIVE'
              ? 'bg-signal-green/15 text-signal-green border border-signal-green/30'
              : 'bg-slate-500/15 text-slate-400 border border-slate-500/30'
          }`}
          title="Click to toggle"
        >
          {p.status}
        </button>
      </td>
      <td className="px-4 py-3">
        <span
          className={`status-badge ${
            isLow
              ? 'bg-signal-red/15 text-signal-red border border-signal-red/30'
              : 'bg-signal-green/10 text-signal-green border border-signal-green/30'
          }`}
        >
          {isLow ? '⚠ LOW STOCK' : '✓ NORMAL'}
        </span>
      </td>
      {isAdmin && (
        <td className="px-4 py-3 text-right">
          <button
            onClick={() => onDelete(p)}
            className="text-signal-red/70 hover:text-signal-red text-sm"
            title="Delete product"
          >
            ✕
          </button>
        </td>
      )}
    </tr>
  );
}

function AddProductModal({ onClose, onCreated, setErr }) {
  const [form, setForm] = useState({
    name: '',
    availableSupplies: '',
    pricePerQty: '',
    reorderPoint: '',
    status: 'ACTIVE',
  });
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.inventory.create({
        name: form.name,
        availableSupplies: Number(form.availableSupplies || 0),
        pricePerQty: Number(form.pricePerQty || 0),
        reorderPoint: Number(form.reorderPoint || 0),
        status: form.status,
      });
      onCreated();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <form onSubmit={submit} className="card p-6 w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-lg">Add Product</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-100 text-xl">
            ✕
          </button>
        </div>
        <Field label="Product name">
          <input
            required
            autoFocus
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="input !py-2"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Available supplies">
            <input
              type="number"
              min="0"
              required
              value={form.availableSupplies}
              onChange={(e) => setForm({ ...form, availableSupplies: e.target.value })}
              className="input !py-2 font-mono"
            />
          </Field>
          <Field label="Reorder point">
            <input
              type="number"
              min="0"
              required
              value={form.reorderPoint}
              onChange={(e) => setForm({ ...form, reorderPoint: e.target.value })}
              className="input !py-2 font-mono"
            />
          </Field>
          <Field label="Price per qty">
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={form.pricePerQty}
              onChange={(e) => setForm({ ...form, pricePerQty: e.target.value })}
              className="input !py-2 font-mono"
            />
          </Field>
          <Field label="Status">
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="input !py-2"
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
            </select>
          </Field>
        </div>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">
            Cancel
          </button>
          <button type="submit" disabled={submitting} className="btn-primary flex-1">
            {submitting ? 'Saving…' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-widest text-slate-500">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

/* -------------------- TAB 2 -------------------- */

function PickupTab({ products, onSubmitted, flash, setErr }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [recent, setRecent] = useState([]);

  const eligible = useMemo(
    () => products.filter((p) => p.status === 'ACTIVE' && p.availableSupplies > 0),
    [products]
  );

  const selected = products.find((p) => p.id === productId) || null;

  const loadRecent = useCallback(async () => {
    try {
      const { transactions } = await api.inventory.transactions({ date, type: 'PICKUP' });
      setRecent(transactions);
    } catch {
      setRecent([]);
    }
  }, [date]);

  useEffect(() => { loadRecent(); }, [loadRecent]);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    const qty = Number(quantity);
    if (!productId) { setErr('Select a product'); return; }
    if (!Number.isInteger(qty) || qty <= 0) {
      setErr('Quantity must be a positive whole number'); return;
    }
    if (selected && qty > selected.availableSupplies) {
      setErr(`Only ${selected.availableSupplies} in stock`); return;
    }
    setSubmitting(true);
    try {
      await api.inventory.pickup({ productId, quantity: qty, pickupDate: date });
      flash(`Picked up ${qty} × ${selected?.name}`);
      setQuantity('');
      onSubmitted();
      loadRecent();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <form onSubmit={submit} className="card p-6 space-y-4">
        <h2 className="font-display font-bold text-lg">New Pick Up</h2>

        <Field label="Date">
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input !py-2"
          />
        </Field>

        <Field label="Product">
          <select
            required
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="input !py-2"
          >
            <option value="">— Select an active product —</option>
            {eligible.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} (avail: {p.availableSupplies})
              </option>
            ))}
          </select>
          {eligible.length === 0 && (
            <p className="text-xs text-slate-500 mt-1">
              No active products with stock available.
            </p>
          )}
        </Field>

        <Field label="Quantity">
          <input
            type="number"
            min="1"
            max={selected?.availableSupplies || undefined}
            required
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder={selected ? `1 – ${selected.availableSupplies}` : '1'}
            className="input !py-2 font-mono"
          />
        </Field>

        {selected && (
          <div className="bg-ink-800/60 border border-ink-700 rounded-lg p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">Available now</span>
              <span className="font-mono">{selected.availableSupplies}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">After pickup</span>
              <span className="font-mono">
                {Number(quantity)
                  ? Math.max(0, selected.availableSupplies - Number(quantity))
                  : selected.availableSupplies}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Line total</span>
              <span className="font-mono">
                ₱{(Number(quantity || 0) * Number(selected.pricePerQty)).toFixed(2)}
              </span>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !productId || !quantity}
          className="btn-primary w-full"
        >
          {submitting ? 'Submitting…' : 'Submit Pickup'}
        </button>
      </form>

      <div className="card p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-bold text-lg">
            Pickups on {date}
          </h2>
          <button onClick={loadRecent} className="text-xs text-slate-500 hover:text-accent">
            ⟳
          </button>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-500">No pickups on this date.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {recent.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between bg-ink-800/40 border border-ink-700 rounded-lg px-3 py-2"
              >
                <div>
                  <p className="font-medium">{t.productName}</p>
                  <p className="text-xs text-slate-500">
                    by {t.operator} · {new Date(t.timestamp).toLocaleTimeString()}
                  </p>
                </div>
                <span className="font-mono text-accent">−{t.quantity}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* -------------------- TAB 3 -------------------- */

function RestockTab({ products, onSubmitted, flash, setErr }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [recent, setRecent] = useState([]);

  // Restock works on any product, including INACTIVE ones (so an admin
  // can replenish a paused SKU without flipping its status first).
  const selected = products.find((p) => p.id === productId) || null;

  const loadRecent = useCallback(async () => {
    try {
      const { transactions } = await api.inventory.transactions({ date, type: 'RESTOCK' });
      setRecent(transactions);
    } catch {
      setRecent([]);
    }
  }, [date]);

  useEffect(() => { loadRecent(); }, [loadRecent]);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    const qty = Number(quantity);
    if (!productId) { setErr('Select a product'); return; }
    if (!Number.isInteger(qty) || qty <= 0) {
      setErr('Quantity must be a positive whole number'); return;
    }
    setSubmitting(true);
    try {
      await api.inventory.restock({ productId, quantity: qty, restockDate: date });
      flash(`Restocked ${qty} × ${selected?.name}`);
      setQuantity('');
      onSubmitted();
      loadRecent();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <form onSubmit={submit} className="card p-6 space-y-4">
        <h2 className="font-display font-bold text-lg">Add Stock</h2>
        <p className="text-xs text-slate-500 -mt-2">
          Adds the entered quantity to the product's available supplies.
        </p>

        <Field label="Date">
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input !py-2"
          />
        </Field>

        <Field label="Product">
          <select
            required
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="input !py-2"
          >
            <option value="">— Select a product —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} (current: {p.availableSupplies})
                {p.status === 'INACTIVE' ? ' · INACTIVE' : ''}
              </option>
            ))}
          </select>
          {products.length === 0 && (
            <p className="text-xs text-slate-500 mt-1">
              No products yet. Add one from the Dashboard tab first.
            </p>
          )}
        </Field>

        <Field label="Quantity to add">
          <input
            type="number"
            min="1"
            required
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="e.g. 100"
            className="input !py-2 font-mono"
          />
        </Field>

        {selected && (
          <div className="bg-ink-800/60 border border-ink-700 rounded-lg p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">Current stock</span>
              <span className="font-mono">{selected.availableSupplies}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">After restock</span>
              <span className="font-mono text-signal-green">
                {selected.availableSupplies + (Number(quantity) || 0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Added value</span>
              <span className="font-mono">
                ₱{(Number(quantity || 0) * Number(selected.pricePerQty)).toFixed(2)}
              </span>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !productId || !quantity}
          className="btn-primary w-full"
        >
          {submitting ? 'Submitting…' : 'Add to Stock'}
        </button>
      </form>

      <div className="card p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-bold text-lg">
            Restocks on {date}
          </h2>
          <button onClick={loadRecent} className="text-xs text-slate-500 hover:text-accent">
            ⟳
          </button>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-500">No restocks on this date.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {recent.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between bg-ink-800/40 border border-ink-700 rounded-lg px-3 py-2"
              >
                <div>
                  <p className="font-medium">{t.productName}</p>
                  <p className="text-xs text-slate-500">
                    by {t.operator} · {new Date(t.timestamp).toLocaleTimeString()}
                  </p>
                </div>
                <span className="font-mono text-signal-green">+{t.quantity}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
