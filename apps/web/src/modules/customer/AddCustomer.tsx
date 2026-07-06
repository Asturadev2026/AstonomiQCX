import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateContact } from '../../lib/api/hooks';
import { useToast } from '../../components/Toast';
import { inr, initials } from '../../lib/format';
import type { CreateContactOrderDto, CreateContactDto } from '../../lib/api/types';

/**
 * Add Customer — ported from AstronomiQ-CX_Add_Customer.html into the
 * Customer 360 section. Markup/classes verbatim (scoped by add-customer.css);
 * the mockup's vanilla-JS state (tags, product rows, consent, live preview,
 * validation) is reimplemented as React state. Values are held in local
 * component state until submit — there is nothing to fetch here, only to
 * create — then posted via useCreateContact() (Rule 1: no literals reach
 * Customer 360 except through that call).
 */

const STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan',
  'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman & Nicobar Islands', 'Chandigarh', 'Dadra & Nagar Haveli and Daman & Diu', 'Delhi',
  'Jammu & Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];
const LANGUAGES = ['English', 'हिन्दी (Hindi)', 'मराठी (Marathi)', 'தமிழ் (Tamil)', 'తెలుగు (Telugu)', 'বাংলা (Bengali)', 'ಕನ್ನಡ (Kannada)', 'ગુજરાતી (Gujarati)'];
const SEGMENTS = ['New', 'Regular', 'Premium', 'VIP'];
const SOURCES = ['Website', 'WhatsApp', 'IVR call', 'Referral', 'Walk-in', 'Social media', 'Marketplace'];
const ASSIGNEES = ['Payments queue', 'Returns queue', 'Logistics queue', 'CX Ops queue', 'Escalations queue', 'Fatima Khan (Agent)', 'Rohan Verma (Agent)'];
const INDUSTRIES = ['Retail & E-commerce', 'Manufacturing', 'Banking & Finance', 'Healthcare', 'Education', 'IT & Software', 'Logistics', 'Other'];
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ProductRow {
  key: number;
  product: string;
  orderRef: string;
  purchaseDate: string;
  qty: string;
  amount: string;
}

