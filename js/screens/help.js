/**
 * screens/help.js
 *
 * Plain-language glossary of every metric, term, and acronym in the app.
 * Organised loosely by category — search works across all fields.
 */

const GLOSSARY = [
  // Quarterly review
  { term: "Revenue growth YoY", full: "Quarterly Revenue Growth, Year-on-Year", explain: "This quarter's revenue vs the same quarter last year. Comparing year-on-year removes seasonal distortions — a retailer with a big Diwali quarter will always look good vs the prior quarter, but YoY tells the real story. Green ≥10%, yellow 0–10%, red negative. The single most important number in a quarterly review." },
  { term: "PAT margin", full: "Profit After Tax Margin — quarterly", explain: "Net profit as % of revenue for the most recent quarter. Tells you how much of every revenue rupee actually reaches shareholders. Watch this alongside revenue growth — revenue can rise while margins compress, which usually means the business is facing cost pressure or has lost pricing power. A great business should show stable or expanding margins alongside revenue growth." },
  { term: "Earnings consistency", full: "Earnings Consistency (6 years)", explain: "Out of the last 6 years, how many saw EPS grow compared to the prior year. Shown as X/6. A perfect 6/6 means unbroken profit growth — a hallmark of a durable compounder. Below 4/6 starts to question whether the business has a real moat." },
  { term: "EPS CAGR", full: "EPS Compound Annual Growth Rate (5 years)", explain: "The average annual EPS growth rate over 5 years, compounded. Smooths out individual good or bad years to show the real trend. A Buffett-style compounder typically delivers 12–20%+ sustained EPS CAGR. Below 8% is generally too slow to build meaningful wealth after inflation." },
  { term: "Recent news", full: "Latest news about the stock", explain: "Last 3–4 news headlines from Livemint, sourced via indianapi. Especially useful during results season — earnings reactions, analyst upgrades/downgrades, and management commentary cluster in the weeks around quarterly results. Tap any headline to read the full article." },
  { term: "Analyst consensus", full: "Street buy/hold/sell recommendation", explain: "Aggregate of professional analyst recommendations: Strong Buy → Buy → Hold → Sell → Strong Sell, with individual counts. One data point among many — don't follow it blindly, but a big gap between your view and the street's is worth understanding. If analysts are uniformly bullish, ask why — and whether the risk is already in the price." },

  // Profitability & capital efficiency
  { term: "ROE", full: "Return on Equity", explain: "Profit as a percentage of shareholders' own money in the business. Measures how efficiently management turns capital into earnings. Above 15% clears the hard flag in this app's Buffett checklist. Consistently high ROE over many years (not just one good year) is the clearest indicator of a durable competitive advantage." },
  { term: "ROCE", full: "Return on Capital Employed", explain: "Like ROE but includes borrowed money too, making it harder to flatter with debt. A company can look great on ROE by borrowing heavily, but ROCE exposes this. Particularly useful for capital-intensive businesses like manufacturing, infrastructure, or real estate." },
  { term: "EPS", full: "Earnings Per Share", explain: "Net profit divided by shares outstanding. The foundation of both EPS CAGR and the P/E ratio. Growing EPS = growing value per share, assuming the share count isn't rising at the same time (check Share count trend for this)." },

  // Valuation
  { term: "P/E (TTM)", full: "Price to Earnings — Trailing 12 Months", explain: "Share price divided by the last 12 months of EPS. How many years of current earnings you're paying. On its own it's incomplete — a 30x P/E might be cheap for a fast-growing business and expensive for a stagnant one. Always compare to Sector P/E and to the company's own historical P/E range." },
  { term: "Sector P/E", full: "Sector average P/E ratio", explain: "The P/E of the broader industry the company belongs to. Shown next to the stock's own P/E. If the stock trades at 35x while its sector averages 22x, you're paying a 59% premium — which needs to be justified by better quality, faster growth, or lower risk than peers. A discount to sector P/E can indicate either value or a genuine problem." },
  { term: "Market cap", full: "Market Capitalisation", explain: "Share price × total shares. The market's total current valuation of the business. Derived automatically in this app from the current price and shares outstanding from indianapi — so it updates with each live price fetch." },
  { term: "52-week range", full: "52-week high and low", explain: "Highest and lowest price over the past year. Context for where the current price sits — near the 52-week high suggests enthusiasm already priced in; near the low could mean opportunity or an underlying problem. Neither automatically signals buy or sell." },

  // Balance sheet & cash quality
  { term: "D/E", full: "Debt to Equity", explain: "Total borrowings divided by shareholders' equity. A low D/E means the company isn't dependent on loans — safer in downturns, and Buffett strongly prefers companies that don't need debt to earn good returns. Above 0.2 is a hard flag in this app's checklist. Note: some industries (banking, NBFC, real estate) structurally carry higher D/E — this metric applies best to non-financial businesses." },
  { term: "Cash EPS gap", full: "OCF per share minus EPS", explain: "Checks whether profits are backed by real cash. OCF/share well above EPS (large positive gap) means the business generates more cash than accounting profits show — usually a sign of quality: asset-light, fast collections, minimal working capital needs. A persistent negative gap is a red flag — profits on paper not being collected as real cash." },
  { term: "OCF", full: "Operating Cash Flow", explain: "Actual cash generated from running the core business, before accounting adjustments or capex. Often more reliable than reported profit, which includes non-cash items like depreciation and can be influenced by accounting choices." },
  { term: "FCF", full: "Free Cash Flow", explain: "Cash left after paying for operations and capital expenditure. Truly free money the business has earned — available for dividends, buybacks, acquisitions, or debt repayment. The best businesses generate high FCF relative to their reported profits." },
  { term: "FCF Yield", full: "Free Cash Flow Yield", explain: "FCF as % of market cap. If a company generates ₹100 Cr FCF on a ₹1,000 Cr market cap, FCF yield is 10%. Above 8% is generally good value. This app shows it as 'approximate' because investing cash flows can include one-time items that inflate or deflate the number — treat it as directional." },

  // Ownership
  { term: "Promoter holding", full: "Promoter shareholding %", explain: "How much the founding/controlling group still owns. High and stable is a positive signal — skin in the game. Declining promoter holding (shown in the shareholding trend chart) is a flag worth investigating: are they diversifying, or are they losing conviction in their own business?" },
  { term: "Promoter pledging", full: "Pledged promoter shares", explain: "Shares used as collateral for a personal loan. Any pledging is a caution — financial stress on promoters can lead to forced selling or decisions that benefit them at minority shareholders' expense. Not currently available from this app's data source (indianapi doesn't provide it)." },
  { term: "Share count trend", full: "Shares outstanding trend (5 years)", explain: "Whether the company has been issuing new shares (dilution — bad) or buying them back (concentration — good). Shown as 'declining', 'flat', or 'increasing'. Companies that consistently buy back shares are returning capital and concentrating ownership. Companies that keep issuing shares are diluting you even if the stock price rises." },
  { term: "Dividend payout trend", full: "Dividend as % of profit, trend", explain: "Dividend payout ratio from earliest to latest year (shown as X% → Y%). A steadily growing dividend from genuine profit is a good signal. A very high payout (80%+) might mean little is being reinvested — either a mature business or one that can't find good uses for cash. Zero payout isn't necessarily bad if the company is reinvesting profitably (check retained earnings ratio)." },
  { term: "Retained earnings ratio", full: "Buffett retained earnings ratio", explain: "For every rupee the company kept (profit minus dividends) over the measurement period, how much did book equity grow? Above 1.0x means management is compounding the capital it retains. This app uses book equity change as a proxy since historical market cap data isn't available from the free data source — so it's an approximation of the market-cap version Buffett uses." },

  // Qualitative
  { term: "Moat", full: "Competitive advantage / economic moat", explain: "What protects a business from competitors over time. Types: pricing power (can raise prices without losing customers), brand recognition, IP/patents, switching costs (expensive to change supplier), regulatory barriers, network effects (product gets better as more people use it). The wider and deeper the moat, the more durable the returns — and the more confident you can be holding through a rough quarter." },
  { term: "Market position", full: "Competitive position in its industry", explain: "Market leader, top-3 player, or commodity/undifferentiated. Leaders can charge premiums, get better supplier terms, attract better talent, and attract analyst coverage — all compounding advantages. A commodity player with no pricing power is in a fundamentally different (worse) competitive position regardless of how good the recent results look." },

  // General
  { term: "CAGR", full: "Compound Annual Growth Rate", explain: "The consistent annual rate that gets you from a starting value to an ending value over N years. ₹100 at 15% CAGR for 5 years = ₹201 (not ₹175 from simple interest). Used for EPS CAGR, FCF CAGR, and revenue growth because compounding is how wealth actually works." },
  { term: "TTM", full: "Trailing 12 Months", explain: "The sum of the last four quarters — a rolling annual figure more current than the last full fiscal year. P/E (TTM) uses the most recent 12 months of earnings so it captures the latest quarter's results rather than waiting for the annual report." },
  { term: "YoY", full: "Year on Year", explain: "Comparing a period with the same period in the prior year. Q1 FY27 revenue YoY = Q1 FY27 ÷ Q1 FY26 − 1. More meaningful than quarter-on-quarter (QoQ) because it removes seasonal effects — essential for any business with seasonal patterns (festive season retailers, monsoon-linked agriculture, etc.)." },
  { term: "FII", full: "Foreign Institutional Investor", explain: "Large investment funds from outside India — sovereign wealth funds, pension funds, global asset managers. FII inflows and outflows can move markets significantly. Shown in the shareholding pattern as a separate category. Rising FII holding can indicate growing international institutional interest in a company." },
  { term: "DII", full: "Domestic Institutional Investor", explain: "Large Indian funds — mutual funds, insurance companies, provident funds, NPS. MF is a subset of DII and is sometimes shown separately. DII buying often reflects domestic retail money flowing into markets through SIPs." },
  { term: "NSE / BSE", full: "National Stock Exchange / Bombay Stock Exchange", explain: "India's two main stock exchanges. Most large companies dual-list on both. This app uses NSE ticker symbols (e.g. CAPLIPOINT) for indianapi and Yahoo Finance data, and BSE scrip codes internally for price lookups." },
  { term: "Corporate actions", full: "Dividends, splits, bonus shares", explain: "Dividends: cash paid to shareholders out of profit. Stock splits: number of shares increases, price falls proportionally (total value unchanged). Bonus shares: free shares issued to existing shareholders, also value-neutral. All three are visible in the Corporate Actions section of each stock, sourced from indianapi." },
  { term: "TAM", full: "Total Addressable Market", explain: "The total market size if a company captured 100% of its opportunity. A large TAM matters most for fast-growing companies — a ₹500 Cr business in a ₹50,000 Cr market has a very different growth ceiling than one in a ₹600 Cr niche market. Relevant when deciding whether a strong track record can continue." },
];

