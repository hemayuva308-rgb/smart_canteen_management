import { useState } from 'react';
import { api } from '../session.js';
import { Badge, Empty, ErrorBox, Field, FoodImage, Modal, Spinner, usePolling, useToast, Toast } from '../../shared/ui.jsx';
import { rupee } from '../../shared/format.js';

const BLANK = { name: '', description: '', category: '', price: '', imageUrl: '', isVeg: true, isAvailable: true };

export default function MenuAdmin() {
  const { data, error, loading, reload } = usePolling(() => api.get('/admin/menu'), 20000, []);
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState(null);
  const [toast, show] = useToast();

  async function save(e) {
    e.preventDefault(); setErr(null);
    const body = { name: edit.name, description: edit.description || '', category: edit.category, price: Number(edit.price), imageUrl: edit.imageUrl || '', isVeg: edit.isVeg, isAvailable: edit.isAvailable };
    try { edit._id ? await api.patch(`/admin/menu/${edit._id}`, body) : await api.post('/admin/menu', body); show('Saved'); setEdit(null); reload(); } catch (x) { setErr(x); }
  }
  const toggle = async (i) => { try { await api.patch(`/admin/menu/${i._id}/availability`, { isAvailable: !i.isAvailable }); reload(); } catch (x) { setErr(x); } };
  const remove = async (i) => { if (!window.confirm(`Remove ${i.name} from the menu? Past orders keep their record.`)) return; try { await api.del(`/admin/menu/${i._id}`); show('Removed'); reload(); } catch (x) { setErr(x); } };
  const set = (k) => (e) => setEdit({ ...edit, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-3xl font-extrabold">Menu</h1><button className="btn btn-primary" onClick={() => { setErr(null); setEdit({ ...BLANK }); }}>Add dish</button></div>
      <ErrorBox error={err || error} />
      {loading && !data && <Spinner />}
      {data && !data.items.length && <Empty title="The menu is empty" hint="Add your first dish so students can order." />}
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data?.items.map((i) => (
          <li key={i._id} className="card flex gap-3 p-3"><FoodImage src={i.imageUrl} alt="" className="h-20 w-20 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1"><p className="truncate font-bold">{i.name}</p><p className="text-sm text-black/60">{i.category} · {rupee(i.price)}</p><Badge value={i.isAvailable ? 'AVAILABLE' : 'RETIRED'} label={i.isAvailable ? 'On sale' : 'Sold out'} />
              <div className="mt-2 flex flex-wrap gap-2"><button className="btn btn-ghost btn-sm" onClick={() => toggle(i)}>{i.isAvailable ? 'Mark sold out' : 'Put on sale'}</button><button className="btn btn-ghost btn-sm" onClick={() => { setErr(null); setEdit(i); }}>Edit</button><button className="btn btn-ghost btn-sm" onClick={() => remove(i)}>Remove</button></div></div></li>
        ))}
      </ul>
      {edit && (
        <Modal title={edit._id ? 'Edit dish' : 'Add dish'} onClose={() => setEdit(null)}>
          <form onSubmit={save} className="space-y-3">
            <Field label="Name"><input className="input" required value={edit.name} onChange={set('name')} /></Field>
            <Field label="Description"><input className="input" value={edit.description} onChange={set('description')} maxLength={300} /></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="Category"><input className="input" required list="cats" value={edit.category} onChange={set('category')} /></Field><Field label="Price (₹)"><input className="input" type="number" min="0" step="1" required value={edit.price} onChange={set('price')} /></Field></div>
            <datalist id="cats">{[...new Set((data?.items || []).map((i) => i.category))].map((c) => <option key={c} value={c} />)}</datalist>
            <Field label="Dish photo" hint="Upload your own real photo (JPEG, PNG or WebP, max 3 MB), or paste a link. Leave empty for the default picture.">
              <div className="space-y-2">
                {edit.imageUrl && <FoodImage src={edit.imageUrl} alt="" className="h-28 w-full rounded-xl" />}
                <input type="file" accept="image/*" className="input" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { const fd = new FormData(); fd.append('photo', f); const r = await api.upload('/admin/menu/image', fd); setEdit((x) => ({ ...x, imageUrl: r.imageUrl })); setErr(null); } catch (x) { setErr(x); } }} />
                <input className="input" placeholder="…or paste an image link" value={edit.imageUrl} onChange={set('imageUrl')} />
              </div>
            </Field>
            <div className="flex gap-5 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={edit.isVeg} onChange={set('isVeg')} /> Vegetarian</label><label className="flex items-center gap-2"><input type="checkbox" checked={edit.isAvailable} onChange={set('isAvailable')} /> On sale</label></div>
            <ErrorBox error={err} />
            <button className="btn btn-primary w-full">Save dish</button>
          </form>
        </Modal>
      )}
      <Toast toast={toast} />
    </div>
  );
}
