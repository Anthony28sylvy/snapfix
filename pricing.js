// Turns Claude's raw answer into stable prices.
// Claude names the job, the items and the labor hours. This file does the math,
// so the same inputs always give the same dollar amounts.

import fs from 'node:fs';
import crypto from 'node:crypto';

export function loadPricing(file) {
  const text = fs.readFileSync(file, 'utf8');
  const data = JSON.parse(text);
  const priceGuide = data.priceGuide || {};
  return {
    hourlyRates: data.hourlyRates || { general: 95 },
    minimumCharge: Number(data.minimumCharge) || 150,
    partsMarkup: Number.isFinite(Number(data.partsMarkup)) ? Number(data.partsMarkup) : 0.25,
    rangeLow: Number(data.rangeLow) || 0.85,
    rangeHigh: Number(data.rangeHigh) || 1.35,
    priceGuide,
    jobAnchors: Array.isArray(data.jobAnchors) ? data.jobAnchors : [],
    guide: new Map(Object.entries(priceGuide).map(([k, v]) => [k.toLowerCase(), Number(v)])),
    hash: crypto.createHash('sha256').update(text).digest('hex').slice(0, 12)
  };
}

const money = (n) => '$' + Math.round(n).toLocaleString('en-US');

/** Round a shelf price to a "nice" step so tiny wording differences do not change the number. */
export function roundPrice(n) {
  n = Number(n);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const step = n < 10 ? 1 : n < 50 ? 5 : n < 200 ? 10 : 25;
  return Math.max(step, Math.round(n / step) * step);
}

/** Round a contractor quote to the nearest $25 under $500, $50 under $2,000, otherwise $100. */
export function roundQuote(n) {
  n = Number(n);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const step = n < 500 ? 25 : n < 2000 ? 50 : 100;
  return Math.max(step, Math.round(n / step) * step);
}

function rateFor(pricing, trade) {
  const t = String(trade || '').toLowerCase();
  for (const [key, rate] of Object.entries(pricing.hourlyRates)) {
    if (key !== 'general' && t.includes(key)) return { key, rate: Number(rate) };
  }
  return { key: 'general', rate: Number(pricing.hourlyRates.general) || 95 };
}

function fixItems(list, pricing) {
  return (Array.isArray(list) ? list : []).slice(0, 14).map((it) => {
    if (!it || typeof it !== 'object') return null;
    const name = String(it.name || '').trim().slice(0, 120);
    if (!name) return null;
    const key = typeof it.guideKey === 'string' ? it.guideKey.trim().toLowerCase() : '';
    const fromGuide = key !== '' && pricing.guide.has(key);
    return {
      ...it,
      name,
      price: fromGuide ? pricing.guide.get(key) : roundPrice(it.price),
      priceSource: fromGuide ? 'guide' : 'estimate'
    };
  }).filter(Boolean);
}

export function finalizeResult(raw, pricing) {
  const r = raw && typeof raw === 'object' ? { ...raw } : {};
  r.tools = fixItems(r.tools, pricing);
  r.materials = fixItems(r.materials, pricing);
  r.timeEstimate = String(r.timeEstimate || '').trim().slice(0, 30);

  const { key, rate } = rateFor(pricing, r.proType);
  const hours = Math.round(Number(r.laborHours) * 2) / 2;
  if (Number.isFinite(hours) && hours > 0 && hours <= 80) {
    const parts = r.materials.reduce((sum, m) => sum + m.price, 0) * (1 + pricing.partsMarkup);
    const mid = Math.max(pricing.minimumCharge, hours * rate) + parts;
    let low = roundQuote(mid * pricing.rangeLow);
    let high = roundQuote(mid * pricing.rangeHigh);
    if (high <= low) high = low + 25;
    r.proCost = { low, high };
    r.laborHours = hours;
    r.proBasis = 'Worked out as about ' + hours + ' hour' + (hours === 1 ? '' : 's') + ' of ' +
      (key === 'general' ? 'professional' : key) + ' labor at ' + money(rate) + ' an hour (minimum ' +
      money(pricing.minimumCharge) + '), plus parts with a ' + Math.round(pricing.partsMarkup * 100) + '% markup, shown as a range.';
  } else {
    // No usable hours from Claude: keep its own range, rounded.
    const c = r.proCost && typeof r.proCost === 'object' ? r.proCost : {};
    const low = roundQuote(Number(c.low));
    const high = roundQuote(Number(c.high));
    r.proCost = { low, high: high > low ? high : (low ? low + 25 : 0) };
    r.proBasis = '';
  }
  return r;
}
