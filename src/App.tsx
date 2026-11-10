import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, Bell,
  Check, ChevronRight, CloudRain, CloudSun, Droplets, ExternalLink, Eye, EyeOff,
  Leaf, LockKeyhole, LogOut, Mail, MapPin, Menu, Search, Send, ShieldCheck,
  Sprout, TrendingUp, Truck, UserRound, Warehouse, Wind, X
} from 'lucide-react';
import { apiRequest } from './api';
import './features.css';

type Price = {
  id?: string;
  crop: string;
  market: string;
  county?: string;
  price: number;
  unit: string;
  status?: string;
  reportedAt?: string;
};
type TrendPeriod = 'day' | 'week' | 'month';
type PriceAlert = { crop: string; target: number };
type AuthUser = { name: string; email: string };
type BackendStatus = 'checking' | 'connected' | 'offline';
type WeatherData = {
  county: string;
  provider: string;
  fetchedAt: string;
  current: {
    temperature_2m: number;
    relative_humidity_2m: number;
    precipitation: number;
    wind_speed_10m: number;
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
    precipitation_sum: number[];
  };
};

const demoPrices: Price[] = [
  { crop: 'Maize', market: 'Kisii Open Air', price: 3850, unit: '90 kg bag' },
  { crop: 'Tomatoes', market: 'Kisii Open Air', price: 5200, unit: 'crate' },
  { crop: 'Beans', market: 'Kisii Open Air', price: 8900, unit: '90 kg bag' },
  { crop: 'Potatoes', market: 'Nyamira Market', price: 3100, unit: '90 kg bag' },
  { crop: 'Onions', market: 'Kisii Open Air', price: 6400, unit: 'bag' },
  { crop: 'Avocado', market: 'Kisii Open Air', price: 1800, unit: 'crate' }
];

const demoFacilities = [
  { name: 'Kisii Produce Collection Centre', place: 'Kisii Town', county: 'Kisii', type: 'Produce store', capacity: 'Approx. 50 tonnes' },
  { name: 'Nyamira Cold Storage Hub', place: 'Nyamira County', county: 'Nyamira', type: 'Cold room', capacity: 'Approx. 20 tonnes' },
  { name: 'Keroka Grain Store', place: 'Keroka', county: 'Kisii', type: 'Grain storage', capacity: 'Approx. 100 tonnes' }
];

const counties = ['Kisii', 'Nyamira', 'Migori', 'Homa Bay', 'Kakamega', 'Nakuru', 'Nairobi', 'Meru', 'Kiambu', 'Mombasa'];
const commodities = ['Maize', 'Beans', 'Tomatoes', 'Potatoes', 'Onions', 'Avocado', 'Tea', 'Coffee', 'Other'];
const units = ['90 kg bag', '50 kg bag', 'crate', 'kilogram', 'tonne', 'piece'];
const nav = [
  ['overview', 'Overview', Activity],
  ['markets', 'Market prices', TrendingUp],
  ['transport', 'Transport planner', Truck],
  ['forecast', 'Price outlook', BarChart3],
  ['storage', 'Storage directory', Warehouse],
  ['weather', 'Weather intelligence', CloudSun],
  ['advisory', 'Farm advisory', Sprout],
  ['report', 'Report a price', Send],
  ['alerts', 'Price alerts', Bell],
  ['profile', 'Farm profile', UserRound]
] as const;
const kes = (value: number) => new Intl.NumberFormat('en-KE', {
  style: 'currency', currency: 'KES', maximumFractionDigits: 0
}).format(value);
const errorMessage = (error: unknown, fallback = 'Unknown error') => {
  const message = error instanceof Error ? error.message : fallback;
  return message.replace(/[.!?]+$/, '');
};

function getWindowChange(items: Price[], period: TrendPeriod): number | null {
  const now = new Date();
  const currentStart = new Date(now);
  currentStart.setHours(0, 0, 0, 0);
  if (period === 'week') currentStart.setDate(currentStart.getDate() - 6);
  if (period === 'month') currentStart.setDate(currentStart.getDate() - 29);
  const previousStart = new Date(currentStart);
  previousStart.setDate(previousStart.getDate() - (period === 'day' ? 1 : period === 'week' ? 7 : 30));
  const currentValues: number[] = [];
  const previousValues: number[] = [];

  for (const item of items) {
    if (!item.reportedAt) continue;
    const date = new Date(item.reportedAt);
    if (date >= currentStart && date <= now) currentValues.push(Number(item.price));
    else if (date >= previousStart && date < currentStart) previousValues.push(Number(item.price));
  }
  if (!currentValues.length || !previousValues.length) return null;
  const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const previous = average(previousValues);
  return previous > 0 ? ((average(currentValues) - previous) / previous) * 100 : null;
}