// ── REIT / InvIT reference data ─────────────────────────────────────
// Edit values here to update figures — no logic to touch.
const REIT_DATA = {
  lastUpdated: "Aug 2026",
  investmentAmount: 100000,  // ₹1L

  // Comparison table columns (3 columns, no small finance bank)
  columns: [
    { key: "fd",    label: "FD",    example: "SBI / HDFC / ICICI" },
    { key: "reit",  label: "REIT",  example: "Embassy + Mindspace + Brookfield" },
    { key: "invit", label: "InvIT", example: "IndiGrid + PowerGrid + IRB" },
  ],

  // Each row: label, values per column key, and optional styling hint
  rows: [
    { label: "Current rate / yield",      fd: "6.45–6.80%",    reit: "6–7%",         invit: "9–12%" },
    { label: "Annual income on ₹1L",      fd: "₹6,450–6,800", reit: "₹6,500",       invit: "₹10,000" },
    { label: "Quarterly income",           fd: "₹1,613–1,700", reit: "₹1,625",       invit: "₹2,500" },
    { label: "Tax — zero tax person",      fd: "₹0 (87A)",      reit: "₹0 (mostly tax-free distribution)", invit: "₹0 (87A wipes interest)" },
    { label: "Post-tax income (zero tax)", fd: "₹6,450–6,800", reit: "₹6,500",       invit: "₹10,000", highlight: "invit" },
    { label: "Tax — 30% slab",            fd: "₹1,935–2,040",  reit: "~₹1,000 (only dividend portion taxed)", invit: "~₹2,100" },
    { label: "Post-tax income (30% slab)",fd: "₹4,515–4,760", reit: "~₹5,500",       invit: "~₹7,900", highlight: "invit" },
    { label: "Capital at year 5",         fd: "₹1,00,000",     reit: "~₹1,19,400",   invit: "~₹1,08,200", highlight: "reit" },
    { label: "Capital at year 10",        fd: "₹1,00,000",     reit: "~₹1,41,000",   invit: "~₹1,15,000", highlight: "reit" },
    { label: "Total cash income (10 yr)", fd: "₹64,500–68,000",reit: "~₹80,000 (growing)", invit: "~₹1,17,000 (growing)", highlight: "invit" },
    { label: "Total value at year 10",    fd: "₹1,64,500",     reit: "~₹2,21,000",   invit: "~₹2,32,000", highlight: "invit" },
    { label: "Effective CAGR (10 yr)",    fd: "~5.1%",          reit: "~8.2%",         invit: "~8.8%", highlight: "invit" },
    { label: "Liquidity",                 fd: "❌ Penalty on early exit", reit: "✅ Daily on exchange", invit: "✅ Daily on exchange", highlight: "reit" },
    { label: "Capital at risk",           fd: "✅ Zero (DICGC ₹5L)", reit: "⚠ Unit price can fall", invit: "⚠ Unit price can fall" },
    { label: "Income growth over time",   fd: "❌ Fixed rate",   reit: "✅ Rent escalations ~5% p.a.", invit: "✅ Traffic/tariff growth 3–5%", highlight: "reit" },
    { label: "Inflation protection",      fd: "❌ Weak",         reit: "✅ Moderate",   invit: "✅ Moderate", highlight: "reit" },
    { label: "Reinvestment risk",         fd: "❌ High (rate changes at renewal)", reit: "✅ Low", invit: "✅ Low", highlight: "reit" },
  ],

  // Taxation detail
  taxation: [
    { component: "Dividend portion",        reit: "Taxable at slab rate", invit: "Taxable at slab rate", note: "Like regular dividend income" },
    { component: "Interest portion",        reit: "Taxable at slab rate", invit: "Taxable at slab rate", note: "Like FD interest" },
    { component: "Return of capital",       reit: "Not taxed (reduces cost basis)", invit: "Not taxed (reduces cost basis)", note: "Unique advantage — tax-deferred" },
    { component: "LTCG on unit sale",       reit: "12.5% above ₹1.25L exemption", invit: "12.5% above ₹1.25L exemption", note: "Like equity LTCG" },
    { component: "STCG on unit sale",       reit: "20%", invit: "20%", note: "Like equity STCG" },
    { component: "TDS on distributions",    reit: "10% deducted at source", invit: "10% deducted at source", note: "Claimable in ITR" },
    { component: "Holding period for LTCG", reit: "36 months", invit: "36 months", note: "Longer than equity (12 months)" },
  ],

  // Instruments
  instruments: [
    // REITs
    { name: "Embassy Office Parks REIT", type: "REIT", assets: "Office (IT parks)", trailYield: "6.2%", sponsor: "Embassy Group & Blackstone", risk: "Office occupancy tied to IT sector hiring cycles", ticker: "EMBASSY" },
    { name: "Mindspace Business Parks REIT", type: "REIT", assets: "Office (IT parks)", trailYield: "6.0%", sponsor: "K Raheja Corp & Blackstone", risk: "Concentration in Hyderabad and Mumbai", ticker: "MINDSPACE" },
    { name: "Brookfield India Real Estate Trust", type: "REIT", assets: "Office", trailYield: "6.8%", sponsor: "Brookfield Asset Management", risk: "Single-tenant concentration in some properties", ticker: "BIRET" },
    { name: "Nexus Select Trust", type: "REIT", assets: "Retail malls", trailYield: "5.9%", sponsor: "Blackstone", risk: "Retail consumption slowdown; e-commerce shift", ticker: "NEXUS" },
    // INVITs
    { name: "IndiGrid InvIT", type: "InvIT", assets: "Power transmission lines", trailYield: "11.5%", sponsor: "Sterlite Power", risk: "Revenue capped by CERC regulations; refinancing risk", ticker: "INDIGRID" },
    { name: "PowerGrid Infrastructure InvIT", type: "InvIT", assets: "Power transmission lines", trailYield: "10.8%", sponsor: "Power Grid Corp of India (Govt)", risk: "Regulated returns; low but stable", ticker: "POWERGRID" },
    { name: "IRB InvIT Fund", type: "InvIT", assets: "Highways / toll roads", trailYield: "9.5%", sponsor: "IRB Infrastructure", risk: "Traffic volume risk; toll policy changes", ticker: "IRB" },
    { name: "Bharat Highways InvIT", type: "InvIT", assets: "Highways / toll roads", trailYield: "10.2%", sponsor: "NHAI / GIC Singapore", risk: "Newer trust; limited track record", ticker: "BHARATHIG" },
    { name: "India Highways Management", type: "InvIT", assets: "Highways", trailYield: "9.8%", sponsor: "NHAI", risk: "Government-owned; stable but low upside", ticker: "IHC" },
    { name: "Highways Infrastructure Trust", type: "InvIT", assets: "Highways / toll roads", trailYield: "10.0%", sponsor: "NHAI", risk: "Portfolio concentrated in 3–4 corridors", ticker: "HIIT" },
  ],
};