export function AddCustomer() {
  const navigate = useNavigate();
  const toast = useToast();
  const createContact = useCreateContact();
  const productKey = useRef(1);

  const [customerType, setCustomerType] = useState<'Individual' | 'Business'>('Individual');
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [altMobile, setAltMobile] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [industry, setIndustry] = useState('');
  const [gstin, setGstin] = useState('');
  const [addr1, setAddr1] = useState('');
  const [addr2, setAddr2] = useState('');
  const [city, setCity] = useState('');
  const [stateVal, setStateVal] = useState('');
  const [pincode, setPincode] = useState('');
  const [landmark, setLandmark] = useState('');
  const [language, setLanguage] = useState<string>(LANGUAGES[0] ?? 'English');
  const [segment, setSegment] = useState<string>(SEGMENTS[0] ?? 'New');
  const [source, setSource] = useState<string>(SOURCES[0] ?? 'Website');
  const [assignTo, setAssignTo] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [products, setProducts] = useState<ProductRow[]>([
    { key: 0, product: '', orderRef: '', purchaseDate: '', qty: '1', amount: '' },
  ]);
  const [consent, setConsent] = useState({ wa: true, sms: true, email: false, call: false });
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  const totals = useMemo(() => {
    let qty = 0;
    let spent = 0;
    for (const p of products) {
      qty += parseInt(p.qty, 10) || 0;
      spent += parseFloat(p.amount) || 0;
    }
    return { count: products.length, qty, spent };
  }, [products]);

  function updateProduct(key: number, patch: Partial<ProductRow>) {
    setProducts((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function addProduct() {
    productKey.current += 1;
    setProducts((rows) => [
      ...rows,
      { key: productKey.current, product: '', orderRef: '', purchaseDate: '', qty: '1', amount: '' },
    ]);
  }
  function removeProduct(key: number) {
    setProducts((rows) => rows.filter((r) => r.key !== key));
  }

  function onTagKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = tagInput.trim().replace(/,$/, '');
      if (val && !tags.includes(val)) setTags((t) => [...t, val]);
      setTagInput('');
    } else if (e.key === 'Backspace' && !tagInput && tags.length) {
      setTags((t) => t.slice(0, -1));
    }
  }
  function removeTag(i: number) {
    setTags((t) => t.filter((_, idx) => idx !== i));
  }

  function validate(): boolean {
    const next: Record<string, boolean> = {};
    if (!fullName.trim()) next.name = true;
    if (mobile.trim().length !== 10) next.mobile = true;
    if (email.trim() && !EMAIL_RE.test(email.trim())) next.email = true;
    if (pincode.trim() && pincode.trim().length !== 6) next.pincode = true;
    if (gstin.trim() && !GSTIN_RE.test(gstin.trim())) next.gstin = true;
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function resetForm() {
    setCustomerType('Individual');
    setFullName(''); setMobile(''); setAltMobile(''); setEmail('');
    setCompany(''); setIndustry(''); setGstin('');
    setAddr1(''); setAddr2(''); setCity(''); setStateVal(''); setPincode(''); setLandmark('');
    setLanguage(LANGUAGES[0] ?? 'English'); setSegment(SEGMENTS[0] ?? 'New'); setSource(SOURCES[0] ?? 'Website'); setAssignTo('');
    setTags([]); setTagInput('');
    productKey.current = 0;
    setProducts([{ key: 0, product: '', orderRef: '', purchaseDate: '', qty: '1', amount: '' }]);
    setConsent({ wa: true, sms: true, email: false, call: false });
    setNotes('');
    setErrors({});
  }

  function buildPayload(): CreateContactDto {
    const orders: CreateContactOrderDto[] = products
      .filter((p) => p.product.trim())
      .map((p) => ({
        product: p.product.trim(),
        orderRef: p.orderRef.trim() || undefined,
        purchaseDate: p.purchaseDate || undefined,
        qty: parseInt(p.qty, 10) || 0,
        amount: parseFloat(p.amount) || 0,
      }));
    return {
      customerType: customerType === 'Business' ? 'business' : 'individual',
      name: fullName.trim() || company.trim(),
      mobile: mobile.trim(),
      altMobile: altMobile.trim() || undefined,
      email: email.trim() || undefined,
      company: customerType === 'Business' ? company.trim() || undefined : undefined,
      industry: customerType === 'Business' ? industry || undefined : undefined,
      gstin: customerType === 'Business' ? gstin.trim() || undefined : undefined,
      addressLine1: addr1.trim() || undefined,
      addressLine2: addr2.trim() || undefined,
      city: city.trim() || undefined,
      state: stateVal || undefined,
      pincode: pincode.trim() || undefined,
      landmark: landmark.trim() || undefined,
      language,
      segment: segment.toLowerCase() as CreateContactDto['segment'],
      source: source.toLowerCase().replace(/\s+/g, '_') as CreateContactDto['source'],
      assignedTo: assignTo || undefined,
      tags,
      consent: { whatsapp: consent.wa, sms: consent.sms, email: consent.email, call: consent.call },
      notes: notes.trim() || undefined,
      orders,
    };
  }

  function save(another: boolean) {
    if (!validate()) {
      toast('Please fix the highlighted fields');
      return;
    }
    const displayName = fullName.trim() || company.trim();
    createContact.mutate(buildPayload(), {
      onSuccess: () => {
        toast(`${displayName} saved to Customer 360`);
        if (another) resetForm();
        else navigate('/customer');
      },
      onError: (err) => {
        toast(err instanceof Error ? err.message : 'Could not save customer');
      },
    });
  }

  const displayName = (customerType === 'Business' && company.trim()) ? company.trim() : (fullName.trim() || 'New customer');
  const locationPreview = [city.trim(), stateVal].filter(Boolean).join(', ');

  return (
    <div className="add-customer-page">
      <div className="page-head">
        <div>
          <h1>Add Customer</h1>
          <p>Create a new customer profile for Customer 360 — details, orders and consent, all in one place.</p>
        </div>
        <div className="head-actions">
          <button type="button" className="btn ghost" onClick={resetForm}>Clear all</button>
        </div>
      </div>

      <div className="grid">
        <form onSubmit={(e) => e.preventDefault()}>
          {/* Basic details */}
          <section className="card">
            <div className="card-head">
              <div className="card-ico ico-blue">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
              </div>
              <div><h3>Basic details</h3><p>Who is the customer and how do we reach them</p></div>
            </div>

            <div className="field">
              <label>Customer type <span className="req">*</span></label>
              <div className="segmented">
                <button type="button" className={customerType === 'Individual' ? 'on' : ''} onClick={() => setCustomerType('Individual')}>Individual</button>
                <button type="button" className={customerType === 'Business' ? 'on' : ''} onClick={() => setCustomerType('Business')}>Business</button>
              </div>
            </div>

            <div className="row">
              <div className={`field${errors.name ? ' invalid' : ''}`}>
                <label>Full name <span className="req">*</span></label>
                <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Aditya Nair" />
                <span className="err-msg">Please enter the customer's name.</span>
              </div>
              <div className={`field${errors.mobile ? ' invalid' : ''}`}>
                <label>Mobile number <span className="req">*</span></label>
                <div className="phone-wrap">
                  <span className="cc">🇮🇳 +91</span>
                  <input
                    className="input" inputMode="numeric" maxLength={10} placeholder="98765 43210"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
                <span className="err-msg">Enter a valid 10-digit mobile number.</span>
              </div>
            </div>

            <div className="row">
              <div className={`field${errors.email ? ' invalid' : ''}`}>
                <label>Email address <span className="opt">(optional)</span></label>
                <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="aditya@email.com" />
                <span className="err-msg">This email does not look right.</span>
              </div>
              <div className="field">
                <label>Alternate number <span className="opt">(optional)</span></label>
                <div className="phone-wrap">
                  <span className="cc">🇮🇳 +91</span>
                  <input
                    className="input" inputMode="numeric" maxLength={10} placeholder="Second contact"
                    value={altMobile}
                    onChange={(e) => setAltMobile(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Business details */}
          {customerType === 'Business' && (
            <section className="card">
              <div className="card-head">
                <div className="card-ico ico-purple">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M3 21V7l6-4 6 4v14M15 21V11l6 3v7M3 21h18M8 9h.01M8 13h.01M8 17h.01" /></svg>
                </div>
                <div><h3>Business details</h3><p>For company or B2B customers</p></div>
              </div>
              <div className="row">
                <div className="field">
                  <label>Company name</label>
                  <input className="input" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Sunrise Retail Pvt Ltd" />
                </div>
                <div className="field">
                  <label>Industry</label>
                  <select value={industry} onChange={(e) => setIndustry(e.target.value)}>
                    <option value="">Select industry</option>
                    {INDUSTRIES.map((i) => <option key={i}>{i}</option>)}
                  </select>
                </div>
              </div>
              <div className={`field${errors.gstin ? ' invalid' : ''}`}>
                <label>GSTIN <span className="opt">(optional)</span></label>
                <input
                  className="input" maxLength={15} placeholder="e.g. 27ABCDE1234F1Z5" style={{ textTransform: 'uppercase' }}
                  value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())}
                />
                <span className="hint">15-character GST number. We use this on invoices.</span>
                <span className="err-msg">GSTIN should be 15 characters in the correct format.</span>
              </div>
            </section>
          )}

          {/* Products purchased */}
          <section className="card">
            <div className="card-head">
              <div className="card-ico ico-amber">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0" /></svg>
              </div>
              <div><h3>Products purchased</h3><p>Add the orders this customer has bought from you</p></div>
            </div>

            <div>
              {products.map((p, idx) => (
                <div className="prod-row" key={p.key}>
                  <div className="field">
                    <label>Product</label>
                    <input className="input" value={p.product} onChange={(e) => updateProduct(p.key, { product: e.target.value })} placeholder="e.g. Astra Smart Watch" />
                  </div>
                  <div className="field">
                    <label>Order ID</label>
                    <input className="input" value={p.orderRef} onChange={(e) => updateProduct(p.key, { orderRef: e.target.value })} placeholder={`AST-2026-00${idx + 1}`} />
                  </div>
                  <div className="field">
                    <label>Purchase date</label>
                    <input className="input" type="date" value={p.purchaseDate} onChange={(e) => updateProduct(p.key, { purchaseDate: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Qty</label>
                    <input className="input" type="number" min={1} value={p.qty} onChange={(e) => updateProduct(p.key, { qty: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Amount (₹)</label>
                    <input className="input" type="number" min={0} placeholder="0" value={p.amount} onChange={(e) => updateProduct(p.key, { amount: e.target.value })} />
                  </div>
                  <button type="button" className="del" title="Remove" onClick={() => removeProduct(p.key)}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 6h18M8 6V4h8v2M6 6v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6M10 11v6M14 11v6" /></svg>
                  </button>
                </div>
              ))}
            </div>

            <button type="button" className="add-prod" onClick={addProduct}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 5v14M5 12h14" /></svg>
              Add product
            </button>

            <div className="prod-total">
              <span className="t-item"><b>{totals.count}</b> products</span>
              <span className="t-item">·</span>
              <span className="t-item">Total quantity <b>{totals.qty}</b></span>
              <span className="spacer" />
              <span className="t-item">Total spent</span>
              <span className="amt">{inr(totals.spent)}</span>
            </div>
          </section>

          {/* Address */}
          <section className="card">
            <div className="card-head">
              <div className="card-ico ico-teal">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M12 21s7-5.5 7-11a7 7 0 0 0-14 0c0 5.5 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
              </div>
              <div><h3>Address</h3><p>Where should deliveries and field visits go</p></div>
            </div>
            <div className="field full">
              <label>Address line 1</label>
              <input className="input" value={addr1} onChange={(e) => setAddr1(e.target.value)} placeholder="Flat / House no., Building, Street" />
            </div>
            <div className="field full">
              <label>Address line 2 <span className="opt">(optional)</span></label>
              <input className="input" value={addr2} onChange={(e) => setAddr2(e.target.value)} placeholder="Area, Colony, Sector" />
            </div>
            <div className="row three">
              <div className="field">
                <label>City</label>
                <input className="input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Pune" />
              </div>
              <div className="field">
                <label>State</label>
                <select value={stateVal} onChange={(e) => setStateVal(e.target.value)}>
                  <option value="">Select state</option>
                  {STATES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className={`field${errors.pincode ? ' invalid' : ''}`}>
                <label>Pincode</label>
                <input
                  className="input" inputMode="numeric" maxLength={6} placeholder="411001"
                  value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
                />
                <span className="err-msg">Pincode must be 6 digits.</span>
              </div>
            </div>
            <div className="field full">
              <label>Landmark <span className="opt">(optional)</span></label>
              <input className="input" value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder="Near a well-known spot" />
            </div>
          </section>

          {/* CX details */}
          <section className="card">
            <div className="card-head">
              <div className="card-ico ico-green">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
              </div>
              <div><h3>Customer experience</h3><p>How we serve and route this customer</p></div>
            </div>
            <div className="row three">
              <div className="field">
                <label>Preferred language</label>
                <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                  {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Customer segment</label>
                <select value={segment} onChange={(e) => setSegment(e.target.value)}>
                  {SEGMENTS.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Source</label>
                <select value={source} onChange={(e) => setSource(e.target.value)}>
                  {SOURCES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="row">
              <div className="field">
                <label>Assign to</label>
                <select value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
                  <option value="">Unassigned</option>
                  {ASSIGNEES.map((a) => <option key={a}>{a}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Tags</label>
                <div className="tagbox">
                  {tags.map((t, i) => (
                    <span className="chip" key={t}>
                      {t} <b onClick={() => removeTag(i)}>×</b>
                    </span>
                  ))}
                  <input
                    placeholder="Type a tag and press Enter"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={onTagKey}
                  />
                </div>
                <span className="hint">e.g. cod-preferred, high-value, festive-buyer</span>
              </div>
            </div>
          </section>

          {/* Consent */}
          <section className="card">
            <div className="card-head">
              <div className="card-ico ico-pink">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
              </div>
              <div><h3>Consent &amp; preferences</h3><p>Customer's permission to contact them (DPDP Act)</p></div>
            </div>

            <div className="consent-row">
              <div className="c-left">
                <div className="c-ic ico-green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M12 21c5 0 9-3.6 9-8s-4-8-9-8-9 3.6-9 8a7 7 0 0 0 2 4.8L3 21l4.5-1.3A10 10 0 0 0 12 21z" /></svg></div>
                <div><div className="c-title">WhatsApp updates</div><div className="c-sub">Order, delivery and support messages</div></div>
              </div>
              <label className="switch">
                <input type="checkbox" checked={consent.wa} onChange={(e) => setConsent((c) => ({ ...c, wa: e.target.checked }))} />
                <span className="slider" />
              </label>
            </div>

            <div className="consent-row">
              <div className="c-left">
                <div className="c-ic ico-blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M4 6h16v12H4zM4 7l8 6 8-6" /></svg></div>
                <div><div className="c-title">SMS alerts</div><div className="c-sub">OTP and transactional SMS</div></div>
              </div>
              <label className="switch">
                <input type="checkbox" checked={consent.sms} onChange={(e) => setConsent((c) => ({ ...c, sms: e.target.checked }))} />
                <span className="slider" />
              </label>
            </div>

            <div className="consent-row">
              <div className="c-left">
                <div className="c-ic ico-amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M4 6h16v12H4zM4 7l8 6 8-6" /></svg></div>
                <div><div className="c-title">Email</div><div className="c-sub">Invoices, offers and newsletters</div></div>
              </div>
              <label className="switch">
                <input type="checkbox" checked={consent.email} onChange={(e) => setConsent((c) => ({ ...c, email: e.target.checked }))} />
                <span className="slider" />
              </label>
            </div>

            <div className="consent-row">
              <div className="c-left">
                <div className="c-ic ico-purple"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2 4.2 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.7c.4 2.6 1.3 3.4.6 4.7L8.9 9.8a16 16 0 0 0 6 6l1.4-1.2c.4-.3 1.9.2 2.6.6A2 2 0 0 1 22 16.9z" /></svg></div>
                <div><div className="c-title">Promotional calls</div><div className="c-sub">Outbound calls for offers</div></div>
              </div>
              <label className="switch">
                <input type="checkbox" checked={consent.call} onChange={(e) => setConsent((c) => ({ ...c, call: e.target.checked }))} />
                <span className="slider" />
              </label>
            </div>

            <div className="dpdp-note">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" /></svg>
              <span>As per the DPDP Act, please take consent only after telling the customer why we are collecting their data. They can change these preferences any time from the Self-Service Portal.</span>
            </div>
          </section>

          {/* Notes */}
          <section className="card">
            <div className="card-head">
              <div className="card-ico ico-blue">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M4 4h16v12l-4 4H4zM16 20v-4h4" /></svg>
              </div>
              <div><h3>Internal notes</h3><p>Only your team can see this</p></div>
            </div>
            <div className="field full" style={{ marginBottom: 0 }}>
              <textarea
                value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything the team should know — special handling, past issues, preferred call time, etc."
              />
            </div>
          </section>
        </form>

        {/* Live preview */}
        <aside className="preview">
          <div className="pv-card">
            <div className="pv-top">
              <div className="pv-eyebrow">Live preview</div>
              <div className="pv-avatar">{initials(fullName || company)}</div>
            </div>
            <div className="pv-body">
              <div className="pv-namecard">
                <div className="pv-name">{displayName}</div>
                <div className="pv-type">
                  {customerType}{customerType === 'Business' && fullName.trim() ? ` · ${fullName.trim()}` : ''}
                </div>
              </div>

              <div className="pv-list">
                <div className="pv-item">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2 4.2 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L7.9 9.8a16 16 0 0 0 6 6l1.4-1.2a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6A2 2 0 0 1 22 16.9z" /></svg>
                  <span className="k">Mobile</span>
                  <span className={`v${mobile ? '' : ' blank'}`}>{mobile ? `+91 ${mobile}` : 'Not added'}</span>
                </div>
                <div className="pv-item">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M4 6h16v12H4zM4 7l8 6 8-6" /></svg>
                  <span className="k">Email</span>
                  <span className={`v${email ? '' : ' blank'}`}>{email || 'Not added'}</span>
                </div>
                <div className="pv-item">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M12 21s7-5.5 7-11a7 7 0 0 0-14 0c0 5.5 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
                  <span className="k">Location</span>
                  <span className={`v${locationPreview ? '' : ' blank'}`}>{locationPreview || 'Not added'}</span>
                </div>
                <div className="pv-item">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M12 2 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6z" /></svg>
                  <span className="k">Segment</span>
                  <span className="v">{segment}</span>
                </div>
                <div className="pv-item">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M3 5h12M9 3v2M12 20l4-9 4 9M13.5 17h5" /></svg>
                  <span className="k">Language</span>
                  <span className="v">{language}</span>
                </div>
              </div>

              <div className="pv-spend">
                <div>
                  <div className="lbl">Lifetime spend</div>
                  <div className="num">{inr(totals.spent)} <small>· {totals.count} order{totals.count === 1 ? '' : 's'}</small></div>
                </div>
                <div className="c-ic ico-green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0" /></svg></div>
              </div>

              <div className="pv-tags">
                {tags.map((t) => <span className="pv-tag" key={t}>{t}</span>)}
              </div>

              <div className="pv-consent">
                <div className={`pv-cbadge${consent.wa ? ' on' : ''}`}>WhatsApp</div>
                <div className={`pv-cbadge${consent.sms ? ' on' : ''}`}>SMS</div>
                <div className={`pv-cbadge${consent.email ? ' on' : ''}`}>Email</div>
                <div className={`pv-cbadge${consent.call ? ' on' : ''}`}>Call</div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <div className="savebar">
        <div className="status"><span className="dotg" /> Draft — not saved yet</div>
        <div className="right">
          <button type="button" className="btn ghost" onClick={() => navigate('/customer')}>Cancel</button>
          <button type="button" className="btn" disabled={createContact.isPending} onClick={() => save(true)}>Save &amp; add another</button>
          <button type="button" className="btn primary" disabled={createContact.isPending} onClick={() => save(false)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M20 6 9 17l-5-5" /></svg>
            Save customer
          </button>
        </div>
      </div>
    </div>
  );
}