export default function App() {
  const [active, setActive] = useState('landing');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [backendStatus, setBackendStatus] = useState<BackendStatus>('checking');
  const [authError, setAuthError] = useState('');
  const [mobile, setMobile] = useState(false);
  const [name, setName] = useState('');
  const [county, setCounty] = useState('Kisii');
  const [phone, setPhone] = useState('');
  const [farmSize, setFarmSize] = useState('');
  const [crops, setCrops] = useState('');
  const [expectedHarvest, setExpectedHarvest] = useState('');
  const [crop, setCrop] = useState('Maize');
  const [market, setMarket] = useState('Kisii Open Air');
  const [unit, setUnit] = useState('90 kg bag');
  const [observedPrice, setObservedPrice] = useState('');
  const [verifiedPrices, setVerifiedPrices] = useState<Price[]>([]);
  const [reports, setReports] = useState<Price[]>([]);
  const [notice, setNotice] = useState('');
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>('week');
  const [distance, setDistance] = useState('35');
  const [rate, setRate] = useState('80');
  const [quantity, setQuantity] = useState('100');
  const [unitPrice, setUnitPrice] = useState('3850');
  const [marketDistances, setMarketDistances] = useState<Record<string, string>>({});
  const [forecast, setForecast] = useState('');
  const [forecastPeriod, setForecastPeriod] = useState('30 days');
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState('');
  const [alertCrop, setAlertCrop] = useState('Maize');
  const [alertTarget, setAlertTarget] = useState('');
  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>([]);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const initialDataLoadStarted = useRef(false);

  const transportCost = Math.max(0, Number(distance) || 0) * 2 * Math.max(0, Number(rate) || 0);
  const grossValue = Math.max(0, Number(quantity) || 0) * Math.max(0, Number(unitPrice) || 0);
  const title = nav.find(([id]) => id === active)?.[1] || 'Overview';

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await apiRequest<{ ok: boolean }>('/api/_healthcheck');
        if (!mounted) return;
        setBackendStatus('connected');
        const result = await apiRequest<{ user: AuthUser | null }>('/api/auth/session');
        if (!mounted || !result.user) return;
        setAuthUser(result.user);
        setName(result.user.name);
        setActive('overview');
      } catch {
        if (mounted) setBackendStatus('offline');
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (active === 'landing' || active === 'auth' || initialDataLoadStarted.current) return;
    initialDataLoadStarted.current = true;
    let mounted = true;
    (async () => {
      try {
        const [profileResult, reportsResult, pricesResult] = await Promise.all([
          apiRequest<{ profile: { name: string; county: string; phone: string; farmSize: string; crops: string; expectedHarvest: string } | null }>('/api/profile'),
          apiRequest<{ items: Price[] }>('/api/market-reports'),
          apiRequest<{ items: Price[] }>('/api/market-prices')
        ]);
        if (!mounted) return;
        if (profileResult.profile) {
          setName(profileResult.profile.name);
          setCounty(profileResult.profile.county);
          setPhone(profileResult.profile.phone);
          setFarmSize(profileResult.profile.farmSize);
          setCrops(profileResult.profile.crops);
          setExpectedHarvest(profileResult.profile.expectedHarvest || '');
        }
        setReports(reportsResult.items);
        setVerifiedPrices(pricesResult.items);
      } catch (error) {
        if (mounted) setNotice(`Backend connection failed (${errorMessage(error)}). Start the backend with npm run backend.`);
      }
    })();
    try {
      const savedAlerts = window.localStorage.getItem('agrisense-price-alerts');
      if (savedAlerts) {
        setPriceAlerts(JSON.parse(savedAlerts) as PriceAlert[]);
        if ('Notification' in window && Notification.permission === 'granted') setNotificationsEnabled(true);
      }
    } catch (error) {
      setNotice(`Could not load saved price alerts: ${errorMessage(error, 'Browser storage is unavailable')}.`);
    }
    return () => { mounted = false; };
  }, [active]);

  useEffect(() => {
    if (active !== 'weather') return;
    let mounted = true;
    setWeatherLoading(true);
    setWeatherError('');
    apiRequest<WeatherData>(`/api/weather?county=${encodeURIComponent(county)}`)
      .then(result => { if (mounted) setWeather(result); })
      .catch(error => { if (mounted) setWeatherError(errorMessage(error, 'Weather service unavailable')); })
      .finally(() => { if (mounted) setWeatherLoading(false); });
    return () => { mounted = false; };
  }, [active, county]);

  useEffect(() => {
    if (!notificationsEnabled || !('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      const markers = JSON.parse(window.localStorage.getItem('agrisense-notified-prices') || '{}') as Record<string, string>;
      for (const alert of priceAlerts) {
        const match = verifiedPrices.find(item => item.crop.toLowerCase() === alert.crop.toLowerCase());
        const alertKey = `${alert.crop.toLowerCase()}-${alert.target}`;
        const marker = match?.id || `${match?.market}-${match?.price}-${match?.reportedAt}`;
        if (match && Number(match.price) >= alert.target && markers[alertKey] !== marker) {
          new Notification(`AGRISENSE ${alert.crop} price alert`, {
            body: `${match.market}: ${kes(Number(match.price))} per ${match.unit} (your target: ${kes(alert.target)}).`
          });
          markers[alertKey] = marker;
        }
      }
      window.localStorage.setItem('agrisense-notified-prices', JSON.stringify(markers));
    } catch (error) {
      setNotice(`Could not check browser price alerts: ${errorMessage(error, 'Browser notifications are unavailable')}.`);
    }
  }, [notificationsEnabled, priceAlerts, verifiedPrices]);

  const marketRows = useMemo(() => {
    const groups = new Map<string, Price[]>();
    for (const item of verifiedPrices.filter(price =>
      price.crop.toLowerCase() === crop.toLowerCase() && price.unit.toLowerCase() === unit.toLowerCase()
    )) {
      const key = `${item.market}|${item.unit}`;
      groups.set(key, [...(groups.get(key) || []), item]);
    }
    const rows = [...groups.entries()].map(([key, observations]) => {
      const [marketName, itemUnit] = key.split('|');
      const latest = [...observations].sort((a, b) => Date.parse(b.reportedAt || '') - Date.parse(a.reportedAt || ''))[0];
      const travelDistance = Math.max(0, Number(marketDistances[marketName]) || 0);
      const travelCostPerUnit = travelDistance * 2 * Math.max(0, Number(rate) || 0);
      return {
        market: marketName,
        unit: itemUnit,
        price: Number(latest.price),
        reportedAt: latest.reportedAt,
        change: getWindowChange(observations, trendPeriod),
        distance: travelDistance,
        distanceEntered: (marketDistances[marketName] || '').trim() !== '',
        net: Number(latest.price) - travelCostPerUnit
      };
    });
    const allDistancesEntered = rows.length > 0 && rows.every(row => row.distanceEntered);
    return rows.sort((a, b) => allDistancesEntered ? b.net - a.net : b.price - a.price);
  }, [verifiedPrices, crop, unit, trendPeriod, marketDistances, rate]);
  const allMarketDistancesEntered = marketRows.length > 0 && marketRows.every(row => row.distanceEntered);

  async function refreshPrices() {
    setLoadingPrices(true);
    try {
      const [pricesResult, reportsResult] = await Promise.all([
        apiRequest<{ items: Price[] }>('/api/market-prices'),
        apiRequest<{ items: Price[] }>('/api/market-reports')
      ]);
      setVerifiedPrices(pricesResult.items);
      setReports(reportsResult.items);
      setNotice('Market data refreshed.');
    } catch (error) {
      setNotice(`Could not refresh market data: ${errorMessage(error)}.`);
    } finally {
      setLoadingPrices(false);
    }
  }

  async function submitReport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await apiRequest('/api/market-reports', { crop, market, county, price: Number(observedPrice), unit, reporterName: name || 'Farmer' });
      setReports(previous => [{
        crop, market, county, price: Number(observedPrice), unit, status: 'pending', reportedAt: new Date().toISOString()
      }, ...previous]);
      setObservedPrice('');
      setNotice('Your price observation was submitted and is pending verification.');
    } catch (error) {
      setNotice(`Could not submit report: ${errorMessage(error)}.`);
    }
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await apiRequest('/api/profile', { name, county, phone, farmSize, crops, expectedHarvest });
      setNotice('Your farm profile was saved.');
    } catch (error) {
      setNotice(`Could not save your profile: ${errorMessage(error)}.`);
    }
  }

  async function generateOutlook(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const result = await apiRequest<{ analysis: string; verifiedObservations: number }>('/api/forecast', {
        crop, market, currentPrice: Number(unitPrice), period: forecastPeriod
      });
      setForecast(`${result.analysis}\n\nVerified observations available: ${result.verifiedObservations}.`);
    } catch (error) {
      setNotice(`Could not prepare the outlook: ${errorMessage(error)}.`);
    }
  }

  async function addPriceAlert(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!('Notification' in window)) {
      setNotice('This browser does not support notifications.');
      return;
    }
    try {
      const permission = Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();
      if (permission !== 'granted') {
        setNotice('Notification permission was not granted. Change it in your browser settings to use price alerts.');
        return;
      }
      const next = [...priceAlerts, { crop: alertCrop, target: Number(alertTarget) }];
      setPriceAlerts(next);
      window.localStorage.setItem('agrisense-price-alerts', JSON.stringify(next));
      setNotificationsEnabled(true);
      setAlertTarget('');
      setNotice('Price alert saved on this browser. Alerts are checked when the app is open and market data is refreshed.');
    } catch (error) {
      setNotice(`Could not save your price alert: ${errorMessage(error, 'Browser storage is unavailable')}.`);
    }
  }

  function handleAuth(user: AuthUser) {
    setAuthUser(user);
    setName(user.name);
    setAuthError('');
    setActive('overview');
  }

  async function signOut() {
    try {
      await apiRequest<{ signedOut: boolean }>('/api/auth/logout', {});
      setAuthUser(null);
      setName('');
      setCounty('Kisii');
      setPhone('');
      setFarmSize('');
      setCrops('');
      setExpectedHarvest('');
      setReports([]);
      setVerifiedPrices([]);
      setNotice('');
      setActive('landing');
      initialDataLoadStarted.current = false;
    } catch (error) {
      setNotice(`Could not sign out: ${errorMessage(error)}.`);
    }
  }

  if (active === 'landing') return <Landing onEnter={() => { setAuthMode('login'); setAuthError(''); setActive('auth'); }} />;
  if (active === 'auth') return <AuthPage
    mode={authMode}
    onModeChange={mode => { setAuthMode(mode); setAuthError(''); }}
    onBack={() => { setAuthError(''); setActive('landing'); }}
    onSuccess={handleAuth}
    backendStatus={backendStatus}
    error={authError}
    setError={setAuthError}
  />;

  return (
    <div className="shell">
      {mobile && <button className="scrim" onClick={() => setMobile(false)} aria-label="Close menu" />}
      <aside className={`sidebar ${mobile ? 'open' : ''}`}>
        <button className="brand brand-button" onClick={() => setActive('overview')} aria-label="AGRISENSE dashboard">
          <span className="brand-icon"><Sprout /></span><b>AGRI<span>SENSE</span></b>
        </button>
        <p className="side-label">FARMER WORKSPACE</p>
        <nav>{nav.map(([id, label, Icon]) => (
          <button key={id} className={active === id ? 'selected' : ''} onClick={() => { setActive(id); setMobile(false); }}>
            <Icon size={18} />{label}
          </button>
        ))}</nav>
        <div className="side-bottom"><div className="help"><Leaf size={18} /><span><b>Grow with confidence</b><small>Smarter farming decisions</small></span></div><small>AGRISENSE · FARMER TOOLS</small></div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="mobile-toggle" onClick={() => setMobile(true)} aria-label="Open menu"><Menu /></button>
          <div><small>Workspace / {title}</small><h2>{title}</h2></div>
          <div className="topbar-actions"><div className="user"><span>{(name || 'F').slice(0, 1).toUpperCase()}</span><div><b>{name || 'Farmer account'}</b><small>{county}, Kenya</small></div></div><button className="sign-out" onClick={signOut} aria-label="Sign out"><LogOut size={15} />Sign out</button></div>
        </header>
        <div className="content">
          {notice && <div className="notice" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss message"><X size={15} /></button></div>}

          {active === 'overview' && <>
            <section className="hero dashboard-hero">
              <div><small>YOUR FARM, AT A GLANCE</small><h1>Hello, {name.split(' ')[0] || 'Farmer'} <span aria-hidden="true">🌱</span></h1><p>Use verified market observations, practical cost estimates and local weather to plan your next move.</p><button className="primary" onClick={() => setActive('markets')}>Explore market prices <ArrowRight size={16} /></button></div>
              <div className="hero-mark"><Sprout size={82} /></div>
            </section>
            <div className="section-title"><div><h3>Tools for your farm</h3><p>Choose a tool to plan with the information available.</p></div><small>{verifiedPrices.length} verified price observations</small></div>
            <div className="feature-grid">
              <FeatureCard icon={<TrendingUp />} title="Compare markets" description="Review verified prices and their daily, weekly or monthly movement." onClick={() => setActive('markets')} />
              <FeatureCard icon={<Truck />} title="Plan transport" description="Estimate round-trip costs and compare net proceeds by market." onClick={() => setActive('transport')} />
              <FeatureCard icon={<CloudSun />} title="Check local weather" description="See a seven-day forecast for your county and seasonal guidance." onClick={() => setActive('weather')} />
              <FeatureCard icon={<Sprout />} title="Get farm advice" description="Bring your harvest plan, weather and market options together." onClick={() => setActive('advisory')} />
            </div>
            <div className="columns">
              <section className="panel home-market">
                <div className="panel-head"><div><h3>Market snapshot</h3><p>Verified community observations only</p></div><button className="text-btn" onClick={() => setActive('markets')}>Compare markets <ChevronRight size={15} /></button></div>
                {verifiedPrices.slice(0, 4).map((item, index) => <PriceRow key={item.id || `${item.crop}-${item.market}-${index}`} item={item} />)}
                {!verifiedPrices.length && <div className="empty-state"><TrendingUp size={22} /><b>No verified prices yet</b><span>Sample prices are shown as examples only. Submit an observation to help build local market history.</span><button className="text-btn" onClick={() => setActive('report')}>Report a market price <ArrowRight size={14} /></button></div>}
              </section>
              <section className="panel home-planner"><div className="facility-icon"><Truck /></div><h3>Know your net proceeds</h3><p>Estimate the trip before choosing a market.</p><div className="highlight"><small>ESTIMATED ROUND-TRIP TRANSPORT</small><strong>{kes(transportCost)}</strong><span>Based on your distance and transport rate</span></div><button className="primary" onClick={() => setActive('transport')}>Open transport planner <ArrowRight size={15} /></button></section>
            </div>
            <p className="disclaimer">Price observations and listings can be incomplete. Confirm prices, buyer availability and costs directly before making a sale.</p>
          </>}

          {active === 'markets' && <>
            <PageIntro eyebrow="AGRICULTURAL MARKET INTELLIGENCE" title="Find the right market." description="Compare verified reports by commodity, market and reporting period. Estimated net proceeds subtract your entered transport cost only." />
            <div className="market-controls panel">
              <label>Commodity<select value={crop} onChange={event => setCrop(event.target.value)}>{commodities.filter(item => item !== 'Other').map(item => <option key={item}>{item}</option>)}</select></label>
              <label>Produce unit<select value={unit} onChange={event => setUnit(event.target.value)}>{units.map(item => <option key={item}>{item}</option>)}</select></label>
              <label>Transport rate (KSh / km)<input type="number" min="0" value={rate} onChange={event => setRate(event.target.value)} /></label>
              <div className="period-tabs" role="group" aria-label="Price trend period">
                {(['day', 'week', 'month'] as const).map(period => <button key={period} className={trendPeriod === period ? 'active' : ''} onClick={() => setTrendPeriod(period)}>{period === 'day' ? 'Daily' : period === 'week' ? 'Weekly' : 'Monthly'}</button>)}
              </div>
              <button className="secondary-button" onClick={refreshPrices} disabled={loadingPrices}>{loadingPrices ? 'Refreshing…' : 'Refresh prices'}</button>
            </div>
            <div className="section-title market-section-title"><div><h3>{crop} across markets</h3><p>Ranked by estimated net price after round-trip transport.</p></div><span className="verified-tag"><Check size={14} /> Verified reports</span></div>
            {marketRows.length > 0 ? <div className="panel table-wrap"><table className="market-table"><thead><tr><th>MARKET</th><th>PRICE / UNIT</th><th>MOVEMENT</th><th>ONE-WAY DISTANCE</th><th>EST. NET / UNIT</th><th>LAST REPORTED</th></tr></thead><tbody>
              {marketRows.map((row, index) => <tr key={`${row.market}-${row.unit}`}><td><b>{row.market}</b>{allMarketDistancesEntered && index === 0 && <span className="best-tag">Best net estimate</span>}</td><td><b>{kes(row.price)}</b><small>{row.unit}</small></td><td>{row.change === null ? <span className="muted-cell">Not enough history</span> : <span className={row.change >= 0 ? 'positive' : 'negative'}>{row.change >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{row.change >= 0 ? '+' : ''}{row.change.toFixed(1)}%</span>}</td><td><label className="inline-distance"><input aria-label={`Distance to ${row.market}`} type="number" min="0" placeholder="Enter km" value={marketDistances[row.market] || ''} onChange={event => setMarketDistances(previous => ({ ...previous, [row.market]: event.target.value }))} /><span>km</span></label></td><td><b className={row.net < 0 ? 'negative' : ''}>{row.distanceEntered ? kes(row.net) : 'Add distance'}</b></td><td>{row.reportedAt ? new Date(row.reportedAt).toLocaleDateString('en-KE') : '—'}</td></tr>)}
            </tbody></table></div> : <div className="panel empty-state market-empty"><TrendingUp size={26} /><h3>No verified {crop.toLowerCase()} prices to compare</h3><p>Community reports are hidden from market comparisons until verified. You can still review these illustrative examples, but they are not current quotations.</p><div className="demo-price-list">{demoPrices.filter(item => item.crop === crop).map(item => <PriceRow key={item.crop + item.market} item={item} demo />)}</div><button className="primary" onClick={() => setActive('report')}>Report an observed price <ArrowRight size={15} /></button></div>}
            <p className="disclaimer">Movements compare the average verified reports in the selected window with the preceding window. If either window has no reports, a change is not shown. Market estimates use your entered distance and rate; they do not include other fees.</p>
          </>}

          {active === 'transport' && <>
            <PageIntro eyebrow="TRANSPORT & PROFIT PLANNER" title="Plan the trip before you sell." description="Estimate round-trip transport and compare what may remain after transport. Add loading, storage, market and production costs separately." />
            <div className="columns transport-columns">
              <section className="panel planner-form"><h3>Your trip estimate</h3><div className="form-grid">
                <Field label="One-way distance (km)" value={distance} set={setDistance} />
                <Field label="Transport rate (KSh per km)" value={rate} set={setRate} />
                <Field label="Quantity to sell" value={quantity} set={setQuantity} />
                <Field label="Observed selling price per unit (KSh)" value={unitPrice} set={setUnitPrice} />
              </div><label className="select-field">Produce unit<select value={unit} onChange={event => setUnit(event.target.value)}>{units.map(item => <option key={item}>{item}</option>)}</select></label><p className="hint">Distance and fare are your estimates; no route-distance provider is connected. Assumes a return trip at the same rate.</p></section>
              <section className="panel result"><small>YOUR ESTIMATE</small><h3>Transport & proceeds</h3><Result label="Gross produce value" value={kes(grossValue)} /><Result label="Round-trip transport" value={kes(transportCost)} /><div className="net"><small>REMAINING AFTER TRANSPORT</small><strong>{kes(grossValue - transportCost)}</strong></div><span className="result-footnote">An estimate only; other costs are not included.</span></section>
            </div>
            <div className="section-title"><div><h3>Compare {crop.toLowerCase()} markets</h3><p>Prices use verified reports. Enter a distance for each market to estimate net proceeds.</p></div><button className="text-btn" onClick={() => setActive('markets')}>View price history <ArrowRight size={14} /></button></div>
            {marketRows.length ? <div className="panel table-wrap"><table className="market-table"><thead><tr><th>MARKET</th><th>PRICE / {unit.toUpperCase()}</th><th>ONE-WAY DISTANCE</th><th>EST. NET PER UNIT</th></tr></thead><tbody>{marketRows.map((row, index) => <tr key={row.market + row.unit}><td><b>{row.market}</b>{allMarketDistancesEntered && index === 0 && <span className="best-tag">Best net estimate</span>}</td><td>{kes(row.price)}</td><td><label className="inline-distance"><input type="number" min="0" placeholder="Enter km" value={marketDistances[row.market] || ''} onChange={event => setMarketDistances(previous => ({ ...previous, [row.market]: event.target.value }))} /><span>km</span></label></td><td><b>{row.distanceEntered ? kes(row.net) : 'Add distance'}</b></td></tr>)}</tbody></table></div> : <div className="panel empty-state"><Truck size={24} /><b>No verified market prices to compare yet</b><span>Once price observations are verified, compare estimated proceeds here. You can still use the trip calculator above.</span></div>}
          </>}

          {active === 'forecast' && <>
            <PageIntro eyebrow="MARKET TRENDS & OUTLOOK" title="Look ahead with care." description="Review the available evidence before making a selling decision. Forecast periods are 7 days, 30 days, 3 months and 6 months." />
            <div className="columns">
              <form className="panel report-form" onSubmit={generateOutlook}><h3>Prepare a market outlook</h3><div className="form-grid">
                <label>Commodity<select value={crop} onChange={event => setCrop(event.target.value)}>{commodities.filter(item => item !== 'Other').map(item => <option key={item}>{item}</option>)}</select></label>
                <label>Market<input value={market} onChange={event => setMarket(event.target.value)} required /></label>
                <Field label="Current observed price (KSh)" value={unitPrice} set={setUnitPrice} />
                <label>Outlook period<select value={forecastPeriod} onChange={event => setForecastPeriod(event.target.value)}>{['7 days', '30 days', '3 months', '6 months'].map(item => <option key={item}>{item}</option>)}</select></label>
              </div><button className="primary">Review available evidence <ArrowRight size={15} /></button></form>
              <section className="panel outlook-panel"><div className="outlook-icon"><BarChart3 /></div><h3>Evidence-based outlook</h3><p className="forecast-text">{forecast || 'Choose a crop, market and period to review the available verified reports and practical selling guidance.'}</p></section>
            </div>
            <div className="notice forecast-notice"><b>Forecasting status</b><span>No AI prediction provider is connected yet. The app does not invent future prices. Numerical forecasts and crop-specific selling recommendations need enough verified historical observations and an appropriately configured forecasting service.</span></div>
          </>}

          {active === 'storage' && <>
            <PageIntro eyebrow="POST-HARVEST MANAGEMENT" title="Find storage that fits your harvest." description={`Browse example facilities near ${county}. Contact, current availability and charges have not been independently verified.`} />
            <div className="storage-data-note"><Warehouse size={18} /><span><b>Directory status:</b> the available facility cards are illustrative examples, not confirmed active listings. Call ahead to verify exact locations, rates, capacity and availability.</span></div>
            <div className="storage">{demoFacilities.filter(item => item.county === county).map(facility => <article className="panel facility" key={facility.name}>
              <div className="facility-icon"><Warehouse size={25} /></div><small>{facility.type} · EXAMPLE LISTING</small><h3>{facility.name}</h3><p><MapPin size={15} />{facility.place}</p>
              <div className="facility-meta"><span>Listed capacity</span><b>{facility.capacity}</b></div><div className="facility-meta"><span>Charges</span><b>Not verified</b></div><div className="facility-meta"><span>Contact</span><b>Not available</b></div>
              <a className="map-link" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(facility.name + ', ' + facility.place + ', Kenya')}`} target="_blank" rel="noreferrer">Search this area on Maps <ExternalLink size={14} /></a>
            </article>)}{!demoFacilities.some(item => item.county === county) && <div className="panel empty-state"><Warehouse size={24} /><b>No example listings for {county}</b><span>The directory has no verified storage facilities for this county yet.</span><a className="map-link" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('warehouse cold storage ' + county + ', Kenya')}`} target="_blank" rel="noreferrer">Search nearby storage on Maps <ExternalLink size={14} /></a></div>}</div>
            <p className="disclaimer">No verified warehouse/cold-room data feed is configured, so the app does not present contact details, exact map pins or storage charges as facts.</p>
          </>}

          {active === 'weather' && <>
            <PageIntro eyebrow="WEATHER INTELLIGENCE" title={`Weather for ${county}.`} description="A seven-day forecast can help with near-term field planning. Check official seasonal guidance for longer outlooks." />
            <div className="weather-card"><div><small>SHORT-RANGE WEATHER · {county.toUpperCase()}</small><h2>{weatherLoading ? 'Loading forecast…' : weather ? `${Math.round(weather.current.temperature_2m)}°C now` : 'Local forecast'}</h2><p>{weather ? `Humidity ${weather.current.relative_humidity_2m}% · Rain ${weather.current.precipitation} mm · Wind ${weather.current.wind_speed_10m} km/h` : 'Choose your county in your farm profile to see its local forecast.'}</p></div><CloudSun size={58} /></div>
            {weatherError && <div className="notice" role="alert">Could not load weather: {weatherError}</div>}
            {weather && <div className="panel weather-table-panel"><div className="panel-head"><div><h3>Seven-day outlook</h3><p>Source: {weather.provider} · Updated {new Date(weather.fetchedAt).toLocaleString('en-KE')}</p></div></div><div className="weather-days">{weather.daily.time.map((day, index) => <div className="weather-day" key={day}><b>{new Date(`${day}T12:00:00`).toLocaleDateString('en-KE', { weekday: 'short' })}</b><small>{new Date(`${day}T12:00:00`).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}</small><CloudRain size={20} /><strong>{Math.round(weather.daily.temperature_2m_max[index])}° / {Math.round(weather.daily.temperature_2m_min[index])}°</strong><small>{weather.daily.precipitation_probability_max[index]}% rain</small><small>{weather.daily.precipitation_sum[index]} mm</small></div>)}</div></div>}
            <div className="weather-stats"><Stat icon={<Droplets />} label="Rainfall" value={weather ? `${weather.current.precipitation} mm` : '—'} note="Current conditions" /><Stat icon={<Wind />} label="Wind speed" value={weather ? `${weather.current.wind_speed_10m} km/h` : '—'} note="Current conditions" /><Stat icon={<CloudRain />} label="Humidity" value={weather ? `${weather.current.relative_humidity_2m}%` : '—'} note="Current conditions" /></div>
            <section className="panel seasonal-panel"><div><h3>Seasonal outlook & farm alerts</h3><p>For longer-range rainfall and seasonal forecasts, use official Kenya Meteorological Department bulletins. A reliable six-month local forecast is not currently available in this app.</p></div><a className="primary" href="https://meteo.go.ke/our-products/seasonal-forecast/" target="_blank" rel="noreferrer">Open KMD seasonal forecast <ExternalLink size={15} /></a></section>
          </>}

          {active === 'advisory' && <>
            <PageIntro eyebrow="PERSONALISED FARM PLANNING" title="Make your next move with context." description="Connect your farm profile, harvest timing, verified prices and local weather before choosing what to do next." />
            <div className="advisory-grid">
              <section className="panel advisory-card"><div className="facility-icon"><TrendingUp /></div><small>WHERE TO SELL</small><h3>Compare net market estimates</h3><p>{!marketRows.length ? `There are not yet enough verified ${crop.toLowerCase()} prices to compare markets. Submit observations and check back after verification.` : !allMarketDistancesEntered ? `Verified prices are available for ${crop}. Enter a one-way distance to each market before comparing likely net proceeds or choosing where to sell.` : `The highest current net-price estimate for ${crop} is ${marketRows[0].market} at ${kes(marketRows[0].net)} per ${marketRows[0].unit}, before other costs.`}</p><button className="text-btn" onClick={() => setActive('markets')}>Compare markets <ArrowRight size={14} /></button></section>
              <section className="panel advisory-card"><div className="facility-icon"><Sprout /></div><small>PLANTING & HARVEST</small><h3>{expectedHarvest ? `Harvest plan: ${expectedHarvest}` : 'Add your expected harvest'}</h3><p>{crops ? `Your profile lists ${crops}. Use local extension guidance and verified seasonal forecasts to plan planting and harvesting; crop-specific calendars are not configured here.` : 'Add your crops and expected harvest date to your farm profile. Planting advice should be checked against local extension guidance and official seasonal forecasts.'}</p><button className="text-btn" onClick={() => setActive('profile')}>{expectedHarvest ? 'Update farm profile' : 'Complete farm profile'} <ArrowRight size={14} /></button></section>
              <section className="panel advisory-card"><div className="facility-icon"><BarChart3 /></div><small>CROP PROFITABILITY</small><h3>Compare proceeds—not just prices</h3><p>Subtract estimated transport from an observed selling price. Input costs, yield, storage, quality grading and fees are not recorded, so this is not a full crop profitability forecast.</p><button className="text-btn" onClick={() => setActive('transport')}>Open profit planner <ArrowRight size={14} /></button></section>
              <section className="panel advisory-card"><div className="facility-icon"><CloudSun /></div><small>WEATHER & OPERATIONS</small><h3>Check conditions before field work</h3><p>{weather ? `Latest ${county} conditions: ${Math.round(weather.current.temperature_2m)}°C, ${weather.current.precipitation} mm rainfall and ${weather.current.relative_humidity_2m}% humidity. Use the daily forecast to plan field work.` : `Load the seven-day ${county} forecast before planning weather-sensitive activities. Long-range seasonal guidance is linked from the weather page.`}</p><button className="text-btn" onClick={() => setActive('weather')}>View weather intelligence <ArrowRight size={14} /></button></section>
            </div>
            <div className="notice forecast-notice"><b>Advisory limitations</b><span>AGRISENSE currently offers planning support, not agronomist-reviewed planting calendars, buyer guarantees or complete crop-profit calculations. Confirm major decisions with local agricultural extension officers.</span></div>
          </>}

          {active === 'report' && <>
            <PageIntro eyebrow="COMMUNITY MARKET DATA" title="Share a market observation." description="Help build local price history by reporting a price you personally observed." />
            <form className="panel report-form" onSubmit={submitReport}><div className="form-grid">
              <label>Commodity<select value={crop} onChange={event => setCrop(event.target.value)}>{commodities.map(item => <option key={item}>{item}</option>)}</select></label>
              <label>Market name<input value={market} onChange={event => setMarket(event.target.value)} required maxLength={80} /></label>
              <label>Observed price (KSh)<input type="number" min="1" step="0.01" value={observedPrice} onChange={event => setObservedPrice(event.target.value)} required /></label>
              <label>Unit<select value={unit} onChange={event => setUnit(event.target.value)}>{units.map(item => <option key={item}>{item}</option>)}</select></label>
            </div><p className="hint">Reports are stored as pending and do not appear in comparisons until verified. Include the price, market and unit you actually observed.</p><button className="primary"><Send size={16} /> Submit observation</button></form>
            {reports.length > 0 && <section className="panel pending-panel"><h3>Your recent submissions</h3>{reports.slice(0, 5).map((item, index) => <div className="pending-row" key={item.id || `${item.crop}-${index}`}><span><b>{item.crop}</b><small>{item.market} · {item.reportedAt ? new Date(item.reportedAt).toLocaleDateString('en-KE') : 'Recently submitted'}</small></span><strong>{kes(Number(item.price))} / {item.unit}</strong><em>{item.status || 'pending'}</em></div>)}</section>}
          </>}

          {active === 'alerts' && <>
            <PageIntro eyebrow="FARMER NOTIFICATIONS" title="Know when a price reaches your target." description="Save a threshold for a crop and check it against verified prices in this browser." />
            <form className="panel alert-panel" onSubmit={addPriceAlert}><div className="facility-icon"><Bell /></div><h3>Create a browser price alert</h3><p>Notifications are checked when AGRISENSE is open and market data loads or refreshes. They are stored in this browser only; this does not send SMS or run in the background.</p><div className="form-grid"><label>Commodity<select value={alertCrop} onChange={event => setAlertCrop(event.target.value)}>{commodities.filter(item => item !== 'Other').map(item => <option key={item}>{item}</option>)}</select></label><label>Notify at or above (KSh)<input type="number" min="1" step="0.01" required value={alertTarget} onChange={event => setAlertTarget(event.target.value)} /></label></div><button className="primary"><Bell size={15} /> Save price alert</button></form>
            {priceAlerts.length > 0 && <section className="panel pending-panel"><h3>Your saved alerts</h3>{priceAlerts.map((alert, index) => <div className="pending-row" key={`${alert.crop}-${index}`}><span><b>{alert.crop}</b><small>Notify when a verified report reaches</small></span><strong>{kes(alert.target)}</strong><button className="text-btn" onClick={() => { const next = priceAlerts.filter((_, itemIndex) => itemIndex !== index); setPriceAlerts(next); window.localStorage.setItem('agrisense-price-alerts', JSON.stringify(next)); }}>Remove</button></div>)}</section>}
          </>}

          {active === 'profile' && <>
            <PageIntro eyebrow="YOUR FARM DETAILS" title="Farmer profile." description="Your county is used to request the local weather forecast and helps personalise your planning workspace." />
            <form className="panel profile-form" onSubmit={saveProfile}><div className="form-grid">
              <Field label="Full name" value={name} set={setName} type="text" />
              <label>County<select value={county} onChange={event => setCounty(event.target.value)}>{counties.map(item => <option key={item}>{item}</option>)}</select></label>
              <Field label="Phone number (optional)" value={phone} set={setPhone} type="tel" />
              <Field label="Farm size (acres)" value={farmSize} set={setFarmSize} />
              <label className="wide">Main crops<input value={crops} onChange={event => setCrops(event.target.value)} placeholder="e.g. maize, beans, tomatoes" maxLength={300} /></label>
              <label className="wide">Expected harvest (optional)<input type="date" value={expectedHarvest} onChange={event => setExpectedHarvest(event.target.value)} /><small className="field-note">A planning reminder only; no automatic harvest or planting advice is generated.</small></label>
            </div><button className="primary">Save farm profile <Check size={15} /></button></form>
          </>}
          <footer>AGRISENSE · Smarter farming decisions, grounded in local information.</footer>
        </div>
      </main>
    </div>
  );
}

