import {useState, type FormEvent} from 'react';
import {Button, Modal} from '../../components';
import {saveOutletProfiles, type OutletProfile} from './api';

export default function ProfilesModal({profiles, onClose, onSaved}: {profiles: OutletProfile[]; onClose: () => void; onSaved: () => void}) {
  const [items, setItems] = useState(() => profiles.map(({outlet, city, region}) => ({outlet, city, region})));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  function update(index: number, field: 'city' | 'region', value: string) {
    setItems(previous => previous.map((item, position) => position === index ? {...item, [field]: value} : item));
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try { await saveOutletProfiles(items); onSaved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save outlet profiles.'); }
    finally { setSaving(false); }
  }
  return <Modal title="Edit City/Region" onClose={() => {if (!saving) onClose();}}>
    <form className="insights-profiles" onSubmit={save}>
      <p>City starts with the last word of each outlet name. Check it and add the region used by your team.</p>
      <div className="insights-profile-fields">
        {items.map((item, index) => <fieldset key={item.outlet} disabled={saving}>
          <legend>{item.outlet}</legend>
          <label>City<input aria-label={'City for ' + item.outlet} value={item.city} onChange={event => update(index, 'city', event.target.value)} maxLength={100}/></label>
          <label>Region<input aria-label={'Region for ' + item.outlet} value={item.region} onChange={event => update(index, 'region', event.target.value)} maxLength={100}/></label>
        </fieldset>)}
      </div>
      {error && <p role="alert" className="error-text">{error}</p>}
      <footer><Button type="button" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" variant="primary" disabled={saving || !items.length}>{saving ? 'Saving…' : 'Save profiles'}</Button></footer>
    </form>
  </Modal>;
}