const helpScreen = {
  async render() {
    return `
      <div class="screen-padding">
        <div class="screen-title">Help & reference</div>

        <!-- Mode toggle -->
        <div class="toggle-row" style="margin-bottom:16px;">
          <button id="help-tab-buffett" class="toggle-btn toggle-btn-active">Buffett Model</button>
          <button id="help-tab-reit"    class="toggle-btn">REIT / InvIT</button>
        </div>

        <!-- ══ BUFFETT TAB ══════════════════════════════════════════════ -->
        <div id="help-buffett-panel">
          <!-- Buffett model primer -->
          <div class="section-label">The Buffett model — how this app thinks</div>
        <div class="card" style="margin-bottom:14px;">
          <div style="font-size:13px; line-height:1.7;">
            <p style="margin:0 0 12px;">Warren Buffett's investing approach, refined with Charlie Munger, focuses on buying <strong>wonderful businesses at fair prices</strong> and holding them for the long term — ideally forever. The goal is not to trade prices but to own pieces of exceptional businesses that compound your capital year after year.</p>

            <div class="section-label" style="margin:0 0 8px; font-size:10px;">THE CENTRAL QUESTION</div>
            <div style="background:var(--color-bg); border-radius:var(--radius-md); padding:10px 14px; margin-bottom:14px; border-left:3px solid var(--color-green);">
              <em style="font-size:13px; color:var(--color-text);">"Would I own this business for 10 years if the stock market shut down tomorrow?"</em>
              <div class="muted" style="font-size:11px; margin-top:4px;">If yes, the price fluctuations stop mattering. You own the earnings power of the business.</div>
            </div>

            <div class="section-label" style="margin:0 0 8px; font-size:10px;">PRINCIPLE 1 — ECONOMIC MOAT</div>
            <p style="margin:0 0 10px;">A moat is what protects a business from competition over time. Without a moat, profits attract competitors who erode them. Moat types: <strong>pricing power</strong> (customers pay up without complaint), <strong>switching costs</strong> (painful to change supplier), <strong>network effects</strong> (product gets better as more people use it), <strong>cost advantages</strong> (structurally cheaper to operate), <strong>intangibles</strong> (brands, patents, regulatory licences). The wider and more durable the moat, the more confidently you can hold through bad quarters.</p>

            <div class="section-label" style="margin:0 0 8px; font-size:10px;">PRINCIPLE 2 — MANAGEMENT QUALITY</div>
            <p style="margin:0 0 10px;">Buffett looks for managers who think and act like owners. Signals: <strong>promoter skin in the game</strong> (high and stable holding), <strong>rational capital allocation</strong> (reinvesting at high returns or returning cash when no good use exists), <strong>honest communication</strong> (acknowledge mistakes, explain clearly), and <strong>no empire-building</strong> (not issuing shares unnecessarily or making value-destroying acquisitions).</p>

            <div class="section-label" style="margin:0 0 8px; font-size:10px;">PRINCIPLE 3 — FINANCIAL STRENGTH</div>
            <p style="margin:0 0 10px;">Great businesses don't need debt to earn great returns. <strong>ROE above 15% without heavy leverage</strong> means the business genuinely earns high returns on its own capital. <strong>Consistent EPS growth</strong> (6/6 earnings consistency) means the business is reliable, not cyclical. <strong>Low D/E</strong> means it can survive recessions without distress. <strong>Cash EPS gap</strong> confirms profits are real — actual cash, not accounting fiction.</p>

            <div class="section-label" style="margin:0 0 8px; font-size:10px;">PRINCIPLE 4 — FAIR PRICE</div>
            <p style="margin:0 0 10px;">Even a wonderful business is a bad investment at an absurd price. Buffett looks for a <strong>margin of safety</strong> — paying less than what the business is worth, so you're protected even if your analysis is imperfect. This app shows P/E vs Sector P/E as a starting point. A business growing at 20% EPS CAGR trading at 25x P/E is likely cheaper than one growing at 5% at 18x.</p>

            <div class="section-label" style="margin:0 0 8px; font-size:10px;">PRINCIPLE 5 — CIRCLE OF COMPETENCE</div>
            <p style="margin:0 0 10px;">Only invest in businesses you genuinely understand — how they make money, why customers choose them, what could go wrong. Buffett's famously avoided tech companies for decades because he couldn't reliably predict their competitive position. The thesis field in this app is for you to articulate this: if you can't write it down in plain language, you probably don't understand it well enough yet.</p>

            <div class="section-label" style="margin:0 0 8px; font-size:10px;">THIS APP'S CHECKLIST — HOW IT MAPS</div>
            <table style="width:100%; border-collapse:collapse; font-size:12px;">
              <tbody>
                <tr style="border-bottom:0.5px solid var(--color-border);">
                  <td style="padding:6px 0; font-weight:500;">ROE ≥ 15%</td>
                  <td style="padding:6px 4px; color:var(--color-text-secondary);">Hard flag. Measures capital efficiency — the core of a high-return business.</td>
                </tr>
                <tr style="border-bottom:0.5px solid var(--color-border);">
                  <td style="padding:6px 0; font-weight:500;">D/E ≤ 0.2</td>
                  <td style="padding:6px 4px; color:var(--color-text-secondary);">Hard flag. Buffett strongly avoids businesses that need debt to earn good returns.</td>
                </tr>
                <tr style="border-bottom:0.5px solid var(--color-border);">
                  <td style="padding:6px 0; font-weight:500;">Promoter not declining</td>
                  <td style="padding:6px 4px; color:var(--color-text-secondary);">Hard flag. Founders selling signals loss of conviction — or financial stress.</td>
                </tr>
                <tr style="border-bottom:0.5px solid var(--color-border);">
                  <td style="padding:6px 0; font-weight:500;">EPS CAGR ≥ 12%</td>
                  <td style="padding:6px 4px; color:var(--color-text-secondary);">Soft flag. Earnings must compound meaningfully to beat inflation + opportunity cost.</td>
                </tr>
                <tr style="border-bottom:0.5px solid var(--color-border);">
                  <td style="padding:6px 0; font-weight:500;">Earnings consistency ≥ 5/6</td>
                  <td style="padding:6px 4px; color:var(--color-text-secondary);">Soft flag. Reliability over time is more valuable than one great year.</td>
                </tr>
                <tr>
                  <td style="padding:6px 0; font-weight:500;">Retained earnings ratio ≥ 1.0×</td>
                  <td style="padding:6px 4px; color:var(--color-text-secondary);">Soft flag. Every rupee retained should create at least ₹1 of value — management is compounding for you.</td>
                </tr>
              </tbody>
            </table>
            <div class="muted" style="font-size:11px; margin-top:8px;">3 or more soft flags = verdict No. Any hard flag = verdict No regardless of soft flags. The verdict is a starting point, not a final answer — use your judgement, especially on the moat and management quality, which no algorithm can fully capture.</div>
          </div>
        </div>

        <!-- Glossary search -->
        <div class="section-label">Metric glossary</div>
        <div class="muted" style="margin-bottom:10px; font-size:12px;">Plain explanations for every metric and term used in this app.</div>
        <div class="glossary-search-wrap">
          <input type="text" id="glossary-search" placeholder="Search — try 'quarterly', 'PAT', 'moat'..." />
        </div>
        <div id="glossary-list" class="glossary-list"></div>
        </div><!-- end help-buffett-panel -->

        <div id="help-reit-panel" style="display:none;"></div>

      </div>`;
  },

  async afterRender() {
    // ── REIT panel — built in afterRender to avoid nested backtick issues ──
    function buildReitPanel() {
      const d = REIT_DATA;
      const disclaimer = '<div class="muted" style="font-size:11px;margin-bottom:12px;padding:8px 12px;background:var(--color-bg);border-radius:var(--radius-md);border-left:3px solid var(--color-green);">'
        + '⚠ Data as of ' + d.lastUpdated + '. Yields and capital values are indicative based on historical performance — verify before investing. Past performance is not a guarantee of future returns.</div>';

      // Section 1: What are REITs — expanded by default
      const whatSection = '<div class="section-label collapsible-header" id="reit-what-header" style="cursor:pointer;display:flex;justify-content:space-between;">What are REITs &amp; InvITs? <span class="muted" style="font-size:11px;" id="reit-what-chev">▼ collapse</span></div>'
        + '<div id="reit-what-panel" style="display:block;"><div class="card" style="font-size:13px;line-height:1.7;margin-bottom:14px;">'
        + '<p style="margin:0 0 10px;"><strong>REIT (Real Estate Investment Trust)</strong> — a listed entity that owns income-generating commercial real estate: office parks, malls, warehouses. By law it must distribute at least 90% of its income to unit-holders every quarter. You earn rent without owning property directly.</p>'
        + '<p style="margin:0 0 10px;"><strong>InvIT (Infrastructure Investment Trust)</strong> — same structure, but owns infrastructure assets: highways, power transmission lines, gas pipelines. Income comes from tolls, tariffs, and capacity charges rather than rent.</p>'
        + '<p style="margin:0 0 10px;"><strong>How you invest:</strong> Buy units on the stock exchange like shares. Minimum is 1 unit (typically ₹200–₹500 after SEBI\'s 2023 reforms). Units trade daily — you can exit anytime at market price.</p>'
        + '<p style="margin:0 0 10px;"><strong>Two sources of return:</strong> (1) Quarterly distributions — your "rental income." (2) Unit price appreciation as assets grow in value over time. Total return = distributions + price change.</p>'
        + '<p style="margin:0 0 0;"><strong>Key difference from stocks:</strong> You\'re not betting on business growth or market share. You\'re buying a predictable stream of income from physical assets with long-term contracts. Lower growth potential than quality equity, but more stable income than FD with better inflation protection.</p>'
        + '</div></div>';

      // Section 2: Comparison table
      const colHeaders = d.columns.map(c =>
        '<th style="padding:8px 8px;text-align:right;font-weight:600;border-bottom:1px solid var(--color-border);">'
        + c.label + '<br><span style="font-size:10px;font-weight:400;color:var(--color-text-tertiary);">' + c.example + '</span></th>'
      ).join('');

      const tableRows = d.rows.map((row, i) => {
        const bg = i % 2 === 0 ? '' : 'background:rgba(0,0,0,0.02);';
        let tr = '<tr style="border-bottom:0.5px solid var(--color-border);' + bg + '">'
          + '<td style="padding:7px 10px;color:var(--color-text-secondary);">' + row.label + '</td>';
        d.columns.forEach(c => {
          const win = row.highlight === c.key;
          tr += '<td style="padding:7px 8px;text-align:right;' + (win ? 'color:var(--color-green);font-weight:600;' : '') + '">' + (row[c.key] || '—') + '</td>';
        });
        return tr + '</tr>';
      }).join('');

      const compareSection = '<div class="section-label collapsible-header" id="reit-compare-header" style="cursor:pointer;display:flex;justify-content:space-between;">₹1L investment comparison <span class="muted" style="font-size:11px;" id="reit-compare-chev">▶ expand</span></div>'
        + '<div id="reit-compare-panel" style="display:none;">'
        + '<div class="card" style="padding:0;overflow:hidden;margin-bottom:6px;"><div style="overflow-x:auto;">'
        + '<table style="width:100%;min-width:420px;border-collapse:collapse;font-size:12px;"><thead>'
        + '<tr style="background:var(--color-bg);"><th style="padding:8px 10px;text-align:left;font-weight:500;color:var(--color-text-secondary);border-bottom:1px solid var(--color-border);width:38%;">Factor</th>'
        + colHeaders + '</tr></thead><tbody>' + tableRows + '</tbody></table></div></div>'
        + '<div class="muted" style="font-size:11px;margin-bottom:14px;">* Capital appreciation figures assume REIT ~3.5% p.a. price growth, InvIT ~1.5% p.a. Green = better value on that row. FD capital stays ₹1L — no growth. DICGC insurance covers up to ₹5L per bank.</div>'
        + '</div>';

      // Section 3: Taxation
      const taxRows = d.taxation.map((t, i) => {
        const bg = i % 2 === 0 ? '' : 'background:rgba(0,0,0,0.02);';
        return '<tr style="border-bottom:0.5px solid var(--color-border);' + bg + '">'
          + '<td style="padding:7px 10px;font-weight:500;">' + t.component + '</td>'
          + '<td style="padding:7px 8px;">' + t.reit + '</td>'
          + '<td style="padding:7px 8px;">' + t.invit + '</td>'
          + '<td style="padding:7px 8px;color:var(--color-text-tertiary);">' + t.note + '</td></tr>';
      }).join('');

      const taxSection = '<div class="section-label collapsible-header" id="reit-tax-header" style="cursor:pointer;display:flex;justify-content:space-between;">Taxation <span class="muted" style="font-size:11px;" id="reit-tax-chev">▶ expand</span></div>'
        + '<div id="reit-tax-panel" style="display:none;">'
        + '<div class="card" style="padding:0;overflow:hidden;margin-bottom:6px;"><div style="overflow-x:auto;">'
        + '<table style="width:100%;border-collapse:collapse;font-size:12px;"><thead>'
        + '<tr style="background:var(--color-bg);">'
        + '<th style="padding:8px 10px;text-align:left;font-weight:500;color:var(--color-text-secondary);border-bottom:1px solid var(--color-border);">Component</th>'
        + '<th style="padding:8px 8px;text-align:left;font-weight:600;border-bottom:1px solid var(--color-border);">REIT</th>'
        + '<th style="padding:8px 8px;text-align:left;font-weight:600;border-bottom:1px solid var(--color-border);">InvIT</th>'
        + '<th style="padding:8px 8px;text-align:left;font-weight:500;color:var(--color-text-secondary);border-bottom:1px solid var(--color-border);">Note</th>'
        + '</tr></thead><tbody>' + taxRows + '</tbody></table></div></div>'
        + '<div class="muted" style="font-size:11px;margin-bottom:14px;">Each quarterly distribution is split into components (dividend / interest / return of capital) declared by the trust. Check the distribution notice to know the exact breakdown for tax filing.</div>'
        + '</div>';

      // Section 4: Instruments
      let instCards = '';
      ['REIT','InvIT'].forEach(type => {
        instCards += '<div class="section-label" style="margin-top:8px;margin-bottom:6px;">' + type + 's</div>';
        d.instruments.filter(i => i.type === type).forEach(inst => {
          instCards += '<div class="card" style="margin-bottom:8px;">'
            + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">'
            + '<div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:600;">' + inst.name + '</div>'
            + '<div class="muted" style="font-size:11px;">' + inst.assets + ' · ' + inst.sponsor + '</div></div>'
            + '<div style="text-align:right;flex-shrink:0;"><div style="font-size:14px;font-weight:600;color:var(--color-green);">' + inst.trailYield + '</div>'
            + '<div class="muted" style="font-size:10px;">trailing yield</div></div></div>'
            + '<div style="margin-top:8px;padding-top:6px;border-top:0.5px solid var(--color-border);font-size:11px;color:var(--color-text-secondary);">⚠ ' + inst.risk + '</div>'
            + '</div>';
        });
      });

      const instSection = '<div class="section-label collapsible-header" id="reit-inst-header" style="cursor:pointer;display:flex;justify-content:space-between;">Listed REITs &amp; InvITs <span class="muted" style="font-size:11px;" id="reit-inst-chev">▶ expand</span></div>'
        + '<div id="reit-inst-panel" style="display:none;margin-bottom:16px;">' + instCards + '</div>';

      document.getElementById('help-reit-panel').innerHTML = disclaimer + whatSection + compareSection + taxSection + instSection;
    }

    buildReitPanel();

    // ── Tab toggle ────────────────────────────────────────────────────
    const buffettBtn   = document.getElementById("help-tab-buffett");
    const reitBtn      = document.getElementById("help-tab-reit");
    const buffettPanel = document.getElementById("help-buffett-panel");
    const reitPanel    = document.getElementById("help-reit-panel");

    buffettBtn.addEventListener("click", () => {
      buffettPanel.style.display = ""; reitPanel.style.display = "none";
      buffettBtn.classList.add("toggle-btn-active"); reitBtn.classList.remove("toggle-btn-active");
    });
    reitBtn.addEventListener("click", () => {
      reitPanel.style.display = ""; buffettPanel.style.display = "none";
      reitBtn.classList.add("toggle-btn-active"); buffettBtn.classList.remove("toggle-btn-active");
    });

    // ── REIT collapsibles ─────────────────────────────────────────────
    [["reit-what-header",    "reit-what-chev",    "reit-what-panel"],
     ["reit-compare-header", "reit-compare-chev", "reit-compare-panel"],
     ["reit-tax-header",     "reit-tax-chev",     "reit-tax-panel"],
     ["reit-inst-header",    "reit-inst-chev",    "reit-inst-panel"],
    ].forEach(([hId, cId, pId]) => {
      document.getElementById(hId).addEventListener("click", () => {
        const panel = document.getElementById(pId);
        const chev  = document.getElementById(cId);
        const open  = panel.style.display !== "none";
        panel.style.display = open ? "none" : "block";
        chev.textContent    = open ? "▶ expand" : "▼ collapse";
      });
    });

    // ── Glossary (Buffett tab) ────────────────────────────────────────
    function renderList(filter) {
      const f = (filter || "").toLowerCase();
      const items = GLOSSARY.filter(
        (g) => !f || g.term.toLowerCase().includes(f) || g.full.toLowerCase().includes(f) || g.explain.toLowerCase().includes(f)
      );
      document.getElementById("glossary-list").innerHTML =
        items.length === 0
          ? '<div class="empty-state">No matching terms.</div>'
          : items.map((g) => `
            <div class="glossary-card">
              <div class="glossary-term">${g.term} <span class="muted">— ${g.full}</span></div>
              <div class="glossary-explain">${g.explain}</div>
            </div>`).join("");
    }
    renderList("");
    document.getElementById("glossary-search").addEventListener("input", (e) => renderList(e.target.value));
  },
};

registerScreen("help", helpScreen);