function AuthPage({
  mode,
  onModeChange,
  onBack,
  onSuccess,
  backendStatus,
  error,
  setError
}: {
  mode: 'login' | 'register';
  onModeChange: (mode: 'login' | 'register') => void;
  onBack: () => void;
  onSuccess: (user: AuthUser) => void;
  backendStatus: BackendStatus;
  error: string;
  setError: (message: string) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const body: Record<string, string> = { email: email.trim(), password };
      if (mode === 'register') body.name = name.trim();
      const result = await apiRequest<{ user: AuthUser }>(
        `/api/auth/${mode === 'register' ? 'register' : 'login'}`,
        body
      );
      onSuccess(result.user);
    } catch (requestError) {
      setError(errorMessage(requestError, 'Could not connect to AGRISENSE'));
    } finally {
      setSubmitting(false);
    }
  }

  function changeMode(nextMode: 'login' | 'register') {
    setPassword('');
    setError('');
    onModeChange(nextMode);
  }

  return <main className="auth-page">
    <div className="auth-frame">
      <section className="auth-story">
        <button className="auth-brand" onClick={onBack} aria-label="Return to AGRISENSE home">
          <span className="landing-logo"><Sprout size={21} /></span><span>AGRI<b>SENSE</b></span>
        </button>
        <div className="auth-story-content">
          <span className="landing-kicker">A CLEARER VIEW OF YOUR NEXT MOVE</span>
          <h1>Your farm.<br /><span>Your plans.</span></h1>
          <p>One trusted workspace for market information, transport planning and local weather.</p>
          <div className="auth-benefits">
            <div><span><TrendingUp size={17} /></span><p><b>Compare market options</b><small>See verified community observations.</small></p></div>
            <div><span><CloudSun size={17} /></span><p><b>Plan around your county</b><small>Keep weather and harvest timing in view.</small></p></div>
            <div><span><ShieldCheck size={17} /></span><p><b>Your workspace stays yours</b><small>Your profile and reports are linked to your account.</small></p></div>
          </div>
        </div>
        <span className="auth-story-footer">AGRISENSE · FARMER TOOLS</span>
      </section>

      <section className="auth-form-side">
        <button className="auth-back" onClick={onBack}><ArrowRight className="back-arrow" size={15} /> Back to home</button>
        <div className="auth-card">
          <div className={`service-status ${backendStatus}`} role="status">
            <span />
            {backendStatus === 'checking' ? 'Checking secure connection…'
              : backendStatus === 'connected' ? 'Secure service connected'
                : 'Service unavailable — check your connection'}
          </div>
          <span className="auth-icon"><LockKeyhole size={21} /></span>
          <span className="landing-kicker">{mode === 'login' ? 'WELCOME BACK' : 'GET STARTED'}</span>
          <h2>{mode === 'login' ? 'Sign in to your account' : 'Create your farmer account'}</h2>
          <p className="auth-subtitle">{mode === 'login'
            ? 'Continue to your personal farm workspace.'
            : 'Set up a secure account for your farm workspace.'}</p>

          <form onSubmit={submit} className="auth-form">
            {mode === 'register' && <label className="auth-field"><span>Full name</span><div className="auth-input-wrap"><UserRound size={17} /><input autoComplete="name" name="name" value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Amina Otieno" maxLength={100} required /></div></label>}
            <label className="auth-field"><span>Email address</span><div className="auth-input-wrap"><Mail size={17} /><input type="email" autoComplete="email" name="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" maxLength={254} required /></div></label>
            <label className="auth-field"><span>Password</span><div className="auth-input-wrap"><LockKeyhole size={17} /><input type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} name="password" value={password} onChange={event => setPassword(event.target.value)} placeholder={mode === 'register' ? 'At least 10 characters' : 'Enter your password'} minLength={mode === 'register' ? 10 : undefined} maxLength={128} required /><button className="password-toggle" type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
            {error && <div className="auth-error" role="alert">{error}</div>}
            <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? 'Please wait…' : mode === 'login' ? 'Sign in securely' : 'Create account'}<ArrowRight size={17} /></button>
          </form>

          <p className="auth-switch">{mode === 'login' ? 'New to AGRISENSE?' : 'Already have an account?'} <button onClick={() => changeMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button></p>
          <p className="auth-privacy"><ShieldCheck size={14} /> Your password is protected and never stored in plain text.</p>
        </div>
        <small className="auth-legal">By continuing, you agree to use market information as planning guidance and verify prices directly before making a sale.</small>
      </section>
    </div>
  </main>;
}

