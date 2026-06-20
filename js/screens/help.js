/**
 * screens/help.js
 *
 * Plain-language glossary of every metric/acronym used in the app.
 * Lives in the bottom nav since these terms appear constantly across
 * the watchlist, detail, and portfolio screens — having a dedicated,
 * findable explanation beats hover-tooltips for something this dense.
 */

const GLOSSARY = [
  { term: "ROE", full: "Return on Equity", explain: "How much profit a company makes for every rupee shareholders have invested in it. Higher generally means the business is good at turning your money into profit." },
  { term: "ROCE", full: "Return on Capital Employed", explain: "Similar to ROE, but looks at all the money used to run the business — including borrowed money, not just shareholders' money. Useful for comparing companies that use different amounts of debt." },
  { term: "D/E", full: "Debt to Equity", explain: "How much a company has borrowed compared to what shareholders own. A low number means the company isn't relying much on loans — safer in tough times." },
  { term: "EPS", full: "Earnings Per Share", explain: "The company's profit divided by the number of shares. If EPS is growing steadily, the company is becoming more profitable on a per-share basis." },
  { term: "EPS CAGR", full: "EPS Compound Annual Growth Rate", explain: "How fast EPS has grown each year, on average, over several years. Smooths out one good or bad year to show the real trend." },
  { term: "P/E", full: "Price to Earnings ratio", explain: "The share price divided by EPS. Tells you how many years of current profit it would take to 'pay back' the share price — a rough way to judge if a stock is expensive or cheap." },
  { term: "PEG", full: "Price/Earnings to Growth ratio", explain: "P/E divided by the growth rate. Helps check whether a high P/E is justified by fast growth, or just expensive for no reason." },
  { term: "OCF", full: "Operating Cash Flow", explain: "The actual cash a company generates from its core business — separate from accounting profit, which can include non-cash items." },
  { term: "Cash EPS gap", full: "Operating Cash Flow per share minus EPS", explain: "Checks whether reported profit is backed by real cash. If cash flow per share is well below EPS for a long time, profits may be more 'on paper' than real." },
  { term: "FCF", full: "Free Cash Flow", explain: "The cash left over after a company pays for its operations and any equipment/infrastructure it needs. This is money that's truly free to pay dividends, buy back shares, or reinvest." },
  { term: "FCF Yield", full: "Free Cash Flow Yield", explain: "Free cash flow compared to the company's total market value. Higher generally means you're paying less for each rupee of real cash the business generates." },
  { term: "Promoter holding", full: "Promoter shareholding %", explain: "How much of the company the founders/promoters still own. Higher often means they're more invested in the company doing well long-term." },
  { term: "Promoter pledging", full: "Pledged promoter shares", explain: "Shares the promoters have used as collateral for a personal loan. Any pledging is a caution flag — it means promoters have financial pressure that could affect their decisions or force a sale." },
  { term: "Retained earnings ratio", full: "Buffett retained earnings ratio", explain: "Compares the profit a company kept and reinvested over many years against how much its market value actually grew in that time. Above 1.0 suggests management is turning reinvested profit into real value for shareholders." },
  { term: "Intrinsic value (IV)", full: "Intrinsic Value", explain: "Your own estimate of what a business is really worth, separate from its current stock price. The whole idea of 'value investing' is buying below this number, with room to spare in case your estimate is off." },
  { term: "Margin of safety", full: "Margin of Safety", explain: "Buying a stock well below your estimate of its intrinsic value, so you still come out fine even if your analysis was a bit too optimistic." },
  { term: "DCF", full: "Discounted Cash Flow", explain: "A method of estimating intrinsic value by predicting a company's future cash and figuring out what that's worth in today's money." },
  { term: "CAGR", full: "Compound Annual Growth Rate", explain: "The smoothed-out yearly growth rate between two points in time — used instead of a simple average because growth compounds." },
  { term: "Market cap", full: "Market Capitalization", explain: "The total value of all the company's shares put together — share price multiplied by number of shares." },
  { term: "52-week range", full: "52-week high/low", explain: "The highest and lowest price the stock has touched in the last year." },
  { term: "Bulk/block deal", full: "Bulk or Block Deal", explain: "A very large trade in a stock, usually by a big institution or promoter, reported separately from normal trading. Worth noticing because it can signal a big investor's change of opinion." },
  { term: "FII", full: "Foreign Institutional Investor", explain: "Big investment funds from outside India that buy and sell Indian stocks." },
  { term: "DII", full: "Domestic Institutional Investor", explain: "Big Indian investment funds (mutual funds, insurance companies, etc.) that buy and sell Indian stocks." },
  { term: "TAM", full: "Total Addressable Market", explain: "The total size of the market a company could possibly sell into, if it captured 100% of it. A bigger TAM means more room to keep growing." },
  { term: "NSE / BSE", full: "National / Bombay Stock Exchange", explain: "The two main stock exchanges in India where shares are bought and sold." },
];

const helpScreen = {
  async render() {
    return `
      <div class="screen-padding">
        <div class="screen-title">Help & glossary</div>
        <div class="muted" style="margin-bottom:12px;">Plain explanations for the terms used across this app.</div>
        <div class="glossary-search-wrap">
          <input type="text" id="glossary-search" placeholder="Search a term..." />
        </div>
        <div id="glossary-list" class="glossary-list"></div>
      </div>`;
  },

  async afterRender() {
    function renderList(filter) {
      const f = (filter || "").toLowerCase();
      const items = GLOSSARY.filter(
        (g) => !f || g.term.toLowerCase().includes(f) || g.full.toLowerCase().includes(f) || g.explain.toLowerCase().includes(f)
      );
      document.getElementById("glossary-list").innerHTML =
        items.length === 0
          ? '<div class="empty-state">No matching terms.</div>'
          : items
              .map(
                (g) => `
            <div class="glossary-card">
              <div class="glossary-term">${g.term} <span class="muted">— ${g.full}</span></div>
              <div class="glossary-explain">${g.explain}</div>
            </div>`
              )
              .join("");
    }
    renderList("");
    document.getElementById("glossary-search").addEventListener("input", (e) => renderList(e.target.value));
  },
};

registerScreen("help", helpScreen);
