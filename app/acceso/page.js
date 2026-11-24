'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

async function api(url, options) {
  const response = await fetch(url, { cache: 'no-store', ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la operación');
  return data;
}

export default function Dashboard() {
  const [users, setUsers] = useState([]);
  const [accesses, setAccesses] = useState([]);
  const [device, setDevice] = useState({ connected: false, path: 'COM3' });
  const [live, setLive] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('Actividad');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('Todos');
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [toasts, setToasts] = useState([]);
  const [desktop, setDesktop] = useState(false);
  const desktopRef = useRef(false);
  const refreshVersion = useRef(0);
  const dialog = useRef(null);
  const notify = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(previous => [...previous.slice(-3), { id, message, type }]);
  }, []);
  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    try {
      const [a, u, d] = await Promise.all([api('/api/accesos'), api('/api/usuarios'), api('/api/estado')]);
      if (version !== refreshVersion.current) return;
      setAccesses(a); setUsers(u); setDevice(d); setLoaded(true); setError('');
    } catch { if (version === refreshVersion.current) setError('No se pudieron actualizar los datos. Comprueba la conexión e inténtalo de nuevo.'); }
  }, []);
  useEffect(() => {
    refresh();
    const events = new EventSource('/api/eventos');
    events.onopen = () => { setLive(true); refresh(); };
    events.onerror = () => setLive(false);
    events.addEventListener('estado', event => setDevice(JSON.parse(event.data)));
    events.addEventListener('actualizar', refresh);
    events.addEventListener('acceso', event => {
      const access = JSON.parse(event.data);
      const message = `${access.resultado === 'CONCEDIDO' ? 'Acceso concedido' : 'Acceso denegado'} · ${access.nombre} · ${access.uid}`;
      notify(message, access.resultado === 'CONCEDIDO' ? 'success' : 'error');
      if (desktopRef.current && 'Notification' in window && Notification.permission === 'granted') {
        try { new Notification('Umbral · Acceso RFID', { body: message }); } catch { /* Los avisos internos siguen disponibles. */ }
      }
      refresh();
    });
    const timer = setInterval(refresh, 15000);
    return () => { events.close(); clearInterval(timer); };
  }, [refresh, notify]);
  useEffect(() => {
    if (!toasts.length) return;
    const timer = setTimeout(() => setToasts(previous => previous.slice(1)), 7000);
    return () => clearTimeout(timer);
  }, [toasts]);
  useEffect(() => { setActionError(''); if (modal) dialog.current?.showModal(); else dialog.current?.close(); }, [modal]);

  async function action(url, body, method = 'POST') {
    setBusy(true);
    setActionError('');
    try {
      const result = await api(url, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
      notify(result.mensaje || (method === 'DELETE' ? 'Acceso revocado' : 'Comando enviado al lector'));
      setModal(null); await refresh();
    } catch (error) { setActionError(error.message); notify(error.message, 'error'); }
    finally { setBusy(false); }
  }
  async function toggleNotifications() {
    if (desktop) { setDesktop(false); desktopRef.current = false; return; }
    if (!('Notification' in window)) return notify('Este navegador no admite notificaciones de escritorio', 'error');
    try {
      const granted = await Notification.requestPermission() === 'granted';
      setDesktop(granted); desktopRef.current = granted;
      notify(granted ? 'Notificaciones activadas mientras el panel esté abierto' : 'Permiso no concedido. Los avisos del panel siguen activos.', granted ? 'success' : 'error');
    } catch { notify('No se pudo activar las notificaciones en este navegador', 'error'); }
  }
  const matches = row => `${row.nombre} ${row.uid}`.toLowerCase().includes(search.toLowerCase());
  const rows = accesses.filter(matches).filter(row => filter === 'Todos' || row.resultado === filter);
  const granted = accesses.filter(a => a.resultado === 'CONCEDIDO').length;
  const expired = user => user.expira && new Date(user.expira.replace(' ', 'T')) <= new Date();
  return <div className="shell">
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="Umbral, inicio"><span className="brand-icon">u.</span><span>umbral<small>CONTROL DE ACCESO</small></span></a>
      <p className="nav-label">ESPACIO DE TRABAJO</p>
      {['Actividad', 'Usuarios'].map((item, i) => <button key={item} className={`nav-item ${tab === item ? 'selected' : ''}`} onClick={() => { setTab(item); setSearch(''); }}><span aria-hidden="true">{i ? '▦' : '◫'}</span>{item}<span className="nav-arrow">↗</span></button>)}
      <div className="sidebar-bottom"><span className={`dot ${device.connected ? '' : 'offline'}`} /><strong>{device.connected ? 'Lector conectado' : 'Lector desconectado'}</strong><p>{device.path} · 2 relays</p><small>Control local · RFID</small></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><span>Tu espacio <span className="muted">/</span> <strong>{tab}</strong></span><button className="quiet" onClick={toggleNotifications}>{desktop ? '◉ Avisos activados' : '♧ Activar avisos'}</button></header>
      <main>
        <div className="page-heading"><div><p className="eyebrow">SEGURIDAD EN CADA ENTRADA</p><h1>{tab === 'Actividad' ? 'Todo bajo control.' : 'Personas y permisos.'}</h1><p className="muted">{tab === 'Actividad' ? 'Supervisa los accesos y gestiona tus puertas desde un solo lugar.' : 'Administra las tarjetas y la vigencia de cada acceso.'}</p></div><button className="primary" onClick={() => setModal({ type: 'permanent' })}>＋ Agregar usuario</button></div>
        {error && <div className="banner" role="alert">{error} <button onClick={refresh}>Reintentar</button></div>}
        {!live && <div className="connection-note" role="status">Conectando los avisos en tiempo real… Actualización de respaldo cada 15 segundos.</div>}
        <div className="stats">
          {[['Accesos recientes', accesses.length, 'Últimos 100 registros', '↗'], ['Concedidos', granted, 'Entradas autorizadas', '✓'], ['Denegados', accesses.length - granted, 'Intentos sin permiso', '⊘'], ['Usuarios vigentes', users.filter(u => !expired(u)).length, 'Tarjetas con acceso', '▦']].map(([label, value, detail, icon], i) => <section className={`stat stat-${i}`} key={label}><div>{label}<span aria-hidden="true">{icon}</span></div><strong>{loaded ? value : '—'}</strong><small>{detail}</small></section>)}
        </div>
        {tab === 'Actividad' && <section className="panel doors"><div className="section-heading"><div><h2>Acceso remoto</h2><p>Envía un comando de apertura al relay seleccionado.</p></div><span className={`pill ${device.connected ? 'success' : 'neutral'}`}><span className={`dot ${device.connected ? '' : 'offline'}`} />{device.connected ? 'Lector disponible' : 'Sin conexión'}</span></div><div className="door-grid">{[1, 2].map(relay => <div className="door" key={relay}><span className="door-icon" aria-hidden="true">⇥</span><div><h3>Relay {relay}</h3><p>{users.filter(u => Number(u.relay) === relay && !expired(u)).length} tarjetas con acceso</p></div><button disabled={!device.connected || busy} onClick={() => action('/api/abrir', { relay })}>Abrir puerta <span aria-hidden="true">↗</span></button></div>)}</div>{!device.connected && <p className="device-help">Conecta el lector a {device.path} para habilitar la apertura. La reconexión es automática.</p>}</section>}
        <section className="panel records"><div className="section-heading"><div><h2>{tab === 'Actividad' ? 'Historial de accesos' : 'Usuarios con acceso'}</h2><p>{tab === 'Actividad' ? 'Cada entrada, en un solo vistazo.' : 'Los pases vencidos se muestran, pero no permiten entrar.'}</p></div>{tab === 'Usuarios' ? <button className="secondary" onClick={() => setModal({ type: 'temporary' })}>＋ Pase temporal</button> : <span className="live-label"><span className={`dot ${live ? '' : 'offline'}`} />{live ? 'En tiempo real' : 'Reconectando'}</span>}</div>
          <div className="toolbar"><label className="search"><span aria-hidden="true">⌕</span><input aria-label="Buscar por nombre o UID" placeholder="Buscar por nombre o UID…" value={search} onChange={e => setSearch(e.target.value)} /></label>{tab === 'Actividad' && <div className="filters">{[['Todos','Todos'], ['CONCEDIDO','Concedidos'], ['DENEGADO','Denegados']].map(([value,label]) => <button key={value} aria-pressed={filter === value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}</button>)}</div>}</div>
          <div className="table-scroll"><table><thead><tr>{(tab === 'Actividad' ? ['PERSONA', 'TARJETA / UID', 'FECHA Y HORA', 'RESULTADO'] : ['PERSONA', 'TARJETA / UID', 'RELAY', 'VIGENCIA', '']).map((title, i) => <th key={i}>{title}</th>)}</tr></thead><tbody>{tab === 'Actividad' ? rows.map(row => <tr key={row.id}><td><span className={`avatar ${row.resultado === 'DENEGADO' ? 'denied' : ''}`}>{(row.nombre || '?').slice(0, 2).toUpperCase()}</span><strong>{row.nombre}</strong></td><td><code>{row.uid}</code></td><td className="muted">{row.timestamp}</td><td><span className={`pill ${row.resultado === 'CONCEDIDO' ? 'success' : 'danger'}`}>{row.resultado === 'CONCEDIDO' ? '✓ Concedido' : '⊘ Denegado'}</span></td></tr>) : users.filter(matches).map(user => <tr key={user.uid}><td><span className="avatar">{user.nombre.slice(0, 2).toUpperCase()}</span><strong>{user.nombre}</strong></td><td><code>{user.uid}</code></td><td>Relay {user.relay}</td><td><span className={`pill ${expired(user) ? 'danger' : 'neutral'}`}>{expired(user) ? 'Vencido · ' : ''}{user.expira || 'Permanente'}</span></td><td><button className="text-danger" onClick={() => setModal({ type: 'revoke', user })}>Revocar</button></td></tr>)}</tbody></table></div>
          {(!loaded || (tab === 'Actividad' ? !rows.length : !users.filter(matches).length)) && <div className="empty"><span aria-hidden="true">◎</span><h3>{!loaded ? 'Cargando tu panel…' : 'Sin resultados'}</h3><p>{!loaded ? 'Consultando el servidor local.' : search ? 'Prueba con otro nombre o UID.' : 'Los nuevos registros aparecerán aquí.'}</p></div>}
          <div className="table-footer">{tab === 'Actividad' ? `${rows.length} registros · Se muestran hasta 100 accesos recientes` : `${users.filter(matches).length} tarjetas registradas`}<span>UMBRAL / RFID</span></div>
        </section>
        <footer>Un espacio seguro empieza con un acceso controlado.<span>Panel local de acceso</span></footer>
      </main>
    </div>
    <dialog ref={dialog} onCancel={e => { if (busy) e.preventDefault(); else setModal(null); }} onClose={() => { if (!busy) setModal(null); }} aria-labelledby="modal-title">
      {actionError && <div className="banner" role="alert">{actionError}</div>}
      {modal && <><div className="modal-heading"><h2 id="modal-title">{modal.type === 'revoke' ? 'Revocar acceso' : modal.type === 'temporary' ? 'Crear pase temporal' : 'Agregar usuario'}</h2><button className="quiet" disabled={busy} aria-label="Cerrar" onClick={() => setModal(null)}>✕</button></div>{modal.type === 'revoke' ? <div className="modal-body"><p>¿Revocar el acceso de <strong>{modal.user.nombre}</strong>? Su tarjeta dejará de permitir la entrada.</p><div className="modal-actions"><button className="secondary" disabled={busy} onClick={() => setModal(null)}>Cancelar</button><button className="danger-button" disabled={busy} onClick={() => action(`/api/usuarios/${encodeURIComponent(modal.user.uid)}`, null, 'DELETE')}>{busy ? 'Revocando…' : 'Revocar acceso'}</button></div></div> : <form onSubmit={e => { e.preventDefault(); const data = Object.fromEntries(new FormData(e.currentTarget)); action(modal.type === 'temporary' ? '/api/pase-temporal' : '/api/usuarios', data); }} className="modal-body"><p className="muted">Si el UID ya existe, se actualizarán sus permisos.</p><label>Nombre<input name="nombre" required maxLength={120} placeholder="Nombre de la persona" autoFocus /></label><label>UID de la tarjeta<input name="uid" required pattern="[a-fA-F0-9]{4,32}" title="Entre 4 y 32 caracteres hexadecimales" placeholder="Ej. A1B2C3D4" /></label><label>Relay asignado<select name="relay"><option value="1">Relay 1</option><option value="2">Relay 2</option></select></label>{modal.type === 'temporary' && <label>Duración en horas<input name="horas" type="number" min="0.25" max="8760" step="0.25" defaultValue="2" required /></label>}<div className="modal-actions"><button type="button" className="secondary" disabled={busy} onClick={() => setModal(null)}>Cancelar</button><button className="primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar acceso'}</button></div></form>}</>}
    </dialog>
    <div className="toasts" aria-live="polite" aria-relevant="additions">{toasts.map(toast => <div className={`toast ${toast.type}`} key={toast.id}><span>{toast.type === 'error' ? '⊘' : '✓'}</span><p>{toast.message}</p><button aria-label="Cerrar aviso" onClick={() => setToasts(previous => previous.filter(item => item.id !== toast.id))}>✕</button></div>)}</div>
  </div>;
}