function Landing({ onEnter }: { onEnter: () => void }) {
  const features = [
    { icon: <TrendingUp />, number: '01', title: 'Market prices', description: 'Compare verified community prices, follow daily, weekly and monthly movement, and see an estimated best net market.', color: 'mint' },
    { icon: <Truck />, number: '02', title: 'Transport planner', description: 'Estimate round-trip transport and calculate proceeds after the journey, with market-by-market distance estimates.', color: 'amber' },
    { icon: <BarChart3 />, number: '03', title: 'Price outlook', description: 'Explore market evidence across 7-day, 30-day, 3-month and 6-month planning horizons—with data limits made clear.', color: 'blue' },
    { icon: <Warehouse />, number: '04', title: 'Storage directory', description: 'Browse example storage categories and check locations. Confirm facility contacts, charges and availability before travelling.', color: 'sage' },
    { icon: <CloudSun />, number: '05', title: 'Weather intelligence', description: 'See a seven-day county forecast and connect to Kenya Meteorological Department seasonal bulletins.', color: 'sky' },
    { icon: <UserRound />, number: '06', title: 'Farmer profile', description: 'Keep your county, crops, farm size and expected harvest together in a personal planning workspace.', color: 'peach' },
    { icon: <Sprout />, number: '07', title: 'Farm advisory', description: 'Bring market proceeds, harvest timing and local weather into one practical decision checklist.', color: 'leaf' }
  ];
  return <div className="landing">
    <header className="landing-nav"><a className="landing-brand" href="#top"><span className="landing-logo"><Sprout size={21} /></span><span>AGRI<b>SENSE</b></span></a><nav aria-label="Main navigation"><a href="#features">What you can do</a><a href="#how-it-works">How it works</a><button className="nav-cta" onClick={onEnter}>Open farmer workspace <ArrowRight size={15} /></button></nav><button className="landing-mobile-cta" onClick={onEnter}>Open workspace <ArrowRight size={15} /></button></header>
    <main id="top">
      <section className="landing-hero">
        <div className="hero-copy"><span className="eyebrow"><span className="live-dot" /> AGRICULTURE, WITH BETTER INFORMATION</span><h1>Grow with confidence.<br /><span>Sell with a plan.</span></h1><p>Practical market, transport and weather tools to help Kenyan farmers make more informed decisions—from the farm gate to the marketplace.</p><div className="hero-actions"><button className="landing-primary" onClick={onEnter}>Explore the farmer workspace <ArrowRight size={17} /></button><a className="landing-secondary" href="#features">Discover the tools <ChevronRight size={15} /></a></div><div className="trust-note"><span className="trust-avatar"><Sprout size={16} /></span><span>Built for farmers in Kenya</span><i /> <span>Clear about what’s verified</span></div></div>
        <div className="hero-visual" aria-label="Illustration of the AGRISENSE farmer workspace">
          <div className="visual-orbit orbit-one" /><div className="visual-orbit orbit-two" />
          <div className="visual-leaf leaf-one"><Leaf size={49} /></div><div className="visual-leaf leaf-two"><Sprout size={44} /></div>
          <div className="visual-card">
            <div className="visual-card-head"><span className="mini-logo"><Sprout size={16} /></span><span>YOUR FARM SNAPSHOT</span><span className="online-mark" /></div>
            <h3>A clearer view of your next move.</h3>
            <div className="visual-metric-row"><div><small>MARKET OPTIONS</small><b>Compare nearby</b></div><span className="metric-icon"><TrendingUp size={18} /></span></div>
            <div className="visual-chart"><div className="chart-labels"><span>PRICE MOVEMENT</span><span>Verified reports only</span></div><div className="chart-bars"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div><div className="chart-base" /></div>
            <div className="visual-bottom"><span><span className="weather-sun"><CloudSun size={16} /></span> County weather</span><span>7-day forecast <ArrowRight size={13} /></span></div>
          </div>
          <div className="floating-note"><span><Check size={14} /></span><div><b>Plan beyond the price</b><small>Include estimated transport</small></div></div>
          <div className="hero-stamp"><span>LOCAL</span><b>INSIGHT</b><small>BETTER CHOICES</small></div>
        </div>
        <div className="hero-bottom-note"><span>MARKETS</span><i /><span>TRANSPORT</span><i /><span>WEATHER</span><i /><span>FARM PLANNING</span></div>
      </section>
      <section className="landing-proof"><div><b>Price history</b><span>Daily, weekly & monthly view</span></div><div><b>Net proceeds</b><span>Plan for travel costs</span></div><div><b>Local forecast</b><span>Weather for your county</span></div><div><b>Honest guidance</b><span>Know what is verified</span></div></section>
      <section className="landing-features" id="features"><div className="landing-section-heading"><div><span className="landing-kicker">ONE FARM. MANY DECISIONS.</span><h2>Everything you need to<br /><span>make a more informed choice.</span></h2></div><p>Market prices are just one part of the picture. Bring transport, weather and harvest planning into the same conversation.</p></div>
        <div className="landing-feature-grid">{features.map(feature => <article className={`landing-feature ${feature.color}`} key={feature.number}><div className="landing-feature-top"><span className="feature-icon">{feature.icon}</span><span className="feature-number">{feature.number}</span></div><h3>{feature.title}</h3><p>{feature.description}</p><span className="feature-arrow"><ArrowUpRight size={17} /></span></article>)}</div>
        <div className="feature-integrity"><span><Check size={15} /></span><p><b>Useful information, without false certainty.</b> Demonstration values and unverified listings are labelled. Price predictions, route distances and facility fees are not presented as live facts unless a reliable source is connected.</p></div>
      </section>
      <section className="how-section" id="how-it-works"><div className="how-copy"><span className="landing-kicker">SIMPLE BY DESIGN</span><h2>Make a better-informed<br /><span>farm-gate decision.</span></h2><p>Start with your farm profile, check the evidence in your county, then compare what may remain after transport.</p><button className="landing-primary" onClick={onEnter}>Open your farmer workspace <ArrowRight size={17} /></button></div><div className="how-steps"><div className="how-step"><span>01</span><div><b>Set up your farm profile</b><p>Add your county, crops and expected harvest timing.</p></div><UserRound size={20} /></div><div className="how-step"><span>02</span><div><b>Review local information</b><p>Check available prices, market movement and weather.</p></div><Search size={20} /></div><div className="how-step"><span>03</span><div><b>Compare before you decide</b><p>Estimate transport and compare possible net proceeds.</p></div><Check size={20} /></div></div></section>
      <section className="landing-cta"><div className="cta-pattern" /><div><span className="landing-kicker">YOUR NEXT DECISION STARTS HERE</span><h2>More context for every<br />farming decision.</h2><p>Open the AGRISENSE farmer workspace to explore the tools.</p></div><button className="landing-primary cta-button" onClick={onEnter}>Explore the workspace <ArrowRight size={17} /></button></section>
    </main>
    <footer className="landing-footer"><a className="landing-brand" href="#top"><span className="landing-logo"><Sprout size={19} /></span><span>AGRI<b>SENSE</b></span></a><span>© 2026 AGRISENSE · Smarter farming decisions, grounded in local information.</span><a href="https://meteo.go.ke/our-products/seasonal-forecast/" target="_blank" rel="noreferrer">Kenya Meteorological Department <ExternalLink size={13} /></a></footer>
  </div>;
}

function FeatureCard({ icon, title, description, onClick }: { icon: React.ReactNode; title: string; description: string; onClick: () => void }) {
  return <button className="panel feature-card" onClick={onClick}><span className="feature-card-icon">{icon}</span><span className="feature-card-copy"><b>{title}</b><small>{description}</small></span><ChevronRight size={18} /></button>;
}
function Stat({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note: string }) {
  return <div className="panel stat"><div>{icon}<small>{note}</small></div><strong>{value}</strong><b>{label}</b></div>;
}
function PageIntro({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="page-intro"><small>{eyebrow}</small><h1>{title}</h1><p>{description}</p></div>;
}
function Field({ label, value, set, type = 'number' }: { label: string; value: string; set: (value: string) => void; type?: 'text' | 'number' | 'tel' }) {
  return <label>{label}<input type={type} min={type === 'number' ? 0 : undefined} value={value} onChange={event => set(event.target.value)} /></label>;
}
function Result({ label, value }: { label: string; value: string }) {
  return <div className="result-line"><span>{label}</span><b>{value}</b></div>;
}
function PriceRow({ item, demo = false }: { item: Price; demo?: boolean }) {
  return <div className="price-row"><span className="crop-icon">{item.crop.slice(0, 1)}</span><div><b>{item.crop}</b><small>{item.market}{demo ? ' · illustrative example' : item.reportedAt ? ` · ${new Date(item.reportedAt).toLocaleDateString('en-KE')}` : ''}</small></div><strong>{kes(Number(item.price))}<small>{item.unit}</small></strong>{demo && <span className="pill">DEMO</span>}</div>;
}
